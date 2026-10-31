import { asyncHandler } from '../../utils/asyncHandler.js';
import { addComment, getComments, deleteComment } from './comments.service.js';
import { getPagination } from '../../utils/pagination.js';

const viewerId = (req) => req.user?._id ?? null;

/** GET /api/posts/:id/comments */
export const listComments = asyncHandler(async (req, res) => {
  const page = getPagination(req);
  const result = await getComments(req.params.id, viewerId(req), page);
  res.json({ success: true, data: result.data, pagination: result.pagination });
});

/** POST /api/posts/:id/comments */
export const createComment = asyncHandler(async (req, res) => {
  const comment = await addComment(req.params.id, req.user, req.body);
  res.status(201).json({ success: true, message: 'Comment added', data: comment });
});

/** DELETE /api/comments/:id */
export const removeComment = asyncHandler(async (req, res) => {
  await deleteComment(req.params.id, req.user);
  res.json({ success: true, message: 'Comment deleted', data: null });
});
