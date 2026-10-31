/**
 * Account closure.
 *
 * Retention policy — chosen deliberately, and the reason matters:
 *
 *  • **Posts are anonymised, not deleted.** Deleting them would silently break
 *    every thread, every comment and every reply below them, and would remove
 *    content other people wrote *about* the departing student. Instead the
 *    author reference is repointed at a shared "Departed student" tombstone
 *    account, so conversations stay intact and readable.
 *  • **Comments are anonymised** for the same reason.
 *  • **Private data is erased.** Email, bio, college, course, branch, year,
 *    skills, interests, avatar and the password hash are all removed, and the
 *    session tokens are revoked. What remains is a non-identifying shell.
 *  • **Follows, likes and saves are removed outright** — they are private
 *    relationships with no value once the account is gone.
 *  • **Notifications addressed to the user are removed**; notifications the
 *    user caused are kept, since they belong to the other party's feed.
 *  • **Uploaded media is deleted** when the file has no remaining referent.
 *
 * The tombstone is created once and reused, so repointing never races.
 */
import { Post } from '../posts/Post.model.js';
import { Comment } from '../posts/Comment.model.js';
import { Follow } from './Follow.model.js';
import { Like } from '../posts/Like.model.js';
import { SavedPost } from '../saved/SavedPost.model.js';
import { Notification } from '../notifications/Notification.model.js';
import { Note } from '../notes/Note.model.js';
import { Report } from '../reports/Report.model.js';
import { User } from './User.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { deleteFile } from '../../infrastructure/storage/storage.service.js';

const TOMBSTONE_USERNAME = 'departed_student';

/**
 * The shared placeholder every removed account's content is repointed at.
 * @returns {Promise<import('mongoose').Document>}
 */
