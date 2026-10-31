import { asyncHandler } from '../../utils/asyncHandler.js';
import * as discussionService from './discussion.service.js';
import { getPagination } from '../../utils/pagination.js';
import {
  createDiscussionSchema,
  updateDiscussionSchema,
  listDiscussionsQuerySchema,
  voteSchema,
  commentSchema,
  updateCommentSchema,
  idParamSchema,
  discussionAndCommentParamSchema,
} from '../../validators/discussion.validator.js';

export const listDiscussions = asyncHandler(async (req, res) => {
  const query = listDiscussionsQuerySchema.parse(req.query);
  const page = getPagination(req);
  if (query.sort) page.sort = query.sort;
  const result = await discussionService.listDiscussions(query, page, req.user?._id);
  res.json({ success: true, ...result });
});

export const getDiscussion = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const discussion = await discussionService.getDiscussion(id, req.user?._id);
  res.json({ success: true, data: discussion });
});

export const createDiscussion = asyncHandler(async (req, res) => {
  const input = createDiscussionSchema.parse(req.body);
  const discussion = await discussionService.createDiscussion(input, req.user._id);
  res.status(201).json({ success: true, data: discussion });
});

export const updateDiscussion = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateDiscussionSchema.parse(req.body);
  const discussion = await discussionService.updateDiscussion(id, input, req.user);
  res.json({ success: true, data: discussion });
});

export const deleteDiscussion = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const result = await discussionService.deleteDiscussion(id, req.user);
  res.json({ success: true, data: result });
});

export const voteDiscussion = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { value } = voteSchema.parse(req.body);
  const result = await discussionService.voteDiscussion(id, value, req.user._id);
  res.json({ success: true, data: result });
});

export const listComments = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const page = getPagination(req);
  // Comments read oldest-first, because a thread is read top to bottom.
  //
  // `sort` is taken from an allow-list rather than passed through. Express's
  // default query parser turns `?sort[$ne]=1` into an *object*, and that object
  // was being handed straight to `.sort()` — where a malformed value either
  // throws a 500 or, worse, is accepted as a sort specification. Only these two
  // values are meaningful here; anything else falls back to the default.
  const SORTABLE = new Set(['createdAt', '-createdAt']);
  page.sort = typeof req.query.sort === 'string' && SORTABLE.has(req.query.sort) ? req.query.sort : 'createdAt';
  const result = await discussionService.listComments(id, page, req.user?._id);
  res.json({ success: true, ...result });
});

export const createComment = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = commentSchema.parse(req.body);
  const comment = await discussionService.createComment(id, input, req.user._id);
  res.status(201).json({ success: true, data: comment });
});

export const updateComment = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const input = updateCommentSchema.parse(req.body);
  const comment = await discussionService.updateComment(id, input, req.user);
  res.json({ success: true, data: comment });
});

export const deleteComment = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const result = await discussionService.deleteComment(id, req.user);
  res.json({ success: true, data: result });
});

export const voteComment = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const { value } = voteSchema.parse(req.body);
  const result = await discussionService.voteComment(id, value, req.user._id);
  res.json({ success: true, data: result });
});

export const markAsAnswer = asyncHandler(async (req, res) => {
  const { discussionId, commentId } = discussionAndCommentParamSchema.parse(req.params);
  const result = await discussionService.markAsAnswer(discussionId, commentId, req.user);
  res.json({ success: true, data: result });
});
