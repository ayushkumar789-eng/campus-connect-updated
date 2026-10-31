import mongoose from 'mongoose';
import { Post } from './Post.model.js';
import { User } from '../users/User.model.js';
import { Group } from '../groups/Group.model.js';
import { GroupMember } from '../groups/GroupMember.model.js';
import { Like } from './Like.model.js';
import { SavedPost } from '../saved/SavedPost.model.js';
import { Comment } from './Comment.model.js';
import { Follow } from '../users/Follow.model.js';
import { Report } from '../reports/Report.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadFiles, deleteFile } from '../../infrastructure/storage/storage.service.js';
import { notify } from '../auth/index.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';
import { AUTHOR_FIELDS } from '../../shared/constants.js';

/**
 * Turns a Post document into the exact shape the client renders, including
 * viewer-relative flags and poll tallies.
 */
/**
 * The viewer's bookmarks among `posts`, as a Set of post-id strings.
 *
 * Bookmarks are a separate collection, so a list endpoint cannot derive them
 * from the Post document the way `isLiked` is derived from `likedBy`. One
 * query per page — not one per post — keeps this out of N+1 territory. Returns
 * an empty Set for a signed-out viewer, so `isSaved` is always a boolean.
 */
export async function savedIdsFor(viewerId, posts) {
  const ids = posts.map((p) => p._id ?? p.id).filter(Boolean);
  if (!viewerId || ids.length === 0) return new Set();
  const rows = await SavedPost.find({ user: viewerId, post: { $in: ids } }).select('post').lean();
  return new Set(rows.map((r) => String(r.post)));
}

export function serialisePost(post, viewerId = null, savedIds = null) {
  const liked = viewerId ? post.likedBy?.some((id) => String(id) === String(viewerId)) : false;
  const poll = post.poll
    ? {
        question: post.poll.question,
        endsAt: post.poll.endsAt,
        totalVotes: post.poll.totalVotes ?? 0,
        isClosed: Boolean(post.poll.endsAt && post.poll.endsAt.getTime() < Date.now()),
        options: post.poll.options.map((opt) => {
          const voterIds = (opt.votes ?? []).map((v) => String(v));
          const votes = voterIds.length;
          return {
            id: opt._id.toString(),
            text: opt.text,
            votes,
            percentage: post.poll.totalVotes ? Math.round((votes / post.poll.totalVotes) * 100) : 0,
            hasVoted: viewerId ? voterIds.includes(String(viewerId)) : false,
          };
        }),
      }
    : null;

  const author = post.author
    ? {
        id: post.author._id ?? post.author,
        name: post.author.name,
        username: post.author.username,
        avatar: post.author.avatar?.url ?? '',
        college: post.author.college,
        course: post.author.course,
        year: post.author.year,
      }
    : null;

  return {
    id: post._id,
    author,
    content: post.content,
    type: post.type,
    media: post.media,
    poll,
    resource: post.resource,
    group: post.group ?? null,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    shareCount: post.shareCount,
    saveCount: post.saveCount,
    isLiked: liked,
    // Always a real boolean, even with no viewer. `isLiked` and friends are
    // derived from fields already on the Post document, but a bookmark lives in
    // its own collection, so it has to be resolved by the caller — see
    // `savedIdsFor`. Omitting it left every list endpoint sending
    // `isSaved: undefined`, which the card renders as "Save post": bookmark a
    // post, refresh, and the bookmark silently reads as gone.
    isSaved: savedIds ? savedIds.has(String(post._id)) : false,
    isOwner: viewerId ? String(post.author?._id ?? post.author) === String(viewerId) : false,
    editedAt: post.editedAt,
    createdAt: post.createdAt,
  };
}

/**
 * Creates a post. Uploaded files are attached as media (images/video) or as a
 * single downloadable resource, depending on the requested type.
 *
 * @param {object} input validated body
 * @param {string} authorId
 * @param {Express.Multer.File[]} files
 */
