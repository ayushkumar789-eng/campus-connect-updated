import { Notification } from './Notification.model.js';
import { Post } from '../posts/Post.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';
import { AUTHOR_FIELDS } from '../../shared/constants.js';

/**
 * Fallback copy per notification type. The stored `text` is the verb phrase
 * written at the time of the event; this covers rows created before a phrase
 * existed.
 */
const COPY = {
  follow: 'started following you',
  like: 'liked your post',
  comment: 'commented on your post',
  reply: 'replied to your comment',
  share: 'shared your post',
  message: 'sent you a message',
  group_invite: 'invited you to a group',
  group_announcement: 'posted an announcement in your group',
  note_activity: 'activity on your notes',
  event_reminder: 'reminded you about an event',
};

/**
 * Turns a notification document into the shape the client renders.
 *
 * @param {object} doc lean notification
 * @param {Map<string, {content: string, author: object|null}>} [posts] post excerpts by id
 */
export function serialiseNotification(doc, posts = new Map()) {
  const isPost = doc.entity?.model === 'Post';
  const excerpt = isPost ? posts.get(String(doc.entity.type)) : null;

  return {
    id: doc._id,
    type: doc.type,
    // The stored verb phrase wins so wording changes do not rewrite history.
    text: doc.text || COPY[doc.type] || 'interacted with you',
    read: doc.read,
    createdAt: doc.createdAt,
    actor: doc.actor
      ? {
          id: doc.actor._id,
          name: doc.actor.name,
          username: doc.actor.username,
          avatar: doc.actor.avatar?.url ?? '',
        }
      : null,
    entity: doc.entity?.type
      ? {
          model: doc.entity.model,
          id: doc.entity.type,
          // The comment that caused this notification, when it was caused by
          // one. `id` remains the post for every type — that is what the row
          // renders an excerpt for and links to — so this is additive and
          // changes nothing for likes, shares, follows or legacy rows.
          commentId: doc.entity.comment ?? null,
          // Posts are inlined enough for the list to render without a second
          // round trip; anything else only needs a link target.
          content: excerpt?.content ?? '',
          author: excerpt?.author ?? null,
        }
      : null,
  };
}

/**
 * Resolves the post excerpts a page of notifications refers to, in one query.
 * @param {Array<{ entity?: { model?: string, type?: unknown } | null }>} rows
 */
async function loadPostExcerpts(rows) {
  const ids = rows
    .filter((row) => row.entity?.model === 'Post' && row.entity.type)
    .map((row) => row.entity.type);

  if (!ids.length) return new Map();

  const posts = await Post.find({ _id: { $in: ids } })
    .select('content')
    .populate('author', 'name username')
    .lean();

  return new Map(
    posts.map((post) => [
      String(post._id),
      {
        content: post.content ?? '',
        author: post.author ? { name: post.author.name, username: post.author.username } : null,
      },
    ]),
  );
}

/**
 * The viewer's notifications, newest first, with a single unread total.
 *
 * Post excerpts are hydrated with one batched query rather than a `populate` on
 * `entity.type`: the ref is polymorphic, so populating it unconditionally
 * would null out the id of every non-Post notification.
 *
 * @param {string} userId
 * @param {{ limit: number, sort: string, cursor: string|null }} page
 * @param {boolean} [unreadOnly]
 */
export async function listNotifications(userId, page, unreadOnly = false) {
  const filter = { recipient: userId };
  if (unreadOnly) filter.read = false;

  const range = cursorToRange(page);
  if (range) Object.assign(filter, range);

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort(page.sort)
      .limit(page.limit + 1)
      .populate('actor', AUTHOR_FIELDS)
      .lean(),
    Notification.countDocuments({ recipient: userId, read: false }),
  ]);

  const { data, pagination } = paginatedResponse(items, page.limit);
  const excerpts = await loadPostExcerpts(data);

  return {
    data: data.map((item) => serialiseNotification(item, excerpts)),
    pagination,
    unreadCount,
  };
}

export async function countUnread(userId) {
  return Notification.countDocuments({ recipient: userId, read: false });
}

/** Marks one notification read. Scoped to the recipient so ids cannot be probed. */
export async function markRead(notificationId, userId) {
  const updated = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { read: true } },
    { new: true },
  );
  if (!updated) throw ApiError.notFound('Notification not found');
  return serialiseNotification(updated.toObject(), await loadPostExcerpts([updated.toObject()]));
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { recipient: userId, read: false },
    { $set: { read: true } },
  );
  return { updated: result.modifiedCount ?? 0 };
}

/**
 * Housekeeping: drops notifications whose post has since been deleted, so a
 * deleted post does not leave a permanently dead row in someone's list.
 */
export async function pruneDeletedPosts(userId) {
  const stale = await Notification.find({ recipient: userId, 'entity.model': 'Post' })
    .select('entity.type')
    .lean();

  const ids = stale.map((n) => n.entity?.type).filter(Boolean);
  if (!ids.length) return 0;

  const alive = await Post.find({ _id: { $in: ids } }).select('_id').lean();
  const aliveIds = new Set(alive.map((p) => String(p._id)));
  const dead = ids.filter((id) => !aliveIds.has(String(id)));

  if (!dead.length) return 0;
  const result = await Notification.deleteMany({ recipient: userId, 'entity.type': { $in: dead } });
  return result.deletedCount ?? 0;
}
