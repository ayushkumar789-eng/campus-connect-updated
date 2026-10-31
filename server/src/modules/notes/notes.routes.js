import { Router } from 'express';
import { optionalAuth, protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { handleSingleUpload, uploadResource, MEDIA_OR_DOC } from '../../middleware/upload.js';
import {
  createNoteSchema,
  updateNoteSchema,
  listNotesQuerySchema,
  idParamSchema,
} from '../../validators/note.validator.js';
import {
  listNotes,
  getNote,
  create,
  update,
  remove,
  downloadCount,
} from './notes.controller.js';

const router = Router();

router.get('/', optionalAuth, validate({ query: listNotesQuerySchema }), listNotes);

router.post(
  '/',
  protect,
  handleSingleUpload(uploadResource, 'file', MEDIA_OR_DOC),
  validate({ body: createNoteSchema }),
  create
);

router.get('/:id', optionalAuth, validate({ params: idParamSchema }), getNote);

router.put(
  '/:id',
  protect,
  handleSingleUpload(uploadResource, 'file', MEDIA_OR_DOC),
  validate({ params: idParamSchema, body: updateNoteSchema }),
  update
);

router.delete('/:id', protect, validate({ params: idParamSchema }), remove);

// This route allows incrementing the download count
router.post('/:id/download', optionalAuth, validate({ params: idParamSchema }), downloadCount);

export default router;
