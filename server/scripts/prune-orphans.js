#!/usr/bin/env node
/**
 * Orphan audit and prune.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * A user account can disappear while rows that point at it survive: a test run
 * that registers and then deletes accounts, a manual `db.users.deleteOne()`
 * during debugging, an account-deletion sweep that has not finished. Nothing
 * cascades, because every reference is a plain `ObjectId` spread across a dozen
 * collections with no foreign-key constraint behind it.
 *
 * The damage is not cosmetic. A comment whose author no longer exists renders as
 * a row with no name and no avatar, because the client resolves the author by id
 * and has nothing to resolve. A `notifications` row pointing at a deleted
 * recipient is listed for nobody and read by nobody. A `follows` row with a
 * missing `following` keeps a ghost in somebody's follower count forever.
 *
 * ── Why the reference graph is derived, not written out ────────────────────
 *
 * The first version of this script hard-coded a table of (collection, field)
 * pairs. It reported a clean database on a database that had orphans in nine
 * collections, because six of them — `likes`, `savedposts`, `reports`,
 * `discussioncomments`, `eventregistrations`, `verificationtokens` — were never
 * in the table, and the array-typed references (`Post.likedBy`,
 * `Group.admins`, `Conversation.participants`, `Message.readBy`) were missed
 * entirely. A hard-coded table is a list that silently goes stale the first
 * time somebody adds a model.
 *
 * So the graph is read out of the Mongoose schemas themselves, by walking
 * `schema.obj` for any `ref:` and recording which collection it points at. A new
 * model with a reference is covered automatically, and the audit cannot disagree
 * with the models the application actually uses.
 *
 * ── Safety ─────────────────────────────────────────────────────────────────
 *
 *   1. Dry run is the DEFAULT. Without `--apply`, nothing is ever deleted.
 *   2. It refuses to run when NODE_ENV is production. Production orphans are a
 *      data-retention decision, not a cleanup chore.
 *   3. It refuses to run when MONGO_URI is unset. `scripts/cleanup.js` falls
 *      back to the *dev* database in that case, which is exactly how a
 *      maintenance script ends up issuing deletes against someone's working
 *      data. This script declines to inherit that fallback.
 *   4. The full plan is printed before anything is written.
 *
 * Usage:
 *   node scripts/prune-orphans.js                    # audit only (default)
 *   node scripts/prune-orphans.js --apply            # audit, then prune
 *   node scripts/prune-orphans.js --json             # machine-readable
 *   node scripts/prune-orphans.js --verbose          # name sample rows
 */
import mongoose from 'mongoose';
// Registers every model, so the schema walk below sees the whole graph.
import '../src/models/index.js';

// ── Refuse unsafe invocations ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  console.error(
    '✖ prune-orphans refuses to run with NODE_ENV=production.\n' +
      '  Orphaned rows in production are a data-retention decision that needs a\n' +
      '  human, a backup and a maintenance window. Point MONGO_URI at a staging\n' +
      '  database, or delete the specific rows by hand after taking a dump.',
  );
  process.exit(2);
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error(
    '✖ MONGO_URI is not set, so there is no way to tell which database this is.\n' +
      '  Refusing to guess. Export it explicitly, for example:\n' +
      '    MONGO_URI="mongodb://127.0.0.1:27017/campusconnect" node scripts/prune-orphans.js\n' +
      '  (Note: scripts/cleanup.js still defaults to the dev database when this is\n' +
      '  unset. That fallback is the hazard this script refuses to inherit.)',
  );
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const JSON_OUT = args.has('--json');
const VERBOSE = args.has('--verbose');

// ── Model name → collection name ───────────────────────────────────────────
const COLLECTION_OF = new Map(); // 'User' -> 'users'
for (const name of mongoose.modelNames()) {
  COLLECTION_OF.set(name, mongoose.model(name).collection.name);
}

function collectionForRef(ref) {
  if (typeof ref === 'string') return COLLECTION_OF.get(ref) ?? null;
  // A populated array/object can carry `ref` as an object form.
  if (ref && typeof ref === 'object' && typeof ref.ref === 'string') {
    return COLLECTION_OF.get(ref.ref) ?? null;
  }
  return null;
}

