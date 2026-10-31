import { User } from './User.model.js';
import { Follow } from './Follow.model.js';
import { ApiError } from '../../utils/ApiError.js';

/**
 * Every public user query carries this filter, so a suspended, deactivated or
 * pending-deletion account is invisible everywhere: the directory, search,
 * suggestions, profile lookups, follower lists and the follow graph.
 *
 * Centralised rather than repeated per query, because forgetting it in one
 * place is exactly how a deleted account keeps showing up in someone's
 * "people you may know" list.
 */
export const ACTIVE_USER = {
  suspended: { $ne: true },
  deactivatedAt: null,
  deletionRequestedAt: null,
};

/** Same conditions as a Mongo filter, for in-memory checks on a lean doc. */
export const isActiveUser = (doc) =>
  Boolean(doc) && !doc.suspended && !doc.deactivatedAt && !doc.deletionRequestedAt;

/**
 * Compact public shape for a user row that appears in a list — the directory,
 * the "who to follow" suggestions, and the followers/following tabs.
 *
 * Every list query runs `.lean()` for speed, which skips the schema's
 * `toJSON` transform and the `toPublicJSON` method, so those rows would
 * otherwise reach the client as raw documents keyed by `_id`. The client keys
 * lists and calls follow/unfollow by `id`, so the field name has to match the
 * rest of the API.
 *
 * @param {object | null} doc
 */
export function serialiseUserSummary(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name,
    username: doc.username,
    avatar: typeof doc.avatar === 'string' ? doc.avatar : (doc.avatar?.url ?? ''),
    college: doc.college,
    course: doc.course,
    branch: doc.branch ?? null,
    year: doc.year ?? null,
    skills: doc.skills ?? [],
    followersCount: doc.followersCount ?? 0,
  };
}

/** Resolves a path param that may be either an ObjectId or a username. */
export async function findUserByIdentifier(identifier) {
  const isObjectId = /^[a-f0-9]{24}$/i.test(identifier);

  const criteria = isObjectId ? { _id: identifier } : { username: identifier.toLowerCase() };
  const user = await User.findOne({ ...criteria, ...ACTIVE_USER }).select(
    'name username email avatar college course branch year bio skills interests followersCount followingCount postsCount notesCount role profileCompleted suspended createdAt',
  );

  if (!user) throw ApiError.notFound('Student not found');
  return user;
}

/** Escapes user input so it is safe to embed in a RegExp. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The searchable profile fields, as required by the discovery spec: name,
 * username, college, course and skills.
 */
const DISCOVERY_FIELDS = ['name', 'username', 'college', 'course', 'skills'];

/**
 * The fields where matching *anywhere* is expected, not just at the start.
 *
 * `name` is here because searching a surname is what people actually do: typing
 * "Kapoor" must find "Diya Kapoor". A student directory where you can only find
 * someone by typing the start of their first name is not a directory.
 * `skills` is here for the same reason — "React" sits in the middle of a list,
 * and "machine" is a prefix of nothing. `college` is here because institutions
 * are searched by the part you remember: "Delhi" for "University of Delhi".
 *
 * The cost is honest and bounded: none of these can use an index, so Mongo
 * evaluates them as a scan. That is acceptable because the clause is only
 * reached for queries of at least `MIN_SEARCH_LENGTH` characters, it is always
 * ANDed with the active-user filter, and the result set is hard-capped and
 * paginated. The `text` index on this schema is the route to take if the
 * collection ever grows large enough for that to stop being true.
 */
const SUBSTRING_FIELDS = ['name', 'college', 'skills'];

