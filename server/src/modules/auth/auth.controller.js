import { asyncHandler } from '../../utils/asyncHandler.js';
import { User } from '../users/User.model.js';
import { REFRESH_COOKIE_NAME, verifyRefreshToken } from './token.service.js';
import {
  registerUser,
  loginUser,
  refreshSession,
  attachSession,
  endSession,
  updateProfile,
  changePassword,
  revokeAllSessions,
} from './auth.service.js';
import {
  sendVerificationEmail,
  verifyEmailToken,
  requestPasswordReset,
  resetPasswordWithToken,
} from './verification.service.js';
import { deactivateAccount, deleteAccountPermanently } from '../users/account.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';

/** POST /api/auth/register */
export const register = asyncHandler(async (req, res) => {
  const { user, tokens, verification } = await registerUser(req.body);
  const { accessToken } = attachSession(res, tokens);

  res.status(201).json({
    success: true,
    message: 'Welcome to CampusConnect',
    data: {
      user,
      accessToken,
      // The development escape hatch, so the flow is exercisable with no mail
      // provider. Undefined in production — `config/env.js` refuses to boot
      // with `EMAIL_VERIFICATION_DEV_BYPASS` enabled there.
      ...(env.EMAIL_VERIFICATION_DEV_BYPASS ? { devVerificationToken: verification?.devToken } : {}),
    },
  });
});

/** POST /api/auth/login */
export const login = asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  const { user, tokens } = await loginUser(identifier, password);
  const { accessToken } = attachSession(res, tokens);

  res.json({ success: true, message: `Welcome back, ${user.name.split(' ')[0]}`, data: { user, accessToken } });
});

/** POST /api/auth/logout */
export const logout = asyncHandler(async (_req, res) => {
  endSession(res);
  res.json({ success: true, message: 'Signed out', data: null });
});

/**
 * POST /api/auth/refresh
 * Reads the httpOnly refresh cookie and rotates the access token. This is what
 * lets the client survive an access-token expiry without a login prompt.
 */
export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) throw ApiError.unauthorized('No refresh token');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    endSession(res);
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  // `payload.ver` is the revocation counter from when the cookie was issued. A
  // mismatch means the session was revoked (password change, account closure),
  // so the cookie is cleared and the client falls back to a full sign-in.
  const tokens = await refreshSession(payload.sub, payload.ver);
  const { accessToken } = attachSession(res, tokens);
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  res.json({ success: true, data: { user: user.toPrivateJSON(), accessToken } });
});

/** GET /api/auth/me */
export const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user.toPrivateJSON() } });
});

/** PUT /api/auth/profile — the onboarding wizard and avatar upload. */
export const updateProfileSetup = asyncHandler(async (req, res) => {
  const user = await updateProfile(req.user, req.body, req.file);
  res.json({ success: true, message: 'Profile updated', data: { user } });
});

/** POST /api/auth/change-password */
export const updatePassword = asyncHandler(async (req, res) => {
  await changePassword(req.user, req.body.currentPassword, req.body.newPassword);
  // The version bump in `changePassword` invalidates the current refresh
  // cookie too, so the client is handed a fresh pair rather than being bounced
  // to the login screen by its very next request.
  const tokens = await refreshSession(req.user._id);
  const { accessToken } = attachSession(res, tokens);

  res.json({
    success: true,
    message: 'Password changed. Other devices have been signed out.',
    data: { accessToken },
  });
});

/** POST /api/auth/logout-all — revokes every session, including this one. */
export const logoutEverywhere = asyncHandler(async (req, res) => {
  await revokeAllSessions(req.user);
  endSession(res);
  res.json({ success: true, message: 'Signed out on all devices', data: null });
});

// ── Email verification ───────────────────────────────────────────────────

/** POST /api/auth/verify-email */
export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await verifyEmailToken(req.body.token);
  res.json({ success: true, message: 'Email address confirmed', data: { user: user.toPrivateJSON() } });
});

/**
 * POST /api/auth/resend-verification
 *
 * Always resolves 200 with the same body, whether or not the address exists,
 * is already verified, or was mailed a link a moment ago — otherwise this is a
 * free account-enumeration oracle that also reports verification state.
 */
export const resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: String(req.body.email).trim().toLowerCase() });

  let devVerificationToken;
  if (user && !user.emailVerified) {
    const result = await sendVerificationEmail(user);
    devVerificationToken = result.devToken;
  }

  res.json({
    success: true,
    message: 'If that address needs verifying, a new link is on its way.',
    data: env.EMAIL_VERIFICATION_DEV_BYPASS ? { devVerificationToken } : null,
  });
});

/**
 * POST /api/auth/forgot-password
 * Always 200 — see the note on `resendVerification`.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await requestPasswordReset(req.body.email);
  res.json({
    success: true,
    message: 'If that address has an account, a reset link is on its way.',
    data: env.EMAIL_VERIFICATION_DEV_BYPASS ? { devResetToken: result.devToken } : null,
  });
});

/** POST /api/auth/reset-password */
export const resetPassword = asyncHandler(async (req, res) => {
  await resetPasswordWithToken(req.body.token, req.body.password);
  res.json({ success: true, message: 'Password updated. Please sign in.', data: null });
});

// ── Account closure ─────────────────────────────────────────────────────

/** POST /api/auth/deactivate — soft close, reversible in principle, hidden now. */
export const deactivate = asyncHandler(async (req, res) => {
  // Re-authenticate first: a hijacked access token should not be enough to
  // close somebody's account.
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body.password))) {
    throw ApiError.badRequest('Password is incorrect', [{ field: 'password', message: 'Password is incorrect' }]);
  }

  const result = await deactivateAccount(user, { reason: req.body.reason });
  endSession(res);

  res.json({ success: true, message: 'Account deactivated', data: result });
});

/** DELETE /api/auth/account — permanent, after anonymising the content. */
export const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(req.body?.password ?? ''))) {
    throw ApiError.badRequest('Password is incorrect', [{ field: 'password', message: 'Password is incorrect' }]);
  }

  await deleteAccountPermanently(user);
  endSession(res);

  res.json({ success: true, message: 'Account deleted', data: null });
});
