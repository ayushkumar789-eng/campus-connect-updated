import { Router } from 'express';
import mongoose from 'mongoose';
import { authRoutes } from '../modules/auth/index.js';
import { usersRoutes } from '../modules/users/index.js';
import { postsRoutes } from '../modules/posts/index.js';
import { commentRoutes } from '../modules/comments/comments.routes.js';
import { searchRoutes } from '../modules/search/index.js';
import reportRoutes from '../modules/reports/report.routes.js';
import { notificationRoutes } from '../modules/notifications/index.js';
import { storageInfo } from '../infrastructure/storage/storage.service.js';

const router = Router();

/**
 * Liveness + readiness probe. Safe to call without a session, and excluded
 * from the API rate limiter (see `apiLimiter`) so a platform health checker is
 * never throttled into reporting a false outage.
 *
 * `status` reports the *database*, not just that the process is alive. An
 * orchestrator that only checks liveness will keep a process in rotation that
 * cannot serve a single request because Mongo is unreachable, so a disconnected
 * database is reported as 503 and takes the instance out of the load balancer.
 *
 * Nothing here is secret: `storageInfo()` returns booleans and a provider name,
 * never a path, credential or connection string.
 */
router.get('/health', (_req, res) => {
  // 1 === connected, per Mongoose's documented readyState values.
  const databaseConnected = mongoose.connection.readyState === 1;
  const body = {
    success: databaseConnected,
    data: {
      status: databaseConnected ? 'ok' : 'degraded',
      database: databaseConnected ? 'connected' : 'disconnected',
      service: 'campusconnect-api',
      storage: storageInfo(),
      timestamp: new Date().toISOString(),
    },
  };

  res.status(databaseConnected ? 200 : 503).json(body);
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/posts', postsRoutes);
router.use('/comments', commentRoutes);
router.use('/search', searchRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);

import { noteRoutes } from '../modules/notes/index.js';
import { groupsRoutes } from '../modules/groups/index.js';
import discussionRoutes from '../modules/discussions/discussion.routes.js';
import messageRoutes from '../modules/messages/message.routes.js';

// Phase 3–6 modules mount here as they are built:
router.use('/notes', noteRoutes);
router.use('/groups', groupsRoutes);
router.use('/discussions', discussionRoutes);
router.use('/conversations', messageRoutes); // Mount as conversations for RESTful design
import { eventsRoutes } from '../modules/events/index.js';
router.use('/events', eventsRoutes);
//   /api/admin
export default router;
