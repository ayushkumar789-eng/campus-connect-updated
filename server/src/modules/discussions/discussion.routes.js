import { Router } from 'express';
import { protect, optionalAuth } from '../../middleware/auth.js';
import * as discussionController from './discussion.controller.js';

const router = Router();

// Global discussion lists and details (allows optional auth for public viewing)
router.get('/', optionalAuth, discussionController.listDiscussions);
router.get('/:id', optionalAuth, discussionController.getDiscussion);
router.get('/:id/comments', optionalAuth, discussionController.listComments);

// Requires authentication
router.use(protect);

// Discussion operations
router.post('/', discussionController.createDiscussion);
router.put('/:id', discussionController.updateDiscussion);
router.delete('/:id', discussionController.deleteDiscussion);
router.post('/:id/vote', discussionController.voteDiscussion);

// Comment operations
router.post('/:id/comments', discussionController.createComment);
router.put('/comments/:id', discussionController.updateComment);
router.delete('/comments/:id', discussionController.deleteComment);
router.post('/comments/:id/vote', discussionController.voteComment);

// Answer operation
router.put('/:discussionId/answer/:commentId', discussionController.markAsAnswer);

export default router;
