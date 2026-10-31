import { z } from 'zod';
import { POST_TYPES, POST_VISIBILITY } from '../modules/posts/Post.model.js';
import { objectId, optionalText } from './common.js';

export const createPostSchema = z
  .object({
    content: z.string().trim().max(2200, 'A post cannot exceed 2200 characters').optional().default(''),
    type: z.enum(POST_TYPES).optional(),
    visibility: z.enum(POST_VISIBILITY).optional().default('public'),
    group: objectId.optional().nullable(),
    resourceTitle: optionalText(140),
    poll: z
      .object({
        question: z.string().trim().min(3, 'Ask a question').max(200),
        options: z
          .array(z.string().trim().min(1, 'Option cannot be empty').max(80))
          .min(2, 'A poll needs at least 2 options')
          .max(6, 'A poll can have at most 6 options'),
        endsAt: z.preprocess((v) => (v === '' || v === undefined ? undefined : v), z.coerce.date().optional().nullable()),
      })
      .optional(),
  })
  .strict();

export const updatePostSchema = z
  .object({
    content: z.string().trim().min(1, 'Post cannot be empty').max(2200, 'A post cannot exceed 2200 characters'),
  })
  .strict();

export const pollVoteSchema = z.object({ optionId: objectId }).strict();

export const commentSchema = z
  .object({
    content: z.string().trim().min(1, 'Comment cannot be empty').max(1000, 'A comment cannot exceed 1000 characters'),
    parent: objectId.optional().nullable(),
  })
  .strict();

export const idParamSchema = z.object({ id: objectId }).strict();

/** Path params accept either a Mongo id or a username. */
export const userParamSchema = z
  .object({ id: z.string().regex(/^([a-f0-9]{24}|[a-z0-9_.]{3,24})$/i, 'Invalid user id or username') })
  .strict();

export const connectionsParamSchema = z
  .object({
    id: z.string().regex(/^([a-f0-9]{24}|[a-z0-9_.]{3,24})$/i, 'Invalid user id or username'),
    direction: z.enum(['followers', 'following']),
  })
  .strict();

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter something to search').max(120, 'Search query is too long'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

export const listUsersQuerySchema = z.object({
  search: optionalText(60),
  course: optionalText(40),
  year: z.coerce.number().int().min(1).max(6).optional(),
  college: optionalText(120),
  skill: optionalText(40),
  cursor: z
    .string()
    .regex(/^[a-f0-9]{24}$/i, 'Invalid cursor')
    .optional(),
  sort: z.enum(['-followersCount', 'name']).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional().default(12),
});

/**
 * Shared cursor params, validated rather than hand-parsed.
 *
 * `getPagination` already defends itself — it whitelist-matches `sort`, regexes
 * `cursor` and `parseInt`s `limit`, so an operator-shaped value falls back to the
 * default instead of reaching Mongo. This schema exists so a route that has not
 * been hardened by accident fails visibly at the edge, and so the accepted set is
 * documented once rather than inferred from three `typeof` checks.
 */
export const paginationQuery = {
  cursor: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid cursor').optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  sort: z.enum(['-createdAt', 'createdAt']).optional(),
};

/**
 * Query for an author's post list.
 *
 * `group` is the field that needed this. It reached the Mongo filter straight
 * from `req.query`, so `?group[$ne]=null` put a real operator into
 * `filter.group`. It only failed because Mongoose then tried to cast the value
 * to an ObjectId — a side effect of the schema's typing, not a guard anyone
 * wrote. Loosen that type and the injection starts working silently. Validated
 * here so the rejection is deliberate and the error says what was wrong.
 */
export const userPostsQuerySchema = z
  .object({ ...paginationQuery, group: objectId.optional() })
  .strict();

/** Query for the home feed. */
export const feedQuerySchema = z
  .object({ ...paginationQuery, scope: z.enum(['following', 'all']).optional() })
  .strict();

export const reportSchema = z
  .object({
    targetType: z.enum(['post', 'comment', 'discussion', 'note', 'user', 'group', 'message']),
    targetId: objectId,
    reason: z.enum(['spam', 'harassment', 'hate_speech', 'misinformation', 'copyright', 'inappropriate_content', 'other']),
    details: z.string().trim().max(500, 'Please keep details under 500 characters').optional().default(''),
  })
  .strict();
