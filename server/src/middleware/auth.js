import { User } from '../modules/users/User.model.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../modules/auth/index.js';

function extractToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Fields every authenticated request needs. `tokenVersion` is here purely so
 * revocation can be checked; it is never serialised to the client.
 */
const AUTH_FIELDS =
  'name username email avatar role college course branch year semester bio skills interests ' +
  'followers following profileCompleted suspended suspendedReason deactivatedAt ' +
  'deletionRequestedAt emailVerified onboardingStep notificationPrefs tokenVersion';

/**
 * Requires a valid access token and attaches the user to `req.user`.
 *
 * Also enforces the account-state gates centrally, so no individual route has
 * to remember to check them: a suspended, deactivated or pending-deletion
 * account cannot act anywhere in the API.
 */
export const protect = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Missing access token');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token',
    );
  }

  const user = await User.findById(payload.sub).select(AUTH_FIELDS);

  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.deletionRequestedAt) {
    throw ApiError.forbidden('This account is scheduled for deletion and can no longer be used');
  }
  if (user.deactivatedAt) {
    throw ApiError.forbidden('This account has been deactivated');
  }
  if (user.suspended) {
    throw ApiError.forbidden('This account has been suspended. Contact campus administration.');
  }

  // A token minted before a password change or "log out everywhere" carries a
  // lower `ver` and is refused. Without this, a revoked session would stay
  // usable until the 15-minute access token expired.
  if (payload.ver !== undefined && Number(payload.ver) !== Number(user.tokenVersion)) {
    throw ApiError.unauthorized('Your session has been revoked. Please sign in again.');
  }

  req.user = user;
  next();
});

/**
 * Attaches `req.user` when a token is present, but never rejects.
 * Used by public reads so responses can personalise (isLiked, isFollowing)
 * without duplicating public and private endpoints.
 *
 * A revoked or suspended token is treated as "signed out" here rather than as
 * an error — a public page must still render for a stale cookie.
 */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub).select(
      'name username avatar role followers following suspended deactivatedAt deletionRequestedAt tokenVersion',
    );
    if (!user || user.suspended || user.deactivatedAt || user.deletionRequestedAt) return next();
    if (payload.ver !== undefined && Number(payload.ver) !== Number(user.tokenVersion)) return next();
    req.user = user;
  } catch {
    // An invalid token on a public route is simply ignored.
  }
  next();
});

/**
 * Role-based access control. Requires `protect` to run first.
 * @param  {...('student' | 'group_admin' | 'admin')} roles
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('This action is restricted to platform administrators'));
    }
    next();
  };

/** Shorthand for the platform-admin-only routes. */
export const requireAdmin = authorize('admin');

/**
 * Confirms the authenticated user owns the resource named by the parameter.
 *
 * Ownership is resolved by the route via a `loader`, so this cannot be
 * spoofed by a client-supplied id. Routes that resolve their own resource
 * (post.service, comment.service) enforce the same rule inline.
 *
 * @param {string} param route parameter holding the resource id
 * @param {(id: string) => Promise<{ author?: any, user?: any } | null>} loader
 */
export const requireOwner = (param, loader) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();

    const resource = await loader(req.params[param]);
    if (!resource) throw ApiError.notFound('Resource not found');

    const ownerId = resource.author ?? resource.user;
    if (String(ownerId?._id ?? ownerId) !== String(req.user._id)) {
      throw ApiError.forbidden('You can only change your own content');
    }

    req.resource = resource;
    next();
  });

export const isAdmin = (user) => user?.role === 'admin';
