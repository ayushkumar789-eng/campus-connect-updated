import { z } from 'zod';
import { DISCUSSION_CATEGORIES } from '../modules/discussions/Discussion.model.js';
import { objectId, optionalText } from './common.js';

export const paginationQuery = {
  cursor: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
};

export const createDiscussionSchema = z
  .object({
    title: z.string().trim().min(8, 'Title must be at least 8 characters').max(200, 'Title cannot exceed 200 characters'),
    body: z.string().trim().max(8000, 'A discussion cannot exceed 8000 characters').optional().default(''),
    category: z.enum(DISCUSSION_CATEGORIES).optional().default('general'),
    tags: z.array(z.string().trim().max(30).toLowerCase()).max(5, 'Maximum 5 tags allowed').optional().default([]),
    group: objectId.optional().nullable(),
  })
  .strict();

export const updateDiscussionSchema = z
  .object({
    title: z.string().trim().min(8, 'Title must be at least 8 characters').max(200, 'Title cannot exceed 200 characters').optional(),
    body: z.string().trim().max(8000, 'A discussion cannot exceed 8000 characters').optional(),
    category: z.enum(DISCUSSION_CATEGORIES).optional(),
    tags: z.array(z.string().trim().max(30).toLowerCase()).max(5, 'Maximum 5 tags allowed').optional(),
  })
  .strict();

export const listDiscussionsQuerySchema = z
  .object({
    ...paginationQuery,
    search: optionalText(60),
    category: z.enum(DISCUSSION_CATEGORIES).optional(),
    group: objectId.optional(),
    sort: z.enum(['-createdAt', '-score']).optional().default('-createdAt'),
  })
  .strict();

export const voteSchema = z
  .object({
    value: z.union([z.literal(1), z.literal(-1)]),
  })
  .strict();

export const commentSchema = z
  .object({
    body: z.string().trim().min(1, 'Comment cannot be empty').max(4000, 'A comment cannot exceed 4000 characters'),
    parent: objectId.optional().nullable(),
  })
  .strict();

export const updateCommentSchema = z
  .object({
    body: z.string().trim().min(1, 'Comment cannot be empty').max(4000, 'A comment cannot exceed 4000 characters'),
  })
  .strict();

export const idParamSchema = z.object({ id: objectId }).strict();
export const discussionAndCommentParamSchema = z
  .object({ discussionId: objectId, commentId: objectId })
  .strict();
