import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { reportSchema } from '../../validators/post.validator.js';
import { report } from '../posts/posts.controller.js';

const router = Router();

router.post('/', protect, validate({ body: reportSchema }), report);

export default router;
