import { Discussion } from './Discussion.model.js';
import { DiscussionComment } from './DiscussionComment.model.js';
import { getGroupAndMembership } from '../groups/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';
import { AUTHOR_FIELDS } from '../../shared/constants.js';

export function serialiseDiscussion(discussion, viewerId = null) {
  const author = discussion.author
    ? {
        id: discussion.author._id ?? discussion.author,
        name: discussion.author.name,
        username: discussion.author.username,
        avatar: discussion.author.avatar?.url ?? '',
      }
    : null;

  let viewerVote = 0;
  if (viewerId) {
    const vote = discussion.votes?.find((v) => String(v.user) === String(viewerId));
    if (vote) viewerVote = vote.value;
  }

  return {
    id: discussion._id,
    title: discussion.title,
    body: discussion.body,
    category: discussion.category,
    tags: discussion.tags,
    author,
    group: discussion.group ?? null,
    score: discussion.score,
    upvotes: discussion.upvotes,
    downvotes: discussion.downvotes,
    commentCount: discussion.commentCount,
    viewCount: discussion.viewCount,
    isAnswered: discussion.isAnswered,
    isPinned: discussion.isPinned,
    viewerVote,
    isOwner: viewerId ? String(discussion.author?._id ?? discussion.author) === String(viewerId) : false,
    createdAt: discussion.createdAt,
    updatedAt: discussion.updatedAt,
  };
}

export function serialiseComment(comment, viewerId = null) {
  const author = comment.author
    ? {
        id: comment.author._id ?? comment.author,
        name: comment.author.name,
        username: comment.author.username,
        avatar: comment.author.avatar?.url ?? '',
      }
    : null;

  let viewerVote = 0;
  if (viewerId) {
    const vote = comment.votes?.find((v) => String(v.user) === String(viewerId));
    if (vote) viewerVote = vote.value;
  }

  return {
    id: comment._id,
    discussion: comment.discussion,
    author,
    parent: comment.parent ?? null,
    body: comment.body,
    score: comment.score,
    isAnswer: comment.isAnswer,
    viewerVote,
    isOwner: viewerId ? String(comment.author?._id ?? comment.author) === String(viewerId) : false,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

async function verifyGroupAccess(groupId, viewerId) {
  const { group, role } = await getGroupAndMembership(groupId, viewerId);
  if (group.isPrivate && !role) {
    throw ApiError.forbidden('This is a private group');
  }
}

export async function listDiscussions(filter, page, viewerId) {
  const query = {};

  if (filter.search) {
    query.$text = { $search: filter.search };
  }
  if (filter.category) {
    query.category = filter.category;
  }
  if (filter.group) {
    await verifyGroupAccess(filter.group, viewerId);
    query.group = filter.group;
  } else {
    // Exclude group discussions from global listing
    query.group = null;
  }

  const range = cursorToRange(page);
  if (range && !filter.search) {
    // When sorting by score, cursor should technically handle score + _id.
    // For simplicity following existing cursorToRange which provides _id inequalities.
    query._id = range._id;
  }

  const items = await Discussion.find(query)
    .sort(filter.search ? { score: { $meta: 'textScore' } } : page.sort)
    .limit(page.limit + 1)
    .populate('author', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(items, page.limit);

  return {
    data: data.map((d) => serialiseDiscussion(d, viewerId)),
    pagination,
  };
}

export async function getDiscussion(id, viewerId) {
  const discussion = await Discussion.findByIdAndUpdate(
    id,
    { $inc: { viewCount: 1 } },
    { new: true }
  ).populate('author', AUTHOR_FIELDS).lean();

  if (!discussion) throw ApiError.notFound('Discussion not found');

  if (discussion.group) {
    const isOwner = viewerId && String(discussion.author._id) === String(viewerId);
    if (!isOwner) {
      await verifyGroupAccess(discussion.group, viewerId);
    }
  }

  return serialiseDiscussion(discussion, viewerId);
}

export async function createDiscussion(input, authorId) {
  if (input.group) {
    const { role } = await getGroupAndMembership(input.group, authorId);
    if (!role) {
      throw ApiError.forbidden('You must be a member of the group to start a discussion in it');
    }
  }

  const discussion = new Discussion({ ...input, author: authorId });
  await discussion.save();
  await discussion.populate('author', AUTHOR_FIELDS);

  return serialiseDiscussion(discussion.toObject(), authorId);
}

export async function updateDiscussion(id, input, user) {
  const discussion = await Discussion.findById(id);
  if (!discussion) throw ApiError.notFound('Discussion not found');

  const isOwner = String(discussion.author) === String(user._id);
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You can only edit your own discussions');
  }

  Object.assign(discussion, input);
  await discussion.save();
  await discussion.populate('author', AUTHOR_FIELDS);

  return serialiseDiscussion(discussion.toObject(), user._id);
}

export async function deleteDiscussion(id, user) {
  const discussion = await Discussion.findById(id);
  if (!discussion) throw ApiError.notFound('Discussion not found');

  const isOwner = String(discussion.author) === String(user._id);
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own discussions');
  }

  await DiscussionComment.deleteMany({ discussion: id });
  await discussion.deleteOne();
  return { id };
}

export async function voteDiscussion(id, value, userId) {
  const discussion = await Discussion.findById(id);
  if (!discussion) throw ApiError.notFound('Discussion not found');
  
  if (discussion.group) {
     await verifyGroupAccess(discussion.group, userId);
  }

  const voteIndex = discussion.votes.findIndex((v) => String(v.user) === String(userId));
  
  if (voteIndex >= 0) {
    if (discussion.votes[voteIndex].value === value) {
      discussion.votes.splice(voteIndex, 1);
    } else {
      discussion.votes[voteIndex].value = value;
    }
  } else {
    discussion.votes.push({ user: userId, value });
  }

  const upvotes = discussion.votes.filter(v => v.value === 1).length;
  const downvotes = discussion.votes.filter(v => v.value === -1).length;
  discussion.upvotes = upvotes;
  discussion.downvotes = downvotes;
  discussion.score = upvotes - downvotes;

  await discussion.save();
  return { id, score: discussion.score, upvotes, downvotes, viewerVote: voteIndex >= 0 && discussion.votes.length > voteIndex && discussion.votes[voteIndex].value === value ? value : (voteIndex >=0 && discussion.votes.length === voteIndex ? 0 : value) };
}

export async function listComments(discussionId, page, viewerId) {
  const discussion = await Discussion.findById(discussionId).lean();
  if (!discussion) throw ApiError.notFound('Discussion not found');
  
  if (discussion.group) {
    await verifyGroupAccess(discussion.group, viewerId);
  }

  const range = cursorToRange(page);
  const query = { discussion: discussionId };
  if (range) query._id = range._id;

  const items = await DiscussionComment.find(query)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('author', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(items, page.limit);

  return {
    data: data.map((c) => serialiseComment(c, viewerId)),
    pagination,
  };
}

export async function createComment(discussionId, input, authorId) {
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) throw ApiError.notFound('Discussion not found');

  if (discussion.group) {
    await verifyGroupAccess(discussion.group, authorId);
  }
  
  if (input.parent) {
    const parentComment = await DiscussionComment.findById(input.parent);
    if (!parentComment || String(parentComment.discussion) !== String(discussionId)) {
      throw ApiError.badRequest('Invalid parent comment');
    }
  }

  const comment = new DiscussionComment({ ...input, discussion: discussionId, author: authorId });
  await comment.save();
  await comment.populate('author', AUTHOR_FIELDS);

  discussion.commentCount += 1;
  await discussion.save();

  return serialiseComment(comment.toObject(), authorId);
}

export async function updateComment(id, input, user) {
  const comment = await DiscussionComment.findById(id);
  if (!comment) throw ApiError.notFound('Comment not found');

  const isOwner = String(comment.author) === String(user._id);
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You can only edit your own comments');
  }

  comment.body = input.body;
  await comment.save();
  await comment.populate('author', AUTHOR_FIELDS);

  return serialiseComment(comment.toObject(), user._id);
}

