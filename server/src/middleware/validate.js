import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';

/**
 * Validates and *replaces* req.body / req.query with the parsed output, so
 * controllers receive coerced, stripped, trusted data.
 *
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 */
export const validate = (schemas) => (req, _res, next) => {
  try {
    if (schemas.params) req.params = schemas.params.parse(req.params);
    if (schemas.query) {
      // req.query is a getter in Express 5 / newer 4.x — assign defensively.
      const parsedQuery = schemas.query.parse(req.query);
      Object.assign(req.query, parsedQuery);
    }
    if (schemas.body) req.body = schemas.body.parse(req.body);
    next();
  } catch (err) {
    next(toValidationError(err));
  }
};

/** Converts a ZodError into a 400 with per-field messages. */
export function toValidationError(err) {
  if (!(err instanceof ZodError)) return err;

  const errors = err.issues.map((issue) => ({
    field: issue.path.join('.') || '_',
    message: issue.message,
  }));

  return ApiError.badRequest('Please fix the highlighted fields', errors);
}
