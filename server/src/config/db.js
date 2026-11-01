import mongoose from 'mongoose';
import { env, isVercel } from './env.js';

mongoose.set('strictQuery', true);

let connectionPromise = null;

/**
 * Opens the shared Mongoose connection. Safe to call repeatedly.
 * @param {string} [uri] override, mainly used by tests
 */
export async function connectDB(uri = env.MONGO_URI) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('❌ MongoDB error:', err.message);
  });

  connectionPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: isVercel ? 5_000 : 10_000,
    maxPoolSize: isVercel ? 5 : 20,
    // Never let Mongoose build indexes on its own in production.
    //
    // `autoIndex` is what makes uniqueness real — the duplicate-follow guard,
    // the unique email and username, the single-use verification tokens are all
    // *database* constraints, not application logic. But building them
    // implicitly at boot is unpredictable: it fires a burst of DDL against a
    // production cluster on every cold start, and it silently does nothing once
    // a process has already registered its models, so a restored or freshly
    // provisioned database can come up with no constraints at all. `syncIndexes`
    // below makes it explicit and repeatable instead, and — in production —
    // additive, so it can never drop a constraint this app depends on.
    autoIndex: env.NODE_ENV === 'development' || env.NODE_ENV === 'test',
  }).then(() => {
    // eslint-disable-next-line no-console
    console.log(`✅ MongoDB connected → ${mongoose.connection.name}`);
    return mongoose.connection;
  }).catch((err) => {
    connectionPromise = null;
    throw err;
  });

  return connectionPromise;
}

/**
 * Resolved index-reconciliation mode.
 *
 * Production defaults to `create` (additive only) so that deploying a schema
 * change can never silently drop a live unique constraint — the boot is not a
 * migration nobody approved. Development and test default to `sync`, where a
 * full reconcile is convenient and the worst case is re-seeding a local
 * database. Either way `INDEX_SYNC` overrides it explicitly.
 */
export const indexSyncMode = env.INDEX_SYNC ?? (env.NODE_ENV === 'production' ? 'create' : 'sync');

/**
 * Ensures every declared index actually exists in the database.
 *
 * In `create` mode this is additive: missing indexes are built, existing ones
 * are left untouched, and nothing is ever dropped. That matters because the
 * uniqueness guarantees this project relies on (duplicate follows, duplicate
 * email, single-use verification tokens, per-event notifications) are *database*
 * constraints, and a boot that drops one of them degrades correctness quietly.
 *
 * In `sync` mode it also drops indexes no longer declared by the schema.
 *
 * Idempotent either way, and exposed as `npm run db:indexes` for a deploy step.
 *
 * Fails loudly rather than continuing. A server whose uniqueness constraints
 * did not get created is a server that will accept duplicate email addresses
 * and duplicate follows, and it would do so quietly.
 */
/**
 * Index names currently on a collection, or an empty set if the collection does
 * not exist yet.
 *
 * A fresh or freshly-dropped database has no collections at all, and
 * `listIndexes` against a non-existent namespace is a hard error rather than an
 * empty list. That error has to be treated as "no indexes" here, because the
 * whole point of this function is to create them — a boot against an empty
 * database is a normal first run, not a failure. The `createIndexes` call below
 * is what brings the collection into existence.
 *
 * @returns {Promise<Set<string>>}
 */
async function indexNames(model) {
  try {
    return new Set((await model.collection.indexes()).map((i) => i.name));
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) return new Set();
    throw err;
  }
}

let indexesSynced = false;

export async function syncIndexes() {
  if (indexesSynced) return;
  const models = mongoose.connection.models;
  const names = Object.keys(models);
  if (!names.length) return;

  const mode = indexSyncMode;

  const results = await Promise.all(
    names.map(async (name) => {
      const model = models[name];
      const before = await indexNames(model);

      if (mode === 'sync') {
        await model.syncIndexes();
      } else {
        // Additive only. `createIndexes` issues CREATE IF NOT EXISTS for every
        // declared index and, unlike syncIndexes, never drops anything.
        await model.createIndexes();
      }

      const after = await indexNames(model);
      const created = [...after].filter((n) => !before.has(n));
      const dropped = [...before].filter((n) => !after.has(n));

      return { name, created, dropped };
    }),
  );

  const created = results.flatMap((r) => r.created);
  const dropped = results.flatMap((r) => r.dropped);

  // eslint-disable-next-line no-console
  console.log(
    created.length
      ? `   indexes → created ${created.length}${mode === 'create' ? ' (additive)' : ''}: ${created.join(', ')}`
      : '   indexes → all present',
  );

  if (dropped.length) {
    // eslint-disable-next-line no-console
    console.log(`   indexes → dropped ${dropped.length}: ${dropped.join(', ')}`);
  }

  indexesSynced = true;
}

export async function disconnectDB() {
  connectionPromise = null;
  indexesSynced = false;
  await mongoose.connection.close();
}