export async function deleteComment(id, user) {
  const comment = await DiscussionComment.findById(id);
  if (!comment) throw ApiError.notFound('Comment not found');

  const isOwner = String(comment.author) === String(user._id);
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('You can only delete your own comments');
  }

  const discussionId = comment.discussion;
  await comment.deleteOne();

  await Discussion.findByIdAndUpdate(discussionId, { $inc: { commentCount: -1 } });
  
  return { id };
}

export async function voteComment(id, value, userId) {
  const comment = await DiscussionComment.findById(id).populate('discussion');
  if (!comment) throw ApiError.notFound('Comment not found');
  
  if (comment.discussion?.group) {
     await verifyGroupAccess(comment.discussion.group, userId);
  }

  const voteIndex = comment.votes.findIndex((v) => String(v.user) === String(userId));
  let finalVote = 0;
  
  if (voteIndex >= 0) {
    if (comment.votes[voteIndex].value === value) {
      comment.votes.splice(voteIndex, 1);
    } else {
      comment.votes[voteIndex].value = value;
      finalVote = value;
    }
  } else {
    comment.votes.push({ user: userId, value });
    finalVote = value;
  }

  const upvotes = comment.votes.filter(v => v.value === 1).length;
  const downvotes = comment.votes.filter(v => v.value === -1).length;
  comment.score = upvotes - downvotes;

  await comment.save();
  return { id, score: comment.score, viewerVote: finalVote };
}

export async function markAsAnswer(discussionId, commentId, user) {
  const discussion = await Discussion.findById(discussionId);
  if (!discussion) throw ApiError.notFound('Discussion not found');

  const isOwner = String(discussion.author) === String(user._id);
  if (!isOwner && user.role !== 'admin') {
    throw ApiError.forbidden('Only the author can mark an answer');
  }

  const comment = await DiscussionComment.findById(commentId);
  if (!comment || String(comment.discussion) !== String(discussionId)) {
    throw ApiError.badRequest('Comment does not belong to this discussion');
  }

  await DiscussionComment.updateMany(
    { discussion: discussionId, isAnswer: true },
    { $set: { isAnswer: false } }
  );

  comment.isAnswer = true;
  await comment.save();

  discussion.isAnswered = true;
  await discussion.save();

  return { discussionId, commentId, isAnswer: true };
}