export async function createPost(input, authorId, files = []) {
  const { content, type, visibility, group, poll, resourceTitle } = input;

  if (!content && !files.length && !poll) {
    throw ApiError.badRequest('A post needs some text, media or a poll', [
      { field: 'content', message: 'Write something or attach a file' },
    ]);
  }

  if (visibility === 'group') {
    if (!group) throw ApiError.badRequest('A group ID must be provided for group posts');
    const membership = await GroupMember.findOne({ group, user: authorId });
    if (!membership) {
      throw ApiError.forbidden('You must be a member of the group to post in it');
    }
  }

  const payload = { author: authorId, content: content ?? '', visibility: visibility ?? 'public', group: group ?? null };

  if (files.length) {
    const looksLikeResource = type === 'resource' || (!type && !poll && files.length === 1 && !String(files[0].mimetype).startsWith('image/') && !String(files[0].mimetype).startsWith('video/'));

    if (looksLikeResource) {
      const [uploaded] = await uploadFiles(files, { folder: 'resources' });
      payload.type = 'resource';
      payload.resource = {
        title: resourceTitle || uploaded.name,
        fileUrl: uploaded.url,
        publicId: uploaded.publicId,
        name: uploaded.name,
        mimetype: uploaded.mimetype,
        size: uploaded.size,
      };
    } else {
      const uploads = await uploadFiles(files, { folder: 'posts' });
      payload.media = uploads.map((u) => ({
        url: u.url,
        publicId: u.publicId,
        name: u.name,
        mimetype: u.mimetype,
        size: u.size,
      }));
      const hasVideo = uploads.some((u) => u.mimetype.startsWith('video/'));
      payload.type = hasVideo ? 'video' : 'image';
    }
  }

  if (poll) {
    payload.type = 'poll';
    payload.poll = {
      question: poll.question,
      options: poll.options.map((text) => ({ text, votes: [] })),
      endsAt: poll.endsAt ?? null,
      totalVotes: 0,
    };
  } else if (!payload.type) {
    payload.type = 'text';
  }

  const post = await Post.create(payload);
  await User.updateOne({ _id: authorId }, { $inc: { postsCount: 1 } });

  const populated = await post.populate('author', AUTHOR_FIELDS);
  return serialisePost(populated, authorId);
}

/**
 * The home feed.
 * @param {string|null} viewerId
 * @param {{ limit: number, sort: string, cursor: string|null }} page
 * @param {'following'|'all'} scope
 */
export async function getFeed(viewerId, page, scope = 'following') {
  const filter = { visibility: 'public' };

  if (scope === 'following' && viewerId) {
    // Own posts + followed accounts. An empty follow list means an empty feed,
    // which is intentional: we surface that as an onboarding state.
    const following = await Follow.find({ follower: viewerId }).select('following').lean();
    filter.$or = [
      { author: { $in: following.map((f) => f.following) } },
      { author: viewerId },
    ];
  }

  const range = cursorToRange(page);
  if (range) Object.assign(filter, range);

  const posts = await Post.find(filter)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('author', AUTHOR_FIELDS)
    .lean({ virtuals: false });

  const { data, pagination } = paginatedResponse(posts, page.limit);
  const savedIds = await savedIdsFor(viewerId, data);
  return { data: data.map((p) => serialisePost(p, viewerId, savedIds)), pagination };
}

