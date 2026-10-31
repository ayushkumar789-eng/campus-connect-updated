import { asyncHandler } from '../../utils/asyncHandler.js';
import { Post } from './Post.model.js';
import { getPagination } from '../../utils/pagination.js';

import {
  createPost,
  getFeed,
  getPostById,
  updatePost,
  deletePost,
  toggleLike,
  toggleSave,
  sharePost,
  votePoll,

  getSavedPosts,
  reportContent,
} from './posts.service.js';


const viewerId = (req) => req.user?._id ?? null;
export const create = asyncHandler(async (req, res) => {
  const post = await createPost(req.body, req.user._id, req.files ?? []);
  res.status(201).json({ success: true, message: 'Posted', data: post });
});

/** GET /api/posts/feed */
export const feed = asyncHandler(async (req, res) => {
  const page = getPagination(req);
  const scope = req.query.scope === 'all' ? 'all' : 'following';
  const result = await getFeed(viewerId(req), page, scope);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

/** GET /api/posts/:id */
export const getOne = asyncHandler(async (req, res) => {
  const post = await getPostById(req.params.id, viewerId(req));
  res.json({ success: true, data: post });
});

/** PUT /api/posts/:id */
export const update = asyncHandler(async (req, res) => {
  const post = await updatePost(req.params.id, req.user, req.body.content);
  res.json({ success: true, message: 'Post updated', data: post });
});

/** DELETE /api/posts/:id */
export const remove = asyncHandler(async (req, res) => {
  await deletePost(req.params.id, req.user);
  res.json({ success: true, message: 'Post deleted', data: null });
});

/** POST /api/posts/:id/like — toggles */
export const like = asyncHandler(async (req, res) => {
  const result = await toggleLike(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

/** POST /api/posts/:id/save — toggles */
export const save = asyncHandler(async (req, res) => {
  const result = await toggleSave(req.params.id, req.user._id);
  res.json({ success: true, data: result });
});

/** POST /api/posts/:id/share */
export const share = asyncHandler(async (req, res) => {
  const result = await sharePost(req.params.id, req.user._id);
  res.json({ success: true, message: 'Shared', data: result });
});

/** POST /api/posts/:id/vote */
export const vote = asyncHandler(async (req, res) => {
  const post = await votePoll(req.params.id, req.user._id, req.body.optionId);
  res.json({ success: true, data: post });
});

/** GET /api/posts/saved — the viewer's bookmarks */
export const savedPosts = asyncHandler(async (req, res) => {
  const page = getPagination(req);
  const result = await getSavedPosts(req.user._id, page);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

// ── Search & reports ─────────────────────────────────────────────────────

/** POST /api/reports */
export const report = asyncHandler(async (req, res) => {
  const result = await reportContent({ reporter: req.user._id, ...req.body });
  res.status(result.alreadyReported ? 200 : 201).json({
    success: true,
    message: result.alreadyReported
      ? 'You have already reported this'
      : 'Thanks — our moderators will review this',
    data: result,
  });
});

/** GET /api/posts/:id/likes — who liked it */
export const postLikes = asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id).populate('likedBy', 'name username avatar');
  if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
  res.json({ success: true, data: post.likedBy });
});