/**
 * Walks a schema definition for every `ref`, including array-typed and nested
 * ones. `schema.paths` is not enough: `Post.likedBy` is declared as
 * `[{ type: ObjectId, ref: 'User' }]` and does not surface there as a path with
 * `options.ref`, which is how the first draft missed it.
 *
 * Returns `{ field, pointsAt, many }` for each reference found.
 */
const MAX_DEPTH = 5;

function referencesIn(definition, prefix = '', depth = 0) {
  const found = [];

  // Mongoose schema definitions nest subdocuments, and a subdocument can hold a
  // path whose value is itself a schema-shaped object. Without a depth bound
  // the walk does not terminate. Nothing useful lives more than a couple of
  // levels down: `Conversation.lastMessage.sender` is the deepest real case.
  if (!definition || typeof definition !== 'object' || depth > MAX_DEPTH) return found;

  for (const [key, value] of Object.entries(definition)) {
    if (key === '_id') continue;
    const path = prefix ? `${prefix}.${key}` : key;

    if (Array.isArray(value)) {
      // `[{ type: ObjectId, ref: 'User' }]`
      for (const item of value) {
        const target = collectionForRef(item);
        if (target) found.push({ field: path, pointsAt: target, many: true });
      }
      continue;
    }

    if (value && typeof value === 'object') {
      // `ref: 'User'` directly, or `{ type: { ref: 'User' } }`
      const target = collectionForRef(value) ?? collectionForRef(value?.type);
      if (target) {
        found.push({ field: path, pointsAt: target, many: false });
        continue;
      }
      // A nested object schema: recurse, e.g. `Conversation.lastMessage.sender`.
      if (value.type && typeof value.type === 'object') {
        found.push(...referencesIn(value.type, path, depth + 1));
      } else {
        found.push(...referencesIn(value, path, depth + 1));
      }
    }
  }

  return found;
}

/** The whole graph: which collection holds which dangling-able references. */
function buildGraph() {
  const edges = [];
  for (const name of mongoose.modelNames()) {
    const model = mongoose.model(name);
    for (const ref of referencesIn(model.schema.obj)) {
      edges.push({ collection: model.collection.name, ...ref });
    }
  }
  return edges;
}

