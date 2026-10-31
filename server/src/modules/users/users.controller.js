import { asyncHandler } from '../../utils/asyncHandler.js';
import { User } from './User.model.js';
import { Follow } from './Follow.model.js';
import { getPagination } from '../../utils/pagination.js';
import { getPostsByAuthor } from '../posts/index.js';
import {
  findUserByIdentifier,
  getProfile,
  followUser,
  unfollowUser,
  listConnections,
  searchUsers,
  serialiseUserSummary,
  ACTIVE_USER,
} from './users.service.js';

const viewerId = (req) => req.user?._id ?? null;


// ── Users ────────────────────────────────────────────────────────────────

/** GET /api/users?search=&course= — directory / suggested students */
export const listUsers = asyncHandler(async (req, res) => {
  const { search, course, year, college, skill, cursor, sort } = req.query;
  const limit = Math.min(Number(req.query.limit) || 12, 30);

  const { data, pagination } = await searchUsers({
    search,
    course,
    year,
    college,
    skill,
    excludeId: req.user?._id,
    page: { sort, limit, cursor },
  });

  res.json({ success: true, data, pagination });
});

/** GET /api/users/suggested — people to follow (not already followed) */
export const suggestedUsers = asyncHandler(async (req, res) => {
  const following = await Follow.find({ follower: req.user._id }).select('following').lean();
  const excluded = [req.user._id.toString(), ...following.map((f) => f.following.toString())];

  const users = await User.find({ _id: { $nin: excluded }, ...ACTIVE_USER })
    .select('name username avatar college course branch year skills followersCount')
    .sort('-followersCount')
    .limit(5)
    .lean();

  res.json({ success: true, data: users.map(serialiseUserSummary) });
});

/** GET /api/users/:id — id or username */
export const getUser = asyncHandler(async (req, res) => {
  const user = await findUserByIdentifier(req.params.id);
  const profile = await getProfile(user, viewerId(req));
  res.json({ success: true, data: profile });
});

/** PUT /api/users/:id */
export const updateUser = asyncHandler(async (req, res) => {
  const target = await findUserByIdentifier(req.params.id);
  if (String(target._id) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'You can only edit your own profile' });
  }
  // Reuse the auth service so validation and avatar handling stay in one place.
  const { updateProfile } = await import('../auth/index.js');
  const user = await updateProfile(target, req.body, req.file);
  res.json({ success: true, message: 'Profile updated', data: { user } });
});

/** POST /api/users/:id/follow */
export const follow = asyncHandler(async (req, res) => {
  const target = await findUserByIdentifier(req.params.id);
  const result = await followUser(req.user._id, target._id);

  const { notify } = await import('../auth/index.js');
  await notify({
    recipient: target._id,
    actor: req.user._id,
    type: 'follow',
    entity: { type: target._id, model: 'User' },
    text: 'started following you',
  });

  res.json({ success: true, message: `You are now following @${target.username}`, data: result });
});

/** DELETE /api/users/:id/follow */
export const unfollow = asyncHandler(async (req, res) => {
  const target = await findUserByIdentifier(req.params.id);
  const result = await unfollowUser(req.user._id, target._id);
  res.json({ success: true, message: `You unfollowed @${target.username}`, data: result });
});

/** GET /api/users/:id/followers | /following */
export const connections = asyncHandler(async (req, res) => {
  const user = await findUserByIdentifier(req.params.id);
  const direction = req.params.direction === 'following' ? 'following' : 'followers';
  const page = getPagination(req);

  const result = await listConnections(user._id, direction, page);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

/** GET /api/users/:id/posts */
export const userPosts = asyncHandler(async (req, res) => {
  const user = await findUserByIdentifier(req.params.id);
  const page = getPagination(req);
  const result = await getPostsByAuthor(user._id, viewerId(req), page, { group: req.query.group });
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

// ── Posts ────────────────────────────────────────────────────────────────

/** POST /api/posts */
