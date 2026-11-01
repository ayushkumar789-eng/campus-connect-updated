import http from 'node:http';
import { createApp } from './app.js';
import { env, isProd, isVercel } from './config/env.js';
import { shutdownHandler } from './middleware/error.js';
import { disconnectDB } from './config/db.js';
import { storageProvider } from './infrastructure/storage/storage.service.js';
import { closeSockets, initSockets } from './sockets/index.js';

let app;
try {
  app = await createApp();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(`❌ Could not connect to database at ${env.MONGO_URI}:`, err.message);
  process.exit(1);
}

// In standard server mode (local dev, Render, Docker), spin up the HTTP listener.
// On Vercel, the exported Express app is invoked serverlessly per request.
if (!isVercel) {
  const server = http.createServer(app);

  // Socket.IO is wired up in Phase 4; the flag keeps Phase 1–2 boots clean
  // while the realtime layer lands on the same HTTP server.
  if (env.ENABLE_SOCKETS) initSockets(server);

  server.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        '  CampusConnect API',
        `  ├─ mode        ${env.NODE_ENV}`,
        `  ├─ api         http://localhost:${env.PORT}/api`,
        `  ├─ client      ${env.CLIENT_URL}`,
        `  ├─ storage     ${storageProvider}`,
        `  └─ sockets     ${env.ENABLE_SOCKETS ? 'on' : 'off (Phase 4)'}`,
        '',
      ].join('\n'),
    );
  });

  // Reverse-of-startup teardown: stop accepting requests, then close the
  // realtime layer, then drain MongoDB. Both collaborators are no-ops when the
  // feature is off, so the sequence is identical either way.
  const shutdown = shutdownHandler(server, {
    closeSockets,
    closeDatabase: disconnectDB,
  });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('❌ Unhandled rejection:', reason);
  });

  if (isProd) {
    process.on('uncaughtException', (err) => {
      // eslint-disable-next-line no-console
      console.error('❌ Uncaught exception, exiting:', err);
      process.exit(1);
    });
  }
}

export default app;
