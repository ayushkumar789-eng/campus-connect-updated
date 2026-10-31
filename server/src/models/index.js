/**
 * Registers every model with Mongoose.
 *
 * Two reasons this exists rather than each caller importing what it needs:
 *
 *  • Index creation only happens for models that have actually been registered.
 *    A model nobody has imported yet silently has no indexes — no unique
 *    constraint, no protection from a duplicate write.
 *  • A new model is then covered automatically. Forgetting to add it somewhere
 *    is the failure mode; there is nothing here to forget.
 */

// eslint-disable-next-line no-unused-vars
import { User } from '../modules/users/User.model.js';
// eslint-disable-next-line no-unused-vars
import { Follow } from '../modules/users/Follow.model.js';
// eslint-disable-next-line no-unused-vars
import { Post } from '../modules/posts/Post.model.js';
// eslint-disable-next-line no-unused-vars
import { Comment } from '../modules/posts/Comment.model.js';
// eslint-disable-next-line no-unused-vars
import { Like } from '../modules/posts/Like.model.js';
// eslint-disable-next-line no-unused-vars
import { SavedPost } from '../modules/saved/SavedPost.model.js';
// eslint-disable-next-line no-unused-vars
import { Notification } from '../modules/notifications/Notification.model.js';
// eslint-disable-next-line no-unused-vars
import { Report } from '../modules/reports/Report.model.js';
// eslint-disable-next-line no-unused-vars
import { Note } from '../modules/notes/Note.model.js';
// eslint-disable-next-line no-unused-vars
import { Group } from '../modules/groups/Group.model.js';
// eslint-disable-next-line no-unused-vars
import { GroupMember } from '../modules/groups/GroupMember.model.js';
// eslint-disable-next-line no-unused-vars
import { Discussion } from '../modules/discussions/Discussion.model.js';
// eslint-disable-next-line no-unused-vars
import { DiscussionComment } from '../modules/discussions/DiscussionComment.model.js';
// eslint-disable-next-line no-unused-vars
import { Event } from '../modules/events/Event.model.js';
// eslint-disable-next-line no-unused-vars
import { EventRegistration } from '../modules/events/EventRegistration.model.js';
// eslint-disable-next-line no-unused-vars
import { Conversation } from '../modules/messages/Conversation.model.js';
// eslint-disable-next-line no-unused-vars
import { Message } from '../modules/messages/Message.model.js';
// eslint-disable-next-line no-unused-vars
import { VerificationToken } from '../modules/auth/index.js';

export {
  User,
  Follow,
  Post,
  Comment,
  Like,
  SavedPost,
  Notification,
  Report,
  Note,
  Group,
  GroupMember,
  Discussion,
  DiscussionComment,
  Event,
  EventRegistration,
  Conversation,
  Message,
  VerificationToken,
};
