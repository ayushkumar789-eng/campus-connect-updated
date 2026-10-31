/**
 * Teardown for the smoke suites.
 *
 * Both suites tag every account they register with a per-run suffix in the
 * username, so one regex sweep removes the run's users and everything that
 * hangs off them. Without this, repeated runs quietly fill the demo database
 * with abandoned test accounts that show up in search, suggestions and
 * follower lists.
 *
 * Best-effort by design — a cleanup failure must never fail the suite it is
 * cleaning up after.
 */

/** Tags every username created during the run that started at `stamp`. */
export const runTag = (stamp) => `_${stamp.toString(36)}`;

/** Collections that can reference a user from any direction. */
const USER_REFERENCES = [
  { author: 1 },
  { user: 1 },
  { follower: 1 },
  { following: 1 },
  { recipient: 1 },
  { actor: 1 },
  { reporter: 1 },
  { uploadedBy: 1 },
  { organizer: 1 },
  { creator: 1 },
  { 'entity.type': 1 },
  // Messages and conversations were missing here, so every suite run left
  // behind a row whose sender no longer existed and a conversation whose
  // participants did either. It accumulated silently: the suites reported a
  // clean teardown while the demo database filled with orphans that no test
  // ever looked at.
  { sender: 1 },
  { participants: 1 },
];

const SWEPT_COLLECTIONS = [
  'posts',
  'comments',
  'likes',
  'savedposts',
  'follows',
  'notifications',
  'reports',
  'notes',
  'events',
  'eventregistrations',
  'groups',
  'groupmembers',
  'discussions',
  'messages',
  'conversations',
];

/**
 * @param {number} stamp The `Date.now()` used to build the run's usernames.
 * @returns {Promise<number>} How many accounts were removed.
 */
export async function cleanupRun(stamp) {
  let mongoose;
  try {
    ({ default: mongoose } = await import('mongoose'));
  } catch {
    return 0;
  }

  let connected = false;
  try {
    const suffix = new RegExp(`${runTag(stamp)}$`);

    // Refuse to guess the database. This used to fall back to
    // `mongodb://127.0.0.1:27017/campusconnect` — the *developer's* database —
    // whenever MONGO_URI was unset. A cleanup helper that silently defaults to
    // the one database with real data is a foot-gun wearing the costume of a
    // convenience: run a suite without exporting MONGO_URI and it issues
    // deleteMany() against whatever the developer has been working on.
    // `scripts/test-all.sh` exports MONGO_URI precisely so this resolves to the
    // disposable database, so refusing here costs nothing and removes the trap.
    const uri = process.env.MONGO_URI;
    if (!uri) {
      console.log('\n  \x1b[33mCleanup skipped:\x1b[0m MONGO_URI is not set.');
      console.log(
        '    Refusing to fall back to the dev database. Export MONGO_URI to point\n' +
          '    cleanup at the database the suite actually used.',
      );
      return 0;
    }

    if (!mongoose.connection.readyState) {
      await mongoose.connect(uri);
      connected = true;
    }

    const db = mongoose.connection.db;
    const users = await db.collection('users').find({ username: suffix }).project({ _id: 1 }).toArray();
    if (!users.length) return 0;

    const ids = users.map((u) => u._id);
    const owned = { $or: USER_REFERENCES.map((shape) => ({ [Object.keys(shape)[0]]: { $in: ids } })) };

    await Promise.all(SWEPT_COLLECTIONS.map((name) => db.collection(name).deleteMany(owned)));
    await db.collection('users').deleteMany({ username: suffix });

    console.log(`\n  \x1b[2mCleaned up ${ids.length} test account(s).\x1b[0m`);
    return ids.length;
  } catch (err) {
    console.log(`\n  \x1b[33mCleanup skipped:\x1b[0m ${err.message}`);
    return 0;
  } finally {
    if (connected) await mongoose.disconnect().catch(() => {});
  }
}