/** Posts written by one user, optionally filtered to a group. */
export async function getPostsByAuthor(authorId, viewerId, page, { group } = {}) {
  const filter = { author: authorId, visibility: 'public' };
  if (group) filter.group = group;

  const range = cursorToRange(page);
  if (range) Object.assign(filter, range);

  const posts = await Post.find(filter)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('author', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(posts, page.limit);
  const savedIds = await savedIdsFor(viewerId, data);
  return { data: data.map((p) => serialisePost(p, viewerId, savedIds)), pagination };
}

export async function getPostsByGroup(groupId, viewerId, page) {
  const groupDoc = await Group.findById(groupId);
  if (!groupDoc) throw ApiError.notFound('Group not found');
  
  if (groupDoc.isPrivate) {
    if (!viewerId) throw ApiError.forbidden('Private group');
    const membership = await GroupMember.exists({ group: groupId, user: viewerId });
    if (!membership) throw ApiError.forbidden('Private group');
  }

  const filter = { group: groupId };
  const range = cursorToRange(page);
  if (range) Object.assign(filter, range);

  const posts = await Post.find(filter)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('author', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(posts, page.limit);
  const savedIds = await savedIdsFor(viewerId, data);
  return { data: data.map((p) => serialisePost(p, viewerId, savedIds)), pagination };
}

export async function getPostById(postId, viewerId) {
  const post = await Post.findById(postId).populate('author', AUTHOR_FIELDS);
  if (!post) throw ApiError.notFound('Post not found');

  const isOwner = viewerId && String(post.author._id) === String(viewerId);
  if (post.visibility === 'group' && !isOwner) {
    const groupDoc = await Group.findById(post.group);
    if (!groupDoc) throw ApiError.notFound('Group not found');
    
    if (groupDoc.isPrivate) {
      if (!viewerId) throw ApiError.forbidden('This post belongs to a private group');
      const membership = await GroupMember.exists({ group: post.group, user: viewerId });
      if (!membership) {
        throw ApiError.forbidden('This post belongs to a private group');
      }
    }
  }

  const [isSaved] = viewerId
    ? await Promise.all([SavedPost.exists({ user: viewerId, post: postId })])
    : [false];

  return { ...serialisePost(post, viewerId), isSaved: Boolean(isSaved) };
}

export async function updatePost(postId, user, content) {
  const post = await Post.findById(postId);
  if (!post) throw ApiError.notFound('Post not found');
  if (String(post.author) !== String(user._id)) throw ApiError.forbidden('You can only edit your own posts');
  if (post.type === 'poll') throw ApiError.badRequest('Poll content cannot be edited after creation');

  post.content = content;
  post.editedAt = new Date();
  await post.save();

  const populated = await post.populate('author', AUTHOR_FIELDS);
  return serialisePost(populated, user._id);
}

/** Deletes a post, its comments/likes/saves, and the author's counter. */
export async function deletePost(postId, user) {
  const post = await Post.findById(postId);
  if (!post) throw ApiError.notFound('Post not found');

  const isOwner = String(post.author) === String(user._id);
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own posts');
  }

  await Promise.all([
    post.deleteOne(),
    Comment.deleteMany({ post: postId }),
    Like.deleteMany({ post: postId }),
    SavedPost.deleteMany({ post: postId }),
    User.updateOne({ _id: post.author, postsCount: { $gt: 0 } }, { $inc: { postsCount: -1 } }),
  ]);

  // Best-effort cleanup of uploaded files.
  for (const media of post.media ?? []) await deleteFile(media.publicId, 'local-or-cloudinary');
  if (post.resource?.publicId) await deleteFile(post.resource.publicId, 'local-or-cloudinary');
}

/**
 * Toggles a like. Returns the new state so the UI never has to guess.
 * Also maintains both the Like record and the Post counter in one place.
 */
export async function toggleLike(postId, userId) {
  const post = await Post.findById(postId).select('_id author likedBy likeCount');
  if (!post) throw ApiError.notFound('Post not found');

  const alreadyLiked = post.likedBy.some((id) => String(id) === String(userId));

  if (alreadyLiked) {
    await Promise.all([
      Like.deleteOne({ user: userId, post: postId }),
      Post.updateOne({ _id: postId }, { $pull: { likedBy: userId }, $inc: { likeCount: -1 } }),
    ]);
    await Post.updateOne({ _id: postId, likeCount: { $lt: 0 } }, { $set: { likeCount: 0 } });
    return { liked: false, likeCount: Math.max(0, post.likeCount - 1) };
  }

  await Like.create({ user: userId, post: postId });
  const updated = await Post.findByIdAndUpdate(
    postId,
    { $addToSet: { likedBy: userId }, $inc: { likeCount: 1 } },
    { new: true },
  ).select('likeCount author');

  await notify({
    recipient: updated.author,
    actor: userId,
    type: 'like',
    entity: { type: postId, model: 'Post' },
    text: 'liked your post',
  });

  return { liked: true, likeCount: updated.likeCount };
}

export async function toggleSave(postId, userId) {
  const post = await Post.findById(postId).select('_id');
  if (!post) throw ApiError.notFound('Post not found');

  const existing = await SavedPost.findOne({ user: userId, post: postId });

  if (existing) {
    await Promise.all([
      existing.deleteOne(),
      Post.updateOne({ _id: postId, saveCount: { $gt: 0 } }, { $inc: { saveCount: -1 } }),
    ]);
    return { saved: false };
  }

  await SavedPost.create({ user: userId, post: postId });
  await Post.updateOne({ _id: postId }, { $inc: { saveCount: 1 } });
  return { saved: true };
}

export async function sharePost(postId, userId) {
  const post = await Post.findByIdAndUpdate(
    postId,
    { $addToSet: { sharedBy: userId }, $inc: { shareCount: 1 } },
    { new: true },
  ).select('shareCount author');

  if (!post) throw ApiError.notFound('Post not found');

  await notify({
    recipient: post.author,
    actor: userId,
    type: 'share',
    entity: { type: postId, model: 'Post' },
    text: 'shared your post',
  });

  return { shareCount: post.shareCount };
}

/**
 * Casts a poll vote, replacing any previous vote by the same user.
 * The total is recomputed from the options rather than incremented, so it stays
 * exact even if a client votes twice or a request is retried.
 */
export async function votePoll(postId, userId, optionId) {
  const post = await Post.findById(postId).select('_id poll');
  if (!post) throw ApiError.notFound('Post not found');
  if (!post.poll) throw ApiError.badRequest('This post is not a poll');
  if (post.poll.endsAt && post.poll.endsAt.getTime() < Date.now()) {
    throw ApiError.badRequest('This poll has closed');
  }
  if (!post.poll.options.some((o) => String(o._id) === String(optionId))) {
    throw ApiError.badRequest('That option does not exist on this poll');
  }

  const optionObjectId = new mongoose.Types.ObjectId(String(optionId));

  // 1. Clear any previous vote this user cast.
  await Post.updateOne({ _id: postId }, { $pull: { 'poll.options.$[].votes': userId } });

  // 2. Record the new vote. $addToSet keeps it idempotent under retries.
  const result = await Post.updateOne(
    { _id: postId, 'poll.options._id': optionObjectId },
    { $addToSet: { 'poll.options.$[opt].votes': userId } },
    { arrayFilters: [{ 'opt._id': optionObjectId }] },
  );

  if (!result.matchedCount) throw ApiError.badRequest('That option does not exist on this poll');

  // 3. Recount from the stored options.
  const fresh = await Post.findById(postId).select('poll');
  fresh.poll.totalVotes = fresh.poll.options.reduce((sum, o) => sum + (o.votes?.length ?? 0), 0);
  await fresh.save();

  return serialisePost(await Post.findById(postId).populate('author', AUTHOR_FIELDS), userId);
}

/** Adds a top-level comment or a reply to an existing one. */
export async function getSavedPosts(userId, page) {
  const filter = { user: userId };
  if (page.cursor) filter._id = { $lt: page.cursor };

  const saved = await SavedPost.find(filter)
    .sort('-createdAt')
    .limit(page.limit + 1)
    .populate({ path: 'post', populate: { path: 'author', select: AUTHOR_FIELDS } })
    .lean();

  const hasMore = saved.length > page.limit;
  const pageItems = hasMore ? saved.slice(0, page.limit) : saved;

  return {
    // `isSaved` is definitionally true here. Leaving it off made every card on
    // this page render as unsaved, so the button read "Save post" while the
    // endpoint behind it *toggles* — clicking the control labelled "Save" on
    // your saved list removed the post. The label has to describe the action
    // the click will actually take.
    data: pageItems
      .map((s) => s.post)
      .filter(Boolean)
      .map((p) => ({ ...serialisePost(p, userId), isSaved: true })),
    pagination: {
      nextCursor: hasMore ? pageItems[pageItems.length - 1]._id.toString() : null,
      hasMore,
      limit: page.limit,
    },
  };
}

/**
 * Files a moderation report. Returns false when the viewer already reported
 * this item, so the UI can show "already reported" instead of erroring.
 */
export async function reportContent({ reporter, targetType, targetId, reason, details }) {
  const exists = await Report.findOne({ reporter, targetType, targetId }).lean();
  if (exists) return { alreadyReported: true };

  await Report.create({ reporter, targetType, targetId, reason, details });
  return { alreadyReported: false };
}
