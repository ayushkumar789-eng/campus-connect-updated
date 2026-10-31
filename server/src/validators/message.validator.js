import { z } from 'zod';
import { objectId, optionalText } from './common.js';
import { paginationQuery } from './post.validator.js';
import { MESSAGE_KINDS } from '../modules/messages/Message.model.js';

export const createConversationSchema = z
  .object({
    participantId: objectId,
  })
  .strict();

/**
 * Attachment metadata.
 *
 * `url` is a storage key this application minted, never a client-supplied link.
 * A client that could set this freely could make a peer's client fetch any URL
 * it liked and render it as if it were an attachment, which is a
 * fetch-arbitrary-origin primitive rather than a file feature. Over REST the
 * value is produced by `uploadFile` in the controller, never read from the
 * request body; over a socket it is accepted only because it has to be, and is
 * therefore constrained to a relative key under our own `/uploads` prefix.
 */
const attachmentSchema = z
  .object({
    url: z
      .string()
      .trim()
      .max(300)
      // Only a key under our own uploads prefix, never an absolute URL.
      .refine((v) => v === '' || v.startsWith('uploads/'), 'Attachment must be a stored upload key')
      .optional()
      .default(''),
    publicId: z.string().trim().max(300).optional().default(''),
    name: z.string().trim().max(200).optional().default(''),
    mimetype: z.string().trim().max(120).optional().default(''),
    size: z.coerce.number().int().min(0).max(50 * 1024 * 1024).optional().default(0),
  })
  .strict();

export const createMessageSchema = z
  .object({
    content: optionalText(4000),
    kind: z.enum(MESSAGE_KINDS).optional().default('text'),
    attachment: attachmentSchema.optional(),
  })
  .strict();

export const idParamSchema = z.object({ id: objectId }).strict();

export const listMessagesQuerySchema = z.object({
  ...paginationQuery,
}).strict();
