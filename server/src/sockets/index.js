import { Server } from 'socket.io';
import { env, allowedOrigins } from '../config/env.js';
import { verifyAccessToken } from '../modules/auth/index.js';
import { User } from '../modules/users/User.model.js';
import { Conversation } from '../modules/messages/Conversation.model.js';
import * as messageService from '../modules/messages/message.service.js';

/** @type {import('socket.io').Server | null} */
let io = null;

/** userId -> Set<socketId>, so one user can be online from several tabs. */
const presence = new Map();

export function initSockets(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));

    try {
      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).select('name username avatar suspended');
      if (!user || user.suspended) return next(new Error('Unauthorized'));

      socket.user = user;
      return next();
    } catch {
      return next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    if (!presence.has(userId)) presence.set(userId, new Set());
    presence.get(userId).add(socket.id);

    io.emit('presence:online', { userId });
    socket.join(`user:${userId}`);

    socket.on('conversation:join', async (conversationId, callback) => {
      try {
        const isParticipant = await Conversation.exists({
          _id: conversationId,
          participants: userId,
        });

        if (!isParticipant) {
          if (typeof callback === 'function') callback({ error: 'Unauthorized to join conversation' });
          return;
        }

        socket.join(`conversation:${conversationId}`);
        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        if (typeof callback === 'function') callback({ error: 'Invalid conversation ID' });
      }
    });

    socket.on('conversation:leave', (conversationId) => {
      // It is safe to just leave a room you were in
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('message:send', async ({ conversationId, content, kind, attachment }, callback) => {
      try {
        // `createMessage` validates its own payload (see the note there), so
        // this path enforces the same rules as the REST route. Participation is
        // checked inside the service as well — before any write.
        const message = await messageService.createMessage(
          conversationId,
          { content, kind, attachment },
          userId
        );

        // Broadcast to all active users in the conversation room
        io.to(`conversation:${conversationId}`).emit('message:new', message);

        if (typeof callback === 'function') callback({ success: true, data: message });
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    socket.on('message:read', async ({ conversationId }, callback) => {
      try {
        // Service securely ensures the viewer is a participant
        await messageService.markMessagesRead(conversationId, userId);
        
        io.to(`conversation:${conversationId}`).emit('message:read', {
          conversationId,
          userId,
        });

        if (typeof callback === 'function') callback({ success: true });
      } catch (err) {
        if (typeof callback === 'function') callback({ error: err.message });
      }
    });

    socket.on('typing:start', ({ conversationId }) => {
      // Only broadcast if the socket has successfully joined the conversation room
      if (socket.rooms.has(`conversation:${conversationId}`)) {
        socket.to(`conversation:${conversationId}`).emit('typing:start', { conversationId, userId });
      }
    });
    
    socket.on('typing:stop', ({ conversationId }) => {
      if (socket.rooms.has(`conversation:${conversationId}`)) {
        socket.to(`conversation:${conversationId}`).emit('typing:stop', { conversationId, userId });
      }
    });

    socket.on('disconnect', () => {
      const sockets = presence.get(userId);
      sockets?.delete(socket.id);
      if (sockets && sockets.size === 0) {
        presence.delete(userId);
        io.emit('presence:offline', { userId });
      }
    });
  });

  return io;
}

export function getIO() {
  return io;
}

export function isOnline(userId) {
  return presence.has(userId.toString());
}

/**
 * Closes every realtime connection and clears the presence map.
 *
 * Part of the graceful-shutdown sequence (see `shutdownHandler`). Without it,
 * `server.close()` waits on upgraded sockets that stay open indefinitely, and
 * the presence map would still report users as online on a process that is on
 * its way out — so the next instance boots believing everyone is already here.
 *
 * Safe to call when sockets were never initialised.
 */
export async function closeSockets() {
  if (!io) return;

  presence.clear();

  await new Promise((resolve) => {
    // `close()` also disconnects clients, which lets them reconnect
    // immediately rather than waiting out a transport timeout.
    io.close(() => resolve());
  });

  io = null;
}
