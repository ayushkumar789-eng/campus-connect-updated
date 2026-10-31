import { Conversation } from './Conversation.model.js';
import { Message } from './Message.model.js';
import { User } from '../users/User.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { cursorToRange, paginatedResponse } from '../../utils/pagination.js';
import { AUTHOR_FIELDS } from '../../shared/constants.js';
import { createMessageSchema } from '../../validators/message.validator.js';

function serialiseConversation(conv) {
  return {
    id: conv._id,
    kind: conv.kind,
    participants: conv.participants.map(p => ({
      id: p._id,
      name: p.name,
      username: p.username,
      avatar: p.avatar?.url || '',
    })),
    lastMessage: conv.lastMessage,
    lastMessageAt: conv.lastMessageAt,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

function serialiseMessage(msg) {
  return {
    id: msg._id,
    conversation: msg.conversation,
    sender: {
      id: msg.sender._id || msg.sender,
      name: msg.sender.name,
      username: msg.sender.username,
      avatar: msg.sender.avatar?.url || '',
    },
    kind: msg.kind,
    content: msg.content,
    attachment: msg.attachment,
    readBy: msg.readBy,
    readAt: msg.readAt,
    editedAt: msg.editedAt,
    deletedAt: msg.deletedAt,
    createdAt: msg.createdAt,
    updatedAt: msg.updatedAt,
  };
}

export async function createConversation(participantId, viewerId) {
  if (participantId === viewerId.toString()) {
    throw ApiError.badRequest('Cannot create a conversation with yourself');
  }

  const userExists = await User.exists({ _id: participantId });
  if (!userExists) {
    throw ApiError.notFound('User not found');
  }

  // Ensure participants are always sorted to prevent duplicate creation attempts 
  // (though the schema handles unique direct conversations, sorting ensures consistency)
  const participants = [viewerId.toString(), participantId].sort();

  let conversation = await Conversation.findOne({
    kind: 'direct',
    participants: { $all: participants, $size: 2 },
  }).populate('participants', AUTHOR_FIELDS);

  if (!conversation) {
    try {
      conversation = await Conversation.create({
        kind: 'direct',
        participants,
      });
      await conversation.populate('participants', AUTHOR_FIELDS);
    } catch (err) {
      // Handle potential race condition where it was just created
      if (err.code === 11000) {
        conversation = await Conversation.findOne({
          kind: 'direct',
          participants: { $all: participants, $size: 2 },
        }).populate('participants', AUTHOR_FIELDS);
      } else {
        throw err;
      }
    }
  }

  return serialiseConversation(conversation);
}

export async function getConversations(viewerId, page) {
  const query = { participants: viewerId };
  
  // Conversations are always sorted by `lastMessageAt` below, but the cursor is
  // an `_id`. Those two only line up when the caller left the default sort, so
  // paginate on `_id` there and fall back to no cursor otherwise rather than
  // silently applying an ID window to a timestamp sort.
  const range = cursorToRange(page);
  if (range && !page.sort.startsWith('-')) {
    query._id = range._id;
  }

  const items = await Conversation.find(query)
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(page.limit + 1)
    .populate('participants', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(items, page.limit);

  return {
    data: data.map(c => serialiseConversation(c)),
    pagination,
  };
}

export async function getConversation(conversationId, viewerId) {
  const conversation = await Conversation.findById(conversationId).populate('participants', AUTHOR_FIELDS).lean();
  if (!conversation) throw ApiError.notFound('Conversation not found');

  const isParticipant = conversation.participants.some(p => p._id.toString() === viewerId.toString());
  if (!isParticipant) throw ApiError.forbidden('You are not a participant in this conversation');

  return serialiseConversation(conversation);
}

export async function getMessages(conversationId, viewerId, page) {
  const conversation = await Conversation.findById(conversationId).select('participants');
  if (!conversation) throw ApiError.notFound('Conversation not found');

  const isParticipant = conversation.participants.some(p => p.toString() === viewerId.toString());
  if (!isParticipant) throw ApiError.forbidden('You are not a participant in this conversation');

  const query = { conversation: conversationId };
  const range = cursorToRange(page);
  if (range) {
    query._id = range._id;
  }

  const items = await Message.find(query)
    .sort(page.sort)
    .limit(page.limit + 1)
    .populate('sender', AUTHOR_FIELDS)
    .lean();

  const { data, pagination } = paginatedResponse(items, page.limit);

  return {
    data: data.map(serialiseMessage),
    pagination,
  };
}

export async function createMessage(conversationId, payload, viewerId) {
  // Validate at the service boundary, not only in the route middleware.
  //
  // This function is reachable from two places: the REST route (which runs
  // `createMessageSchema`) and the Socket.IO `message:send` handler, which calls
  // the service directly and therefore bypassed every validator. That gap let a
  // socket client set an arbitrary `kind`, exceed the 4000-character limit, or
  // smuggle in an `attachment` object with keys the REST path rejects — so the
  // two entry points enforced different rules over the same write.
  //
  // Parsing here makes the service safe regardless of caller.
  //
  // `attachment` is included in the parse rather than read off the raw payload.
  // A previous version of this comment claimed `.strict()` alone was enough,
  // which was wrong: strict mode only rejects unknown *keys*, and `attachment`
  // was being picked up from `payload` directly. A socket client could therefore
  // set any `url`, `name` or `mimetype` it liked on a message it sent to someone
  // else. It is now a declared, constrained object.
  const parsed = createMessageSchema.parse({
    content: payload?.content,
    kind: payload?.kind,
    attachment: payload?.attachment,
  });

  // An attachment only counts as content if it actually points at a stored
  // file. An all-empty attachment used to satisfy this guard and produce a
  // message with no text and no reachable file.
  const hasAttachment = Boolean(parsed.attachment?.url);

  if (!parsed.content && !hasAttachment) {
    throw ApiError.badRequest('Message must contain content or an attachment');
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found');

  const isParticipant = conversation.participants.some(p => p.toString() === viewerId.toString());
  if (!isParticipant) throw ApiError.forbidden('You are not a participant in this conversation');

  const message = await Message.create({
    conversation: conversationId,
    sender: viewerId,
    content: parsed.content || '',
    kind: hasAttachment ? parsed.kind : 'text',
    ...(hasAttachment ? { attachment: parsed.attachment } : {}),
    readBy: [viewerId],
    readAt: new Date(),
  });

  await message.populate('sender', AUTHOR_FIELDS);

  // Update conversation last message
  conversation.lastMessage = {
    // Trimmed to match what the notification excerpt stores (see below), so
    // the sidebar preview and the inbox copy cannot disagree.
    content: message.kind === 'text' ? message.content.substring(0, 100) : `[${message.kind}]`,
    sender: viewerId,
    createdAt: message.createdAt,
    type: message.kind,
  };
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  // Create notifications for other participants
  const { Notification } = await import('../notifications/Notification.model.js');
  const otherParticipants = conversation.participants.filter(p => p.toString() !== viewerId.toString());
  
  const notifications = otherParticipants.map(participantId => ({
    recipient: participantId,
    actor: viewerId,
    type: 'message',
    entity: {
      type: conversationId,
      model: 'Conversation',
    },
    text: (message.content ?? '').substring(0, 100),
  }));

  if (notifications.length > 0) {
    // `ordered: false` so one duplicate cannot abort the rest, and the unique
    // index on (recipient, actor, type, entity.model, entity.type,
    // entity.comment) collapses repeats into a single unread notification per
    // conversation — which is the intent, not a failure.
    await Notification.insertMany(notifications, { ordered: false }).catch(() => {});
  }

  return serialiseMessage(message.toObject());
}

export async function markMessagesRead(conversationId, viewerId) {
  const conversation = await Conversation.findById(conversationId).select('participants');
  if (!conversation) throw ApiError.notFound('Conversation not found');

  const isParticipant = conversation.participants.some(p => p.toString() === viewerId.toString());
  if (!isParticipant) throw ApiError.forbidden('You are not a participant in this conversation');

  await Message.updateMany(
    { conversation: conversationId, readBy: { $ne: viewerId } },
    { 
      $addToSet: { readBy: viewerId },
      $set: { readAt: new Date() } 
    }
  );

  return { success: true };
}
