import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { handleSingleUpload, uploadResource, MEDIA_OR_DOC } from '../../middleware/upload.js';
import {
  createConversationSchema,
  createMessageSchema,
  idParamSchema,
  listMessagesQuerySchema,
} from '../../validators/message.validator.js';
import {
  listConversations,
  getConversation,
  createConversation,
  listMessages,
  createMessage,
  markRead,
} from './message.controller.js';

const router = Router();

// Ensure all message routes require authentication
router.use(protect);

// Conversations
router.get('/', listConversations);

router.post(
  '/',
  validate({ body: createConversationSchema }),
  createConversation
);

router.get(
  '/:id',
  validate({ params: idParamSchema }),
  getConversation
);

// Messages inside a conversation
router.get(
  '/:id/messages',
  validate({ params: idParamSchema, query: listMessagesQuerySchema }),
  listMessages
);

router.post(
  '/:id/messages',
  handleSingleUpload(uploadResource, 'file', MEDIA_OR_DOC),
  validate({ params: idParamSchema, body: createMessageSchema }),
  createMessage
);

router.post(
  '/:id/messages/read',
  validate({ params: idParamSchema }),
  markRead
);

export default router;
