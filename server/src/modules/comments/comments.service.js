import { Comment } from '../posts/Comment.model.js';
import { Post } from '../posts/Post.model.js';
import { Notification } from '../notifications/Notification.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { notify } from '../auth/index.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';
import { AUTHOR_FIELDS } from '../../shared/constants.js';

export async function addComment(postId, user, { content, parent }) {
  const post = await Post.findById(postId).select('_id author');
  if (!post) throw ApiError.notFound('Post not found');

  let parentDoc = null;
  if (parent) {
    parentDoc = await Comment.findById(parent).select('post author parent');
    if (!parentDoc || String(parentDoc.post) !== String(postId)) {
      throw ApiError.badRequest('The comment you are replying to no longer exists');
    }
    // Threads are two levels deep and no deeper, because that is the only
    // shape `getComments` reads back: the top level, then the replies hanging
    // off it. Without this guard a reply to a reply was accepted, counted in
    // `post.commentCount`, and then unreachable through the API or the UI —
    // a comment the author could write but never see again. Refusing it here
    // also keeps `deleteComment`'s one-level cascade complete, so its
    // `-(1 + replyCount)` adjustment stays exact.
    if (parentDoc.parent) {
      throw ApiError.badRequest('Replies can only go one level deep — reply to the top-level comment instead');
    }
  }

  const comment = await Comment.create({ post: postId, author: user._id, parent: parent ?? null, content });

  const increments = [Post.updateOne({ _id: postId }, { $inc: { commentCount: 1 } })];
  if (parentDoc) increments.push(Comment.updateOne({ _id: parentDoc._id }, { $inc: { replyCount: 1 } }));

  await Promise.all(increments);

  const recipient = parentDoc ? parentDoc.author : post.author;
  // `entity.comment` is the identity of *this* comment, which is what lets a
  // second comment by the same author on the same post produce its own
  // notification instead of being deduplicated against the first, and what lets
  // `deleteComment` find and remove exactly the rows this comment caused.
  //
  // `entity.type` stays the post: that is what the inbox renders an excerpt
  // for and what its row links to, and keeping it unchanged means every row
  // written before this field existed still reads and links correctly.
  await notify({
    recipient,
    actor: user._id,
    type: parentDoc ? 'reply' : 'comment',
    entity: { type: postId, model: 'Post', comment: comment._id },
    text: parentDoc ? 'replied to your comment' : 'commented on your post',
  });

  return serialiseComment(comment, user._id);
}

/** Threaded comments: top level plus one level of replies. */
export async function getComments(postId, viewerId, page) {
  const filter = { post: postId, parent: null };
  const range = cursorToRange(page);
  if (range) Object.assign(filter, range);

  const comments = await Comment.find(filter)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('author', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(comments, page.limit);
  if (!data.length) return { data: [], pagination };

  const replies = await Comment.find({ parent: { $in: data.map((c) => c._id) } })
    .sort('createdAt')
    .populate('author', AUTHOR_FIELDS)
    .lean();

  const byParent = new Map();
  for (const reply of replies) {
    const key = String(reply.parent);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(serialiseComment(reply, viewerId));
  }

  return {
    data: data.map((c) => ({
      ...serialiseComment(c, viewerId),
      replies: byParent.get(String(c._id)) ?? [],
    })),
    pagination,
  };
}

export function serialiseComment(comment, viewerId) {
  return {
    id: comment._id,
    post: comment.post?._id ?? comment.post,
    parent: comment.parent ?? null,
    content: comment.content,
    likeCount: comment.likeCount,
    replyCount: comment.replyCount,
    isLiked: viewerId ? (comment.likedBy ?? []).some((id) => String(id) === String(viewerId)) : false,
    isOwner: viewerId ? String(comment.author?._id ?? comment.author) === String(viewerId) : false,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    author: comment.author
      ? {
          id: comment.author._id ?? comment.author,
          name: comment.author.name,
          username: comment.author.username,
          avatar: comment.author.avatar?.url ?? '',
        }
      : null,
  };
}

export async function deleteComment(commentId, user) {
  const comment = await Comment.findById(commentId);
  if (!comment) throw ApiError.notFound('Comment not found');

  const isOwner = String(comment.author) === String(user._id);
  if (!isOwner && user.role !== 'admin') throw ApiError.forbidden('You can only delete your own comments');

  const replyCount = comment.replyCount ?? 0;

  // A reply's notifications hang off the reply's own id, so the cascade has to
  // collect them before the rows are deleted. Collected up front because the
  // deleteMany below is what removes the ids we would otherwise query for.
  const replyIds = await Comment.find({ parent: commentId }).select('_id').lean();
  const doomedCommentIds = [commentId, ...replyIds.map((r) => r._id)];

  await Promise.all([
    comment.deleteOne(),
    Comment.deleteMany({ parent: commentId }),
    Post.updateOne({ _id: comment.post, commentCount: { $gt: 0 } }, { $inc: { commentCount: -(1 + replyCount) } }),
    comment.parent
      ? Comment.updateOne({ _id: comment.parent, replyCount: { $gt: 0 } }, { $inc: { replyCount: -1 } })
      : Promise.resolve(),
    // Without this the inbox keeps a "replied to your comment" row whose
    // subject no longer exists — a notification about a comment that is gone,
    // pointing at a thread it is no longer part of.
    Notification.deleteMany({ 'entity.comment': { $in: doomedCommentIds } }),
  ]);
}

/** The viewer's bookmarks. */