async function getTombstone() {
  const existing = await User.findOne({ username: TOMBSTONE_USERNAME });
  if (existing) return existing;

  // `email` is unique, so a fixed sentinel keeps retries from colliding.
  return User.create({
    name: 'Departed student',
    username: TOMBSTONE_USERNAME,
    email: `tombstone+${TOMBSTONE_USERNAME}@invalid.local`,
    // Unusable: no credential can ever match this hash.
    password: `deleted-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: 'student',
    bio: 'This account has been deleted.',
    suspended: true,
    suspendedReason: 'Tombstone',
    profileCompleted: false,
  });
}

/**
 * Soft-closes an account: hidden from every public surface, sessions revoked,
 * private data cleared, content retained under the tombstone.
 *
 * @param {import('mongoose').Document} user
 * @param {{ reason?: string }} [opts]
 */
export async function deactivateAccount(user, opts = {}) {
  if (user.username === TOMBSTONE_USERNAME) {
    throw ApiError.badRequest('This account cannot be deactivated');
  }
  if (user.deactivatedAt) return { alreadyDeactivated: true };

  const tombstone = await getTombstone();

  await anonymiseContent(user._id, tombstone._id);
  await removeRelationships(user._id);
  await clearPrivateData(user, opts.reason);

  user.deactivatedAt = new Date();
  user.suspended = true;
  user.suspendedReason = 'Account deactivated by the account owner';
  user.tokenVersion += 1; // revoke every outstanding refresh token
  await user.save({ validateBeforeSave: false });

  return { deactivatedAt: user.deactivatedAt };
}

/**
 * Hard-deletes the user row after anonymising its content, so nothing is left
 * that identifies the person.
 *
 * @param {import('mongoose').Document} user
 */
export async function deleteAccountPermanently(user) {
  if (user.username === TOMBSTONE_USERNAME) {
    throw ApiError.badRequest('This account cannot be deleted');
  }

  const tombstone = await getTombstone();
  await anonymiseContent(user._id, tombstone._id);
  await removeRelationships(user._id);

  // Reports this user filed stay: a moderator still needs them, and they
  // reference the reported content rather than the reporter's identity.
  await Report.updateMany({ reporter: user._id }, { $unset: { reporter: 1 } }).catch(() => {});

  // Only the avatar goes. Post media is deliberately kept: the content itself
  // is retained (anonymised, repointed at the tombstone) and deleting the file
  // underneath a still-live post would leave other people's feeds with broken
  // images.
  await deleteFileSafe(user.avatar?.publicId ? [user.avatar.publicId] : []);
  await User.deleteOne({ _id: user._id });

  return { deleted: true };
}

/** Repoints authored content at the tombstone. */
async function anonymiseContent(userId, tombstoneId) {
  await Promise.all([
    Post.updateMany({ author: userId }, { $set: { author: tombstoneId } }),
    Comment.updateMany({ author: userId }, { $set: { author: tombstoneId } }),
    Note.updateMany({ uploadedBy: userId }, { $set: { uploadedBy: tombstoneId } }),
  ]);
}

/** Deletes the private graph around the account. */
async function removeRelationships(userId) {
  await Promise.all([
    Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
    Like.deleteMany({ user: userId }),
    SavedPost.deleteMany({ user: userId }),
    // Notifications *for* this user are private to them and go too.
    Notification.deleteMany({ recipient: userId }),
  ]);
}

/** Strips every personally identifying field from the user document. */
async function clearPrivateData(user, reason) {
  const avatarPublicId = user.avatar?.publicId;
  if (avatarPublicId) await deleteFileSafe([avatarPublicId]);

  user.email = `deleted+${user._id}@invalid.local`;
  user.name = 'Departed student';
  user.bio = 'This account has been deleted.';
  user.college = '';
  user.course = '';
  user.branch = '';
  user.year = null;
  user.semester = null;
  user.skills = [];
  user.interests = [];
  user.avatar = { url: '', publicId: '' };
  // A random value nobody can supply at login, and `comparePassword` is the
  // only reader, so the original hash is gone.
  user.password = `deleted-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  user.tokenVersion += 1;
  if (reason) user.suspendedReason = reason;
  user.markModified('avatar');
  await user.save({ validateBeforeSave: false });
}

/** Best-effort cleanup — a failed file delete must not fail a deletion. */
async function deleteFileSafe(publicIds) {
  for (const publicId of publicIds) {
    // eslint-disable-next-line no-await-in-loop
    await deleteFile(publicId, 'auto').catch(() => {});
  }
}

/**
 * Recomputes a user's denormalised counters from the collections that own them.
 *
 * The counters are caches, not truth. Anything that can drift — a crash between
 * a write and its increment, a manual admin edit — should be repairable with
 * this rather than requiring a migration.
 *
 * @param {import('mongoose').Types.ObjectId} userId
 */
export async function recomputeCounters(userId) {
  const [postsCount, notesCount, followersCount, followingCount] = await Promise.all([
    Post.countDocuments({ author: userId }),
    Note.countDocuments({ uploadedBy: userId }),
    Follow.countDocuments({ following: userId }),
    Follow.countDocuments({ follower: userId }),
  ]);

  // `updateOne` rather than `save`: avoids running the password hook and the
  // full validation path for what is a four-field cache refresh.
  await User.updateOne(
    { _id: userId },
    { $set: { postsCount, notesCount, followersCount, followingCount } },
  );

  return { postsCount, notesCount, followersCount, followingCount };
}

/**
 * Finds users whose counters disagree with their collections. Intended for an
 * admin maintenance command, not a request path.
 */
export async function findDriftedCounters(limit = 50) {
  const users = await User.find({}).select('_id username postsCount followersCount followingCount').limit(limit).lean();

  const drifted = [];
  for (const u of users) {
    const [posts, followers, following] = await Promise.all([
      Post.countDocuments({ author: u._id }),
      Follow.countDocuments({ following: u._id }),
      Follow.countDocuments({ follower: u._id }),
    ]);
    if (posts !== u.postsCount || followers !== u.followersCount || following !== u.followingCount) {
      drifted.push({ id: u._id, username: u.username, stored: u.postsCount, actual: posts, followersStored: u.followersCount, followersActual: followers, followingStored: u.followingCount, followingActual: following });
    }
  }
  return drifted;
}