// ── Live ids ───────────────────────────────────────────────────────────────
/** Ids present in `collection`, or null if the collection does not exist. */
async function liveIds(collection) {
  const names = (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  if (!names.includes(collection)) return null;
  const rows = await mongoose.connection.db.collection(collection).find({}, { projection: { _id: 1 } }).toArray();
  return new Set(rows.map((d) => String(d._id)));
}

const existsCache = new Map();
async function collectionExists(collection) {
  if (existsCache.has(collection)) return existsCache.get(collection);
  const names = (await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name);
  const found = names.includes(collection);
  existsCache.set(collection, found);
  return found;
}

/** Normalises a field value (ObjectId, populated doc, raw id) to a string. */
function idOf(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value._id ? String(value._id) : null;
  return String(value);
}

/** Rows in `collection` with a dangling value at `field`. */
async function findOrphans(collection, field, alive, { many }) {
  if (!(await collectionExists(collection)) || !alive) return [];

  const rows = await mongoose.connection.db
    .collection(collection)
    .find(field.includes('.') ? {} : { [field]: { $ne: null } })
    .toArray();

  const bad = [];
  for (const row of rows) {
    let raw = row;
    for (const part of field.split('.')) {
      if (raw == null) break;
      raw = raw[part];
    }
    if (raw == null) continue; // absent or explicitly null is not an orphan

    const ids = (many ? (Array.isArray(raw) ? raw : [raw]) : [raw]).map(idOf).filter(Boolean);
    if (ids.length === 0) continue;

    const dangling = ids.filter((id) => !alive.has(id));
    if (dangling.length) bad.push({ _id: row._id, dangling });
  }
  return bad;
}

/** Removes dead entries from an array field instead of deleting the row. */
async function trimArray(collection, field, alive) {
  let trimmed = 0;
  const rows = await mongoose.connection.db.collection(collection).find({ [field]: { $type: 'array' } }).toArray();
  for (const row of rows) {
    const kept = row[field].filter((v) => {
      const id = idOf(v);
      return id != null && alive.has(id);
    });
    if (kept.length === row[field].length) continue;
    await mongoose.connection.db.collection(collection).updateOne({ _id: row._id }, { $set: { [field]: kept } });
    trimmed++;
  }
  return trimmed;
}

async function audit(graph) {
  const findings = [];

  for (const edge of graph) {
    const alive = await liveIds(edge.pointsAt);
    const bad = await findOrphans(edge.collection, edge.field, alive, edge);
    if (bad.length === 0) continue;

    findings.push({
      table: `${edge.collection}.${edge.field}`,
      pointsAt: edge.pointsAt,
      orphans: bad.length,
      sampleRows: bad.slice(0, 3).map((b) => String(b._id)),
      danglingRefs: [...new Set(bad.flatMap((b) => b.dangling))].slice(0, 3),
      danglingRefCount: new Set(bad.flatMap((b) => b.dangling)).size,
      remediation: edge.many
        ? `trim ${bad.length} array(s) in ${edge.collection}.${edge.field}`
        : `delete ${bad.length} row(s) from ${edge.collection}`,
    });
  }

  return findings.sort((a, b) => b.orphans - a.orphans);
}

function printReport(findings) {
  const totalRows = findings.filter((f) => !f.remediation.startsWith('trim')).reduce((s, f) => s + f.orphans, 0);

  console.log('  ORPHANED REFERENCES');
  console.log('  ' + '─'.repeat(74));
  console.log(`  ${'reference'.padEnd(38)}${'→ target'.padEnd(18)}${'rows'.padStart(6)}`);
  for (const f of findings) {
    console.log(`  ${f.table.padEnd(38)}${f.pointsAt.padEnd(18)}${String(f.orphans).padStart(6)}`);
    console.log(`      ${f.danglingRefCount} distinct dead id(s), e.g. ${f.danglingRefs.join(', ')}`);
    if (VERBOSE) console.log(`      sample rows: ${f.sampleRows.join(', ')}`);
    console.log(`      action → ${f.remediation}`);
  }
  console.log('  ' + '─'.repeat(74));
  console.log(
    `  ${findings.length} reference field(s) dangling, ~${totalRows} row(s) to delete.\n`,
  );
}

async function main() {
  const dbName = MONGO_URI.split('/').pop()?.split('?')[0] ?? 'unknown';
  console.error(`prune-orphans → database "${dbName}"`);
  console.error(`mode: ${APPLY ? 'APPLY (will write)' : 'DRY RUN (nothing will be deleted)'}\n`);

  await mongoose.connect(MONGO_URI);

  const graph = buildGraph();
  const findings = await audit(graph);

  if (JSON_OUT) {
    console.log(JSON.stringify({ database: dbName, applied: APPLY, graphEdges: graph.length, findings }, null, 2));
    await mongoose.disconnect();
    process.exit(0);
  }

  if (findings.length === 0) {
    console.log(
      `  ✓ No orphaned references found. All ${graph.length} schema references across\n` +
        '    the database resolve to live documents.',
    );
    await mongoose.disconnect();
    process.exit(0);
  }

  printReport(findings);

  if (!APPLY) {
    console.log('  DRY RUN — nothing was deleted. Re-run with --apply to prune.');
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log('  Applying…\n');
  for (const edge of graph) {
    const alive = await liveIds(edge.pointsAt);
    const bad = await findOrphans(edge.collection, edge.field, alive, edge);
    if (bad.length === 0) continue;

    if (edge.many) {
      // `Post.likedBy` holding a deleted user should lose that user, not lose
      // the post — so trim the array instead of deleting the row.
      const n = await trimArray(edge.collection, edge.field, alive);
      console.log(`  trimmed ${n} row(s) in ${edge.collection}.${edge.field}`);
      continue;
    }

    const ids = bad.map((b) => b._id);
    const result = await mongoose.connection.db.collection(edge.collection).deleteMany({ _id: { $in: ids } });
    console.log(`  deleted ${result.deletedCount} row(s) from ${edge.collection} (${edge.field})`);
  }

  console.log('\n  Re-auditing…');
  existsCache.clear();
  const after = await audit(graph);
  if (after.length === 0) {
    console.log('  ✓ Clean. Every schema reference now resolves to a live document.');
  } else {
    console.log(`  ! ${after.length} field(s) still dangling — these cascade and need another pass:`);
    for (const f of after) console.log(`      ${f.table}  ${f.orphans} row(s)`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('\nprune-orphans error:', err.message);
  process.exit(2);
});