/**
 * Builds the match clause for a search box.
 *
 * Two alternatives, ORed:
 *
 *  • An **anchored prefix** regex (`^priya`) on any discovery field. Anchored
 *    regexes can use the `name`/`username`/`college` indexes, so this stays
 *    cheap as the collection grows, and it is what makes the typeahead viable.
 *  • An **unanchored** regex on `SUBSTRING_FIELDS`, which is what makes a
 *    surname findable. This one cannot use an index; it is bounded instead by
 *    requiring `MIN_SEARCH_LENGTH` characters and a hard result cap.
 *
 * These must be ORed, not ANDed. They were ANDed once, which silently reduced
 * the whole clause to the prefix match — an unanchored match is a superset of
 * an anchored one, so requiring both is the same as requiring the strict one.
 * The result was a search box that only ever matched the *beginning* of a name.
 *
 * Every regex is escaped, so no user input can alter the pattern — that is
 * both the ReDoS defence and the NoSQL-injection defence.
 *
 * @param {string} query
 */
function discoveryMatch(query) {
  const q = query.trim();
  if (!q) return null;

  const terms = q.split(/\s+/).filter(Boolean).slice(0, 5);
  if (!terms.length) return null;

  return {
    $or: [
      { $or: terms.map((t) => ({ $or: DISCOVERY_FIELDS.map((f) => ({ [f]: { $regex: `^${escapeRegex(t)}`, $options: 'i' } })) })) },
      { $or: terms.map((t) => ({ $or: SUBSTRING_FIELDS.map((f) => ({ [f]: { $regex: escapeRegex(t), $options: 'i' } })) })) },
    ],
  };
}

/** Below this length, an unanchored scan returns more noise than results. */
const MIN_SEARCH_LENGTH = 2;

/**
 * Paged user discovery — the directory behind Explore and the "students" tab
 * of global search.
 *
 * Always paginated, always capped, never returns the whole collection. The
 * viewer is excluded from their own results: a people directory that lists you
 * is just noise, and it is a small needless disclosure of your own row.
 *
 * @param {object} opts
 * @param {string} [opts.search]
 * @param {string} [opts.course]
 * @param {string} [opts.year]
 * @param {string} [opts.college]
 * @param {string} [opts.skill]
 * @param {string} [opts.excludeId] the viewer
 * @param {{ sort?: string, limit: number, cursor?: string }} opts.page
 */
export async function searchUsers({ search, course, year, college, skill, excludeId, page }) {
  const filter = { ...ACTIVE_USER };
  if (excludeId) filter._id = { $ne: excludeId };
  if (course) filter.course = course;
  if (year) filter.year = Number(year);
  if (college) filter.college = { $regex: `^${escapeRegex(college)}`, $options: 'i' };
  if (skill) filter.skills = { $regex: escapeRegex(skill), $options: 'i' };

  const q = (search ?? '').trim();
  if (q.length >= MIN_SEARCH_LENGTH) {
    const match = discoveryMatch(q);
    if (match) filter.$and = [...(filter.$and ?? []), match];
  }

  // Relevance first for a search, popularity first for a browse. Both are
  // covered by `{ suspended: 1, followersCount: -1 }`.
  const sort = page.sort === 'name' ? 'name' : '-followersCount';

  if (page.cursor) {
    filter._id = { ...(filter._id ?? {}), [sort.startsWith('-') ? '$lt' : '$gt']: page.cursor };
  }

  const users = await User.find(filter)
    .select('name username avatar college course branch year skills followersCount')
    .sort({ [sort]: sort.startsWith('-') ? -1 : 1, _id: sort.startsWith('-') ? -1 : 1 })
    .limit(page.limit + 1)
    .lean();

  const hasMore = users.length > page.limit;
  const pageItems = hasMore ? users.slice(0, page.limit) : users;

  return {
    data: pageItems.map(serialiseUserSummary),
    pagination: {
      nextCursor: hasMore ? pageItems[pageItems.length - 1]._id.toString() : null,
      hasMore,
      limit: page.limit,
    },
  };
}

/**
 * Public profile payload, personalised for the viewer.
 * @param {import('mongoose').Document} user
 * @param {string|null} viewerId
 */
