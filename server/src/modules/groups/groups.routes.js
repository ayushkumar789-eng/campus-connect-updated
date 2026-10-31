import { Router } from 'express';
import { protect, optionalAuth } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { handleSingleUpload, uploadMedia } from '../../middleware/upload.js';
import * as controller from './groups.controller.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema, memberParamSchema } from '../../validators/group.validator.js';

const router = Router();

router.get('/', optionalAuth, asyncHandler(controller.listGroups));
router.get('/:id', optionalAuth, validate({ params: idParamSchema }), asyncHandler(controller.getGroupDetails));
router.get('/:id/posts', optionalAuth, validate({ params: idParamSchema }), asyncHandler(controller.getGroupPosts));

router.post(
  '/',
  protect,
  handleSingleUpload(uploadMedia, 'coverImage'),
  asyncHandler(controller.createGroup)
);

router.put(
  '/:id',
  protect,
  validate({ params: idParamSchema }),
  handleSingleUpload(uploadMedia, 'coverImage'),
  asyncHandler(controller.updateGroup)
);

router.delete('/:id', protect, validate({ params: idParamSchema }), asyncHandler(controller.deleteGroup));

// Membership
router.post('/:id/join', protect, validate({ params: idParamSchema }), asyncHandler(controller.joinGroup));
router.post('/:id/leave', protect, validate({ params: idParamSchema }), asyncHandler(controller.leaveGroup));

router.get('/:id/members', optionalAuth, validate({ params: idParamSchema }), asyncHandler(controller.listMembers));
router.put('/:id/members/:userId', protect, validate({ params: memberParamSchema }), asyncHandler(controller.updateMemberRole));
router.delete('/:id/members/:userId', protect, validate({ params: memberParamSchema }), asyncHandler(controller.removeMember));

export default router;
