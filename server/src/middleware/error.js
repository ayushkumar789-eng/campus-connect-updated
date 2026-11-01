import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { isProd } from '../config/env.js';

/** 404 for unmatched routes. */
export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

/**
 * Stable, machine-readable error codes.
 *
 * The client branches on these; the human-readable `message` is for display
 * and may be reworded at any time without breaking anyone.
 */
const CODE_BY_STATUS = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

function codeFor(statusCode, explicit) {
  if (explicit) return String(explicit);
  return CODE_BY_STATUS[statusCode] ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
}

/**
 * Terminal error handler. Every error leaving the API has one envelope:
 *
 *   { success: false, error: { code, message }, message, errors?, code? }
 *
 * `error.code` is the contract the frontend switches on. The top-level
 * `message` and `errors` fields are retained because the existing client and
 * 149 passing smoke assertions read them, so both shapes are correct at once.
 *
 * Nothing internal ever escapes: a 5xx always reports a generic message in
 * production and never carries a stack, while the real error is logged
 * server-side.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode ?? 500;
  let message = err.message ?? 'Internal server error';
  let errors = err.errors;
  let code = err.code;

  // Mongoose bad ObjectId — a 24-hex ObjectId cast failure, not a server fault.
  if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}`;
    code = 'INVALID_ID';
  }

  // MongoDB unavailable or buffering timeout
  if (
    err?.name === 'MongooseServerSelectionError' ||
    (err instanceof mongoose.Error && /buffering/i.test(err.message))
  ) {
    statusCode = 503;
    message = 'Database is currently unreachable. Please check your MongoDB connection and IP whitelist.';
    code = 'DATABASE_UNAVAILABLE';
  }

  // Schema-level validation.
  if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  }

  // Unique index violation. The friendly text matters here: a raw driver message
  // would leak the collection and index names.
  if (err?.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    const friendly = { email: 'An account with this email already exists', username: 'This username is taken' };
    message = friendly[field] ?? `Duplicate value for ${field}`;
    code = 'DUPLICATE_KEY';
  }

  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Please fix the highlighted fields';
    errors = err.issues.map((i) => ({ field: i.path.join('.') || '_', message: i.message }));
    code = 'VALIDATION_ERROR';
  }

  // Body-parser rejects an oversized or malformed payload before any handler
  // runs, so it never reaches the ApiError path.
  if (err?.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body is too large';
    code = 'PAYLOAD_TOO_LARGE';
  }
  if (err?.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Malformed JSON body';
    code = 'MALFORMED_REQUEST';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(`❌ ${req.method} ${req.originalUrl}`, err);
  }

  const safeMessage = statusCode >= 500 && isProd ? 'Something went wrong on our end' : message;

  const body = {
    success: false,
    error: { code: codeFor(statusCode, code), message: safeMessage },
    // Retained for backwards compatibility with the existing client.
    message: safeMessage,
  };

  if (errors) body.errors = errors;
  if (code) body.code = code;
  if (!isProd && statusCode >= 500) body.stack = err.stack?.split('\n').slice(0, 6);

  res.status(statusCode).json(body);
}

/**
 * Ordered, idempotent shutdown.
 *
 * The order matters and is the reverse of startup:
 *
 *   1. stop accepting new HTTP connections (in-flight requests finish);
 *   2. close Socket.IO, so clients reconnect to another instance instead of
 *      holding this process open;
 *   3. drain MongoDB, so no write is severed mid-document.
 *
 * Exiting before step 3 is what turns a routine deploy into data loss: Mongo
 * has to finish committing, and a killed socket leaves a write acknowledged in
 * the application but never durable.
 *
 * Collaborators are injected rather than imported so this module stays free of
 * a dependency on the socket and database layers.
 *
 * @param {import('node:http').Server} server
 * @param {{ closeSockets?: () => Promise<void>, closeDatabase?: () => Promise<void> }} [collaborators]
 */
export function shutdownHandler(server, { closeSockets, closeDatabase } = {}) {
  // SIGTERM followed by SIGINT (or a supervisor sending both) must run once.
  let shuttingDown = false;

  return async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    // eslint-disable-next-line no-console
    console.log('\n👋 Shutting down gracefully...');

    // Safety net for a connection that will not close. `unref` so it never
    // holds the event loop open on its own.
    const forceExit = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error('⚠ Shutdown timed out after 10s — forcing exit.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    try {
      // 1. Stop accepting new connections.
      await new Promise((resolve) => server.close(() => resolve()));
      // Idle keep-alive sockets would otherwise keep `close` pending until the
      // 10s timer fires, even though they can never carry another request.
      server.closeIdleConnections?.();

      // 2. Realtime transports.
      await closeSockets?.();

      // 3. Database last, once nothing else can issue a query.
      await closeDatabase?.();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('✖ Error during shutdown:', err);
      clearTimeout(forceExit);
      process.exit(1);
      return;
    }

    clearTimeout(forceExit);
    // 0, not 1: a requested shutdown that completed cleanly is a success, and
    // Docker/Kubernetes/most process supervisors read a non-zero code as a
    // failed container even when nothing went wrong.
    process.exit(0);
  };
}