export async function getProfile(user, viewerId) {
  const isSelf = viewerId && String(viewerId) === String(user._id);

  const payload = isSelf ? user.toPrivateJSON() : user.toPublicJSON();

  if (isSelf) return payload;

  const isFollowing = viewerId
    ? Boolean(await Follow.exists({ follower: viewerId, following: user._id }))
    : false;

  return { ...payload, isFollowing, isSelf: false };
}

/**
 * Idempotent follow. Returns the resulting state so the client never has to
 * guess whether the tap registered.
 * @returns {Promise<{ following: boolean, followersCount: number }>}
 */
export async function followUser(followerId, targetId) {
  if (String(followerId) === String(targetId)) {
    throw ApiError.badRequest('You cannot follow yourself');
  }

  // A hidden account is reported as "not found" rather than "forbidden", so
  // following cannot be used to probe for suspended or deleted users.
  const target = await User.findOne({ _id: targetId, ...ACTIVE_USER }).select('_id');
  if (!target) throw ApiError.notFound('Student not found');

  let created = false;
  try {
    await Follow.create({ follower: followerId, following: targetId });
    created = true;
  } catch (err) {
    // 11000 => already following, which is a no-op rather than an error.
    if (err?.code !== 11000) throw err;
  }

  if (created) {
    await Promise.all([
      User.updateOne({ _id: followerId }, { $inc: { followingCount: 1 } }),
      User.updateOne({ _id: targetId }, { $inc: { followersCount: 1 } }),
    ]);
  }

  const updated = await User.findById(targetId).select('followersCount');
  return { following: true, followersCount: updated.followersCount };
}

/** Idempotent unfollow. */
export async function unfollowUser(followerId, targetId) {
  const deleted = await Follow.findOneAndDelete({ follower: followerId, following: targetId });

  if (deleted) {
    await Promise.all([
      User.updateOne({ _id: followerId }, { $inc: { followingCount: -1 } }),
      User.updateOne({ _id: targetId }, { $inc: { followersCount: -1 } }),
    ]);
  }

  // Clamp at zero: a counter can never be negative.
  await User.updateMany({ _id: { $in: [followerId, targetId] }, followersCount: { $lt: 0 } }, { $set: { followersCount: 0 } });
  await User.updateMany({ _id: { $in: [followerId, targetId] }, followingCount: { $lt: 0 } }, { $set: { followingCount: 0 } });

  const updated = await User.findById(targetId).select('followersCount');
  return { following: false, followersCount: updated?.followersCount ?? 0 };
}

/**
 * Paged list of followers or following users.
 * @param {string} userId
 * @param {'followers'|'following'} direction
 * @param {{ cursor?: string, limit: number }} page
 */
export async function listConnections(userId, direction, page) {
  const ownerField = direction === 'followers' ? 'following' : 'follower';
  const userField = direction === 'followers' ? 'follower' : 'following';

  const filter = { [ownerField]: userId };
  if (page.cursor) {
    filter._id = page.sort.startsWith('-') ? { $lt: page.cursor } : { $gt: page.cursor };
  }

  const follows = await Follow.find(filter)
    .sort(page.sort === 'createdAt' ? 'createdAt' : '-createdAt')
    .limit(page.limit + 1)
    .populate({
      path: userField,
      match: ACTIVE_USER,
      select: 'name username avatar college course branch year skills followersCount',
    })
    .lean();

  // `populate` with a `match` can drop rows, so the page can come back short.
  // That is correct behaviour (a hidden follower genuinely is not a follower
  // any more) but the cursor must still advance past what was fetched, or the
  // next page would re-scan the same window forever.
  const hasMore = follows.length > page.limit;
  const pageItems = hasMore ? follows.slice(0, page.limit) : follows;
  const data = pageItems.map((f) => f[userField]).filter(isActiveUser).map(serialiseUserSummary);

  return {
    data,
    pagination: {
      nextCursor: hasMore ? pageItems[pageItems.length - 1]._id.toString() : null,
      hasMore,
      limit: page.limit,
    },
  };
}
