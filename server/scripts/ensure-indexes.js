/**
 * Ensures every declared index exists in the database.
 *
 * The unique indexes are load-bearing, not an optimisation: the duplicate
 * follow guard, the unique email and username, and the single-use verification
 * tokens are all *database* constraints. Application code checks uniqueness
 * before writing, but that is a race — two concurrent requests both see "free"
 * and both insert. Only the index makes it impossible.
 *
 * Runs at every boot (`createApp` calls `syncIndexes`), and available as
 * `npm run db:indexes` so a deploy can guarantee it before traffic arrives.
 *
 * Exits non-zero on failure rather than continuing: a server whose constraints
 * did not get created is one that will quietly accept duplicate email addresses.
 */
import { connectDB, syncIndexes, disconnectDB } from '../src/config/db.js';
// Importing the models is what registers them; without this there is nothing to
// sync. The barrel pulls in every schema so a new model is covered by
// accident rather than by remembering to add it here.
import '../src/models/index.js';

const run = async () => {
  await connectDB();
  try {
    await syncIndexes();
    // eslint-disable-next-line no-console
    console.log('✅ Indexes are in place.');
  } finally {
    await disconnectDB();
  }
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\n✖ Could not ensure indexes:\n  ' + err.message + '\n');
  // eslint-disable-next-line no-console
  console.error(
    '  The two causes worth checking first:\n\n' +
      '  1. Existing data violates a unique index the schema requires. Duplicate\n' +
      '     follows, for instance, from before the index existed:\n\n' +
      '       db.follows.aggregate([\n' +
      "         { $group: { _id: { $f: '$follower', $t: '$following' }, n: { $sum: 1 } } },\n" +
      '         { $match: { n: { $gt: 1 } } }\n' +
      '       ])\n\n' +
      '     Remove the extras and run this again.\n\n' +
      '  2. An index specification MongoDB rejects — a partial filter using\n' +
      '     $exists or $not, for example, which it does not support. The message\n' +
      '     above names the index.\n',
  );
  process.exit(1);
});
