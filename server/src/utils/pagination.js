import { ApiError } from './ApiError.js';

export const DEFAULT_LIMIT = 15;
export const MAX_LIMIT = 50;

/**
 * Cursor pagination for reverse-chronological collections.
 *
 * The cursor is always the `_id` of the last item returned. ObjectIds are
 * monotonically increasing, so `_id` ordering matches insertion order and the
 * feed stays gap-free when new posts land at the top between page requests —
 * something offset pagination cannot do.
 *
 * @param {import('express').Request} req
 * @param {{ defaultSort?: '-createdAt' | 'createdAt', maxLimit?: number }} [opts]
 */
export function getPagination(req, opts = {}) {
  const { defaultSort = '-createdAt', maxLimit = MAX_LIMIT } = opts;

  // `req.query` values are whatever the query parser produced. Express's default
  // `qs` parser turns `?limit[gt]=1` into an object, so every read below is
  // type-guarded rather than assumed: an object reaching `Number.parseInt` or
  // being concatenated into a sort key is how a malformed query becomes a 500
  // or, worse, an unvalidated sort specification reaching Mongo.
  const rawLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : DEFAULT_LIMIT;

  const requested = typeof req.query.sort === 'string' ? req.query.sort.trim() : defaultSort;
  const sort = requested === 'createdAt' ? 'createdAt' : defaultSort;

  const cursor =
    typeof req.query.cursor === 'string' && /^[a-f0-9]{24}$/i.test(req.query.cursor)
      ? req.query.cursor
      : null;

  return { limit, sort, cursor };
}

/**
 * Translates a cursor into a Mongo range filter matching `sort`.
 * @param {ReturnType<typeof getPagination>} page
 */
export function cursorToRange(page) {
  if (!page.cursor) return null;
  const operator = page.sort.startsWith('-') ? '$lt' : '$gt';
  return { _id: { [operator]: page.cursor } };
}

/**
 * Builds `{ data, pagination: { nextCursor, hasMore, limit } }`.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 */
export function paginatedResponse(items, limit) {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? data[data.length - 1]?._id?.toString() ?? null : null;

  return {
    data,
    pagination: { nextCursor, hasMore, limit },
  };
}

/** Guard for routes that need a numeric id path segment. */
export function assertObjectId(id, label = 'id') {
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    throw ApiError.badRequest(`Invalid ${label}`);
  }
  return id;
}
