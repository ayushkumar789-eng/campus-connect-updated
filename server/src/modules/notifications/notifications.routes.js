import { Router } from 'express';
import { protect } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParamSchema } from '../../validators/post.validator.js';
import { list, prune, readAll, readOne, unreadCount } from './notifications.controller.js';

const router = Router();

router.use(protect);

// Static segments must be registered before `/:id/read`.
router.get('/unread-count', unreadCount);
router.patch('/read-all', readAll);
router.delete('/cleared', prune);

router.get('/', list);
router.patch('/:id/read', validate({ params: idParamSchema }), readOne);

export default router;
