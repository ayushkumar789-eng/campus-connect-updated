import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const ISSUER = 'campusconnect';

const REFRESH_COOKIE = 'cc_refresh';

/**
 * Short-lived access token, sent in the Authorization header.
 *
 * `ver` carries the user's `tokenVersion` so revocation is possible even though
 * the token itself is a stateless JWT: bumping the version on the user
 * invalidates every token already in circulation.
 *
 * @param {{ _id: string, role?: string, tokenVersion?: number }} user
 * @returns {string}
 */
export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role ?? 'student',
      ver: user.tokenVersion ?? 0,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, issuer: ISSUER },
  );
}

/**
 * Long-lived refresh token, delivered only as an httpOnly cookie.
 * @param {{ _id: string, tokenVersion?: number }} user
 * @returns {string}
 */
export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), type: 'refresh', ver: user.tokenVersion ?? 0 },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN, issuer: ISSUER },
  );
}

/** @param {string} token */
export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER });
}

/** @param {string} token */
export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: ISSUER });
  // Guard against a refresh token being replayed as an access token, or vice
  // versa — they are signed with different secrets but the `type` claim is the
  // cheap, explicit check.
  if (payload.type !== 'refresh') throw new Error('Not a refresh token');
  return payload;
}

/**
 * Issues a fresh pair. Callers must persist any `tokenVersion` change *before*
 * handing the new tokens out, otherwise a revoked user keeps a working refresh.
 * @param {{ _id: string, role?: string, tokenVersion?: number }} user
 */
export function issueTokenPair(user) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
}

/** The refresh cookie never travels to JS and is scoped to the auth routes. */
function cookieOptions() {
  const secure = env.COOKIE_SECURE;
  return {
    httpOnly: true,
    secure,
    // A cross-site API (SPA on a different domain) cannot use `Strict` — the
    // browser would withhold the cookie and every refresh would fail. Same-site
    // deployments keep the stricter default.
    sameSite: secure ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/** Attaches the refresh token as an httpOnly cookie. */
export function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, cookieOptions());
}

/**
 * Clears the refresh cookie. The attributes must match those used when setting
 * it or the browser keeps the original.
 */
export function clearRefreshCookie(res) {
  // `maxAge` is dropped on purpose: passing it back would give the cleared
  // cookie a fresh 7-day life instead of expiring it immediately.
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

export const REFRESH_COOKIE_NAME = REFRESH_COOKIE;
