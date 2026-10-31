import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { env, isProd, isTest, SERVER_ROOT, allowedOrigins, hasCloudinary } from './config/env.js';
import { connectDB, syncIndexes } from './config/db.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { resolveUploadPath } from './infrastructure/storage/storage.service.js';
import { contentDisposition } from './utils/fileType.js';
import { MIME_BY_PUBLIC_EXT } from './config/mime.js';
import { ApiError } from './utils/ApiError.js';

/**
 * Content Security Policy, written out explicitly rather than inherited from
 * helmet's defaults.
 *
 * The defaults (`contentSecurityPolicy: undefined`) are stricter than this
 * application can actually run under, and that only shows up in production:
 *
 *  • `img-src 'self' data:` blocks every Cloudinary-hosted avatar and group
 *    cover. With Cloudinary configured, `storage.service.js` stores
 *    `result.secure_url` — an absolute `https://res.cloudinary.com/…` — and
 *    `Avatar.jsx` renders it directly as an `<img src>`. Cloudinary is the
 *    recommended production storage precisely because it is the option that
 *    satisfies the production boot gate without `ALLOW_LOCAL_STORAGE`, so the
 *    configuration that is *most* correct for production is the one that
 *    silently breaks every profile picture in it.
 *
 *  • `connect-src` falls back to `default-src 'self'`, which blocks the API and
 *    the Socket.IO transport whenever the SPA and the API are on different
 *    origins. The env schema supports that topology explicitly (CLIENT_URL,
 *    EXTRA_CLIENT_URLS and the CORS allow-list all exist for it), so it has to
 *    be allowed here too. The single-origin deploy still works, because the
 *    client falls back to the relative `/api`.
 *
 * Both additions are scoped to what the code demonstrably needs: configured
 * origins for connections, and `https:` for images rather than a blanket
 * `img-src *`.
 */
function buildCsp() {
  // Every origin the client is configured to talk to, plus its websocket
  // equivalents. CSP matches `https` against `wss`, but spelling them out keeps
  // the intent readable and survives a plain-HTTP staging host.
  const connectOrigins = new Set(["'self'"]);
  for (const origin of [...allowedOrigins, env.SERVER_URL]) {
    if (!origin) continue;
    connectOrigins.add(origin);
    if (origin.startsWith('https://')) connectOrigins.add(origin.replace(/^https:/, 'wss:'));
    if (origin.startsWith('http://')) connectOrigins.add(origin.replace(/^http:/, 'ws:'));
  }

  // Written out in full with `useDefaults: false` rather than merged onto
  // helmet's defaults. Merging is fragile here: this helmet version's
  // `getDefaultDirectives()` returns hyphenated keys, so a camelCase override
  // such as `imgSrc` does not replace `img-src` — it is emitted alongside it and
  // helmet refuses the duplicate at boot. An explicit policy cannot drift with a
  // dependency bump either, which for a security header is the property worth
  // having.
  return {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'base-uri': ["'self'"],
      'font-src': ["'self'", 'https:', 'data:'],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"],
      // https: rather than `*` — remote images are allowed, remote *scripts* are
      // not, which is the part that actually matters.
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': [...connectOrigins],
      'object-src': ["'none'"],
      'script-src': ["'self'"],
      'script-src-attr': ["'none'"],
      'style-src': ["'self'", 'https:', "'unsafe-inline'"],
      'upgrade-insecure-requests': [],
    },
  };
}

export async function createApp() {
  const app = express();

  // Required for correct req.ip (and therefore rate limiting) behind a proxy
  // or load balancer. Trust only the first hop.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Images and uploads are served from this origin to the SPA on another
      // port, so the default same-origin policy would block them.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: isProd ? buildCsp() : false,
      // Stop the browser from second-guessing a declared Content-Type.
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  app.use(
    cors({
      // An explicit list, not a wildcard reflection: `credentials: true` and
      // `origin: true` together would let any site on the internet make
      // authenticated cross-origin calls.
      origin(origin, callback) {
        // Same-origin and non-browser clients (curl, health checks) send no
        // Origin header at all.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(ApiError.forbidden('Origin not allowed'));
      },
      credentials: true, // required for the refresh cookie
      maxAge: 86_400,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(morgan(isProd ? 'combined' : 'dev'));
  }

  // Locally uploaded files. Cloudinary mode makes this a no-op.
  //
  // Served by hand rather than `express.static` because two things matter here
  // that static does not do for us:
  //   • the path is resolved and containment-checked, so a traversal attempt
  //     cannot read outside the uploads directory;
  //   • `Content-Type` comes from a fixed extension table and documents are
  //     forced to `attachment`, so an uploaded HTML or SVG can never render on
  //     our origin.
  if (!hasCloudinary) {
    // Express 4 wildcard syntax; `req.params[0]` is the path after `/uploads/`.
    app.get('/uploads/*', async (req, res, next) => {
      const absPath = resolveUploadPath(req.params[0]);
      if (!absPath) return next(ApiError.notFound('File not found'));

      const ext = absPath.split('.').pop()?.toLowerCase() ?? '';
      const mime = MIME_BY_PUBLIC_EXT[ext] ?? 'application/octet-stream';

      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', contentDisposition(mime));
      res.setHeader('Cache-Control', isProd ? 'public, max-age=604800, immutable' : 'no-store');
      // An image served cross-origin to the SPA needs this to be readable by
      // a <canvas> draw and by CSS.
      res.setHeader('Access-Control-Allow-Origin', '*');

      return res.sendFile(absPath, (err) => {
        if (err) next(err);
      });
    });
  }

  app.use('/api', apiLimiter, routes);

  // In production the API can also serve the built SPA if it is present, which
  // is what makes a single-origin deploy (one Render service, one Fly app) work
  // without CORS at all.
  const clientDist = path.resolve(SERVER_ROOT, '..', 'client', 'dist');
  if (isProd) {
    app.use(express.static(clientDist, { maxAge: '1y', index: false }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  await connectDB();
  await syncIndexes();

  return app;
}

export default createApp;
