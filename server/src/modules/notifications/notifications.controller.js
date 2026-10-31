import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination } from '../../utils/pagination.js';
import {
  countUnread,
  listNotifications,
  markAllRead,
  markRead,
  pruneDeletedPosts,
} from './notifications.service.js';

/** GET /api/notifications?unread=1 */
export const list = asyncHandler(async (req, res) => {
  const page = getPagination(req);
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';

  const result = await listNotifications(req.user._id, page, unreadOnly);
  res.json({
    success: true,
    data: result.data,
    pagination: result.pagination,
    unreadCount: result.unreadCount,
  });
});

/** GET /api/notifications/unread-count — polled by the topbar badge. */
export const unreadCount = asyncHandler(async (req, res) => {
  const count = await countUnread(req.user._id);
  res.json({ success: true, data: { count } });
});

/** PATCH /api/notifications/:id/read */
export const readOne = asyncHandler(async (req, res) => {
  const notification = await markRead(req.params.id, req.user._id);
  res.json({ success: true, message: 'Marked as read', data: notification });
});

/** PATCH /api/notifications/read-all */
export const readAll = asyncHandler(async (req, res) => {
  const result = await markAllRead(req.user._id);
  res.json({ success: true, message: 'All notifications marked as read', data: result });
});

/** DELETE /api/notifications/cleared — notifications whose post is gone. */
export const prune = asyncHandler(async (req, res) => {
  const removed = await pruneDeletedPosts(req.user._id);
  res.json({ success: true, message: 'Cleaned up', data: { removed } });
});
