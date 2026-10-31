import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { protect } from '../../middleware/auth.js';
import { authLimiter, emailLimiter, registerLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { handleSingleUpload, uploadAvatar } from '../../middleware/upload.js';
import {
  register,
  login,
  logout,
  logoutEverywhere,
  refresh,
  me,
  updateProfileSetup,
  updatePassword,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  deactivate,
  deleteAccount,
} from './auth.controller.js';
import {
  updateNotificationPrefs,
  updateOnboardingStep,
  updateAccountDetails,
} from '../users/account.controller.js';
import {
  registerSchema,
  loginSchema,
  profileSetupSchema,
  changePasswordSchema,
  verifyEmailSchema,
  emailOnlySchema,
  resetPasswordSchema,
  accountClosureSchema,
  accountDetailsSchema,
  notificationPrefsSchema,
  onboardingStepSchema,
} from '../../validators/auth.validator.js';

const router = Router();

// ── Session ─────────────────────────────────────────────────────────────
router.post('/register', registerLimiter, validate({ body: registerSchema }), register);
router.post('/login', authLimiter, validate({ body: loginSchema }), login);
router.post('/logout', logout);
// Unauthenticated by design: it clears a cookie and nothing else. A stale or
// forged cookie must still be able to sign the browser out.
router.post('/refresh', asyncHandler(refresh));

router.get('/me', protect, me);
router.post('/logout-all', protect, logoutEverywhere);

// ── Email verification ──────────────────────────────────────────────────
// The token is validated by shape and by a database lookup; the value is a
// 43-character base64url string, hence the min(20) in the schema.
router.post('/verify-email', validate({ body: verifyEmailSchema }), verifyEmail);
router.post('/resend-verification', emailLimiter, validate({ body: emailOnlySchema }), resendVerification);

// ── Password reset ──────────────────────────────────────────────────────
router.post('/forgot-password', emailLimiter, validate({ body: emailOnlySchema }), forgotPassword);
router.post('/reset-password', emailLimiter, validate({ body: resetPasswordSchema }), resetPassword);

// ── Profile ─────────────────────────────────────────────────────────────
router.put(
  '/profile',
  protect,
  handleSingleUpload(uploadAvatar, 'avatar'),
  validate({ body: profileSetupSchema }),
  updateProfileSetup,
);
router.post('/change-password', protect, validate({ body: changePasswordSchema }), updatePassword);

router.patch('/account-details', protect, validate({ body: accountDetailsSchema }), updateAccountDetails);
router.patch('/notification-prefs', protect, validate({ body: notificationPrefsSchema }), updateNotificationPrefs);
router.patch('/onboarding', protect, validate({ body: onboardingStepSchema }), updateOnboardingStep);

// ── Account closure ─────────────────────────────────────────────────────
router.post('/deactivate', protect, validate({ body: accountClosureSchema }), deactivate);
router.delete('/account', protect, validate({ body: accountClosureSchema }), deleteAccount);

export default router;
