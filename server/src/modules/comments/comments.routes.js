import { Router } from 'express';
import { protect, optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { commentLimiter } from '../../middleware/rateLimit.js';
import { idParamSchema } from '../../validators/post.validator.js';
import { removeComment, listComments, createComment } from './comments.controller.js';
import { commentSchema } from '../../validators/post.validator.js';

const router = Router();

router.delete('/:id', protect, validate({ params: idParamSchema }), removeComment);

// Nested routes will be mounted in posts.routes.js or handled directly here if mounted at /posts
// But for now, since they were in posts.routes.js, we will create a router for /:postId/comments
const postCommentsRouter = Router({ mergeParams: true });
postCommentsRouter.get('/', optionalAuth, validate({ params: idParamSchema }), listComments);
// `commentLimiter` follows `protect` so it can key on the authenticated user
// rather than the caller's IP — see the NAT rationale in rateLimit.js.
postCommentsRouter.post(
  '/',
  protect,
  commentLimiter,
  validate({ params: idParamSchema, body: commentSchema }),
  createComment,
);

export { router as commentRoutes, postCommentsRouter };
