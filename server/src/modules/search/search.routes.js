import { Router } from 'express';
import { optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { searchLimiter } from '../../middleware/rateLimit.js';
import { searchQuerySchema } from '../../validators/post.validator.js';
import { search } from './search.controller.js';

const router = Router();

// Optional auth: search works for signed-out visitors, and the response is
// simply personalised (isFollowing / isLiked) when a session is present.
//
// `searchLimiter` sits *after* `optionalAuth` on purpose: it keys on the
// authenticated user when there is one, so a campus sharing a single NAT
// address is not throttled as one bucket, while a signed-in account still
// cannot sweep the five collections back to back.
router.get('/', optionalAuth, searchLimiter, validate({ query: searchQuerySchema }), search);

export default router;
