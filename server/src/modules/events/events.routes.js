import { Router } from 'express';
import { protect, optionalAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { handleSingleUpload, uploadMedia } from '../../middleware/upload.js';
import * as controller from './events.controller.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../validators/event.validator.js';

const router = Router();

router.get('/', optionalAuth, asyncHandler(controller.listEvents));
router.get('/:id', optionalAuth, validate({ params: idParamSchema }), asyncHandler(controller.getEventDetails));

router.post(
  '/',
  protect,
  handleSingleUpload(uploadMedia, 'coverImage'),
  asyncHandler(controller.createEvent)
);

router.put(
  '/:id',
  protect,
  validate({ params: idParamSchema }),
  handleSingleUpload(uploadMedia, 'coverImage'),
  asyncHandler(controller.updateEvent)
);

router.delete('/:id', protect, validate({ params: idParamSchema }), asyncHandler(controller.deleteEvent));

router.post('/:id/register', protect, validate({ params: idParamSchema }), asyncHandler(controller.register));
router.delete('/:id/register', protect, validate({ params: idParamSchema }), asyncHandler(controller.cancelRegistration));
router.get('/:id/attendees', optionalAuth, validate({ params: idParamSchema }), asyncHandler(controller.getAttendees));
router.get('/:id/registration', protect, validate({ params: idParamSchema }), asyncHandler(controller.getRegistrationStatus));

export default router;
