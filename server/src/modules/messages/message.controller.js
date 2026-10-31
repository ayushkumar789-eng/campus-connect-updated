import { asyncHandler } from '../../utils/asyncHandler.js';
import { getPagination } from '../../utils/pagination.js';
import { uploadFile } from '../../infrastructure/storage/storage.service.js';
import * as messageService from './message.service.js';

export const listConversations = asyncHandler(async (req, res) => {
  const page = getPagination(req, { defaultSort: '-lastMessageAt' });
  const result = await messageService.getConversations(req.user._id, page);
  res.json(result);
});

export const getConversation = asyncHandler(async (req, res) => {
  const result = await messageService.getConversation(req.params.id, req.user._id);
  res.json({ data: result });
});

export const createConversation = asyncHandler(async (req, res) => {
  const result = await messageService.createConversation(req.body.participantId, req.user._id);
  res.status(201).json({ data: result });
});

export const listMessages = asyncHandler(async (req, res) => {
  const page = getPagination(req, { defaultSort: '-createdAt' });
  const result = await messageService.getMessages(req.params.id, req.user._id, page);
  res.json(result);
});

export const createMessage = asyncHandler(async (req, res) => {
  const payload = {
    content: req.body.content,
    kind: req.body.kind,
  };

  if (req.file) {
    // The upload is actually persisted here.
    //
    // This previously read `req.file.path || req.file.url`, and the uploader is
    // configured with `memoryStorage()`, so neither field ever exists. The
    // message was stored with `attachment.url === ''` and the file was
    // discarded the moment the request finished — the recipient saw a
    // permanently broken attachment. `uploadFile` is the existing storage
    // entry point that already does the provider, extension and private/public
    // handling; the route's `MEDIA_OR_DOC` allow-list and the byte sniffer have
    // both already vetted the buffer by this point.
    const stored = await uploadFile(req.file, { folder: 'chat' });

    payload.attachment = {
      url: stored.publicId,
      publicId: stored.publicId,
      name: stored.name,
      mimetype: stored.mimetype,
      size: stored.size,
    };
    payload.kind = stored.mimetype.startsWith('image/') ? 'image' : 'file';
  }

  const result = await messageService.createMessage(req.params.id, payload, req.user._id);
  res.status(201).json({ data: result });
});

export const markRead = asyncHandler(async (req, res) => {
  await messageService.markMessagesRead(req.params.id, req.user._id);
  res.json({ data: { success: true } });
});
