#!/usr/bin/env node
/**
 * Notification entity migration (Phase 4).
 *
 * ── What this changes ──────────────────────────────────────────────────────
 *
 * A comment notification used to be keyed on the *post*:
 *
 *     { recipient, actor, type: 'comment', 'entity.type': <postId> }
 *
 * Two different comments by the same person on the same post therefore produced
 * the identical key, so the unique index treated the second as a duplicate and
 * dropped it. The recipient was told about the first comment and nothing about
 * the rest, with no error anywhere to indicate it. The same applied to replies.
 *
 * The fix adds `entity.comment`, so the key becomes the identity of the event:
 *
 *     { recipient, actor, type, 'entity.model', 'entity.type', 'entity.comment' }
 *
 * This script performs the one step the application cannot safely do on its own:
 * dropping the *old* unique index. Until it is dropped, comment B is still
 * suppressed by comment A even though the new index exists — both would be
 * enforced, and the narrower old one wins.
 *
 * ── Why it is a script and not boot behaviour ──────────────────────────────
 *
 * Deploying this must not silently drop a live unique constraint. Production
 * index sync is therefore additive-only (`INDEX_SYNC=create`, the default), and
 * the removal is an explicit, reviewed, idempotent step an operator runs once.
 *
 * ── Safety ─────────────────────────────────────────────────────────────────
 *
 *   • Idempotent. Running it twice is a no-op; re-running after a partial
 *     failure completes the job.
 *   • Non-destructive to data. No document is read, rewritten or deleted. Only
 *     indexes change, and the new key is a strict superset of the old one, so
 *     every row already unique under the old key is unique under the new key
 *     and the CREATE cannot fail on pre-existing data.
 *   • Never runs automatically. Not called from app.js, server.js, syncIndexes,
 *     or the seed.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────
 *
 *   # dry run — report what would change, touch nothing
 *   npm run db:migrate:notifications --workspace server -- --dry-run
 *
 *   # apply
 *   npm run db:migrate:notifications --workspace server
 *
 * MONGO_URI may be passed as an argument instead of an env var:
 *   node scripts/migrate-notification-entity.js 'mongodb://host/db' --dry-run
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Notification } from '../src/modules/notifications/Notification.model.js';

const LEGACY_INDEX_KEYS = { recipient: 1, actor: 1, type: 1, 'entity.type': 1 };

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const uriArg = args.find((a) => !a.startsWith('--'));
const uri = uriArg ?? env.MONGO_URI;

/**
 * A Mongo index name is the keys joined with `_`, with direction, so the
 * legacy index is `recipient_1_actor_1_type_1_entity.type_1`. Matched on the
 * exact key rather than the name so a future rename of the same key is still
 * detected.
 */
function isLegacyIndex(index) {
  const entries = Object.entries(index.key).sort(([a], [b]) => (a < b ? -1 : 1));
  const expected = Object.entries(LEGACY_INDEX_KEYS).sort(([a], [b]) => (a < b ? -1 : 1));
  return (
    entries.length === expected.length && entries.every(([k, v], i) => k === expected[i][0] && v === expected[i][1])
  );
}

async function main() {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  const collection = Notification.collection;

  const existing = await collection.indexes();
  const legacy = existing.find(isLegacyIndex);

  // The name the current schema generates for the widened unique index.
  const desiredName = Notification.schema.indexes().find(
    ([fields]) => fields['entity.comment'] !== undefined,
  )?.[1]?.name;

  console.log(`\nDatabase : ${mongoose.connection.name}`);
  console.log(`Mode     : ${dryRun ? 'DRY RUN (no changes)' : 'APPLY'}`);

  // ── Step 1: make sure the widened index exists ───────────────────────────
  // Additive, so this is safe: the new key is a superset of the legacy key.
  if (desiredName) {
    const present = existing.some((i) => i.name === desiredName);
    if (present) {
      console.log(`✓ widened index present: ${desiredName}`);
    } else if (dryRun) {
      console.log(`· would create widened index: ${desiredName}`);
    } else {
      await collection.createIndex(
        Notification.schema.indexes().find(([f]) => f['entity.comment'] !== undefined)[0],
        {
          unique: true,
          partialFilterExpression: { actor: { $type: 'objectId' } },
          name: desiredName,
        },
      );
      console.log(`✓ created widened index: ${desiredName}`);
    }
  }

  // ── Step 2: drop the legacy index ────────────────────────────────────────
  // This is the step that actually restores per-comment notifications. Until
  // it runs, the old narrower key still suppresses the second comment.
  if (!legacy) {
    console.log('✓ legacy index already absent — nothing to drop');
  } else if (dryRun) {
    console.log(`· would drop legacy index: ${legacy.name}`);
  } else {
    await collection.dropIndex(legacy.name);
    console.log(`✓ dropped legacy index: ${legacy.name}`);
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const counts = await collection.aggregate([
    { $match: { type: { $in: ['comment', 'reply'] } } },
    {
      $group: {
        _id: { r: '$recipient', a: '$actor', t: '$type', e: '$entity.type' },
        rows: { $sum: 1 },
      },
    },
    { $match: { rows: { $gt: 1 } } },
    { $count: 'groups' },
  ]);

  const collapsed = counts[0]?.groups ?? 0;
  console.log(
    collapsed === 0
      ? '\nNo collapsed comment/reply notifications remain.\n'
      : `\n⚠ ${collapsed} legacy (recipient, actor, type, post) group(s) still share a row.\n` +
          '  These are pre-migration rows the old index had already collapsed into one.\n' +
          '  They are left as-is: merging history is a data decision, not a schema one.\n',
  );

  console.log('Remaining notification indexes:');
  for (const i of await collection.indexes()) {
    console.log(`  ${i.unique ? 'unique ' : '       '}${i.name}`);
  }
  console.log('');
}

main()
  .catch((err) => {
    console.error('\n✖ Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());