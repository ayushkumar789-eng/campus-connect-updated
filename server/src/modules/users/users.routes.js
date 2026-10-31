import { Router } from 'express';
import { optionalAuth, protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { handleSingleUpload, uploadAvatar } from '../../middleware/upload.js';
import {
  connectionsParamSchema,
  listUsersQuerySchema,
  userParamSchema,
  userPostsQuerySchema,
} from '../../validators/post.validator.js';
import { updateProfileSchema } from '../../validators/auth.validator.js';
import {
  listUsers,
  suggestedUsers,
  getUser,
  updateUser,
  follow,
  unfollow,
  connections,
  userPosts,
} from './users.controller.js';

const router = Router();

// Static segments must be registered before the `/:id` and `/:id/:direction`
// catch-alls, otherwise Express matches `/:id/:direction` first and the literal
// "posts" fails the direction enum with a 400.
router.get('/suggested', protect, suggestedUsers);
router.get('/', optionalAuth, validate({ query: listUsersQuerySchema }), listUsers);

// `group` is validated here because it reaches the Mongo filter directly. Left
// raw, `?group[$ne]=null` becomes an operator in the query.
router.get(
  '/:id/posts',
  optionalAuth,
  validate({ params: userParamSchema, query: userPostsQuerySchema }),
  userPosts,
);

router.get('/:id', optionalAuth, validate({ params: userParamSchema }), getUser);

router.put(
  '/:id',
  protect,
  validate({ params: userParamSchema, body: updateProfileSchema }),
  handleSingleUpload(uploadAvatar, 'avatar'),
  updateUser,
);

router.post('/:id/follow', protect, validate({ params: userParamSchema }), follow);
router.delete('/:id/follow', protect, validate({ params: userParamSchema }), unfollow);

router.get(
  '/:id/:direction',
  protect,
  validate({ params: connectionsParamSchema }),
  connections,
);

export default router;
