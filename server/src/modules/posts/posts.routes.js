import { postCommentsRouter } from '../comments/comments.routes.js';
import { Router } from 'express';
import { optionalAuth, protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { createLimiter } from '../../middleware/rateLimit.js';
import { handleUpload, uploadMedia } from '../../middleware/upload.js';
import {
  createPostSchema,
  feedQuerySchema,
  idParamSchema,
  pollVoteSchema,
  updatePostSchema,
} from '../../validators/post.validator.js';
import {
  create,
  feed,
  getOne,
  update,
  remove,
  like,
  save,
  share,
  vote,
  savedPosts,
  postLikes,
} from './posts.controller.js';

const router = Router();

// ── Static routes first: these would otherwise be swallowed by `/:id` ──────
router.get('/feed', optionalAuth, validate({ query: feedQuerySchema }), feed);
router.get('/saved', protect, savedPosts);

router.post('/', protect, createLimiter, handleUpload(uploadMedia, 'files'), validate({ body: createPostSchema }), create);

// ── Single post ───────────────────────────────────────────────────────────
router.get('/:id', optionalAuth, validate({ params: idParamSchema }), getOne);
router.put('/:id', protect, validate({ params: idParamSchema, body: updatePostSchema }), update);
router.delete('/:id', protect, validate({ params: idParamSchema }), remove);

router.post('/:id/like', protect, validate({ params: idParamSchema }), like);
router.post('/:id/save', protect, validate({ params: idParamSchema }), save);
router.post('/:id/share', protect, validate({ params: idParamSchema }), share);
router.post('/:id/vote', protect, validate({ params: idParamSchema, body: pollVoteSchema }), vote);
router.get('/:id/likes', optionalAuth, validate({ params: idParamSchema }), postLikes);



router.use('/:id/comments', postCommentsRouter);

export default router;
