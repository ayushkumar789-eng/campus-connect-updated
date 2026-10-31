/**
 * Email verification and password reset.
 *
 * Both flows share the same machinery — a hashed, single-use, expiring token
 * row in `VerificationToken` plus a templated email — so the two cannot drift
 * apart in how they handle expiry, replay or enumeration.
 */
import { User } from '../users/User.model.js';
import { VerificationToken } from './verificationToken.model.js';
import { env, isDev } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { trySendEmail, verificationEmail, passwordResetEmail } from '../../infrastructure/mail/email.service.js';

const VERIFY_TTL_MINUTES = 60 * 24; // a day is friendlier than an hour
const RESET_TTL_MINUTES = 30;

/**
 * Minimum gap between two emails to the same account.
 *
 * This is the limit that actually protects the mail provider's quota, and it
 * has to live here rather than only in `emailLimiter`:
 *
 *  • the per-IP bucket is a blunt instrument. An entire campus shares one NAT
 *    egress address, so a per-IP mail budget small enough to stop abuse is also
 *    small enough to lock out a real university;
 *  • a per-account cooldown is unaffected by where the request came from, so a
 *    script cycling through addresses still gets one email per account.
 *
 * The two together: the IP bucket sheds volumetric floods, this sheds the
 * "one victim, a thousand requests" pattern.
 */
const RESEND_COOLDOWN_MS = 60_000;

/** Builds the link a user clicks. Points at the SPA, not the API. */
function clientLink(path, token) {
  const base = env.CLIENT_URL.split(',')[0].trim();
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

/**
 * True when this account was mailed something very recently.
 *
 * Reads the newest token row rather than an in-memory map, so the cooldown
 * survives a restart and applies across every server instance — which an
 * in-process cache would not.
 *
 * @param {import('mongoose').Types.ObjectId} userId
 * @param {'verify_email'|'reset_password'} purpose
 */
async function mailedRecently(userId, purpose) {
  const recent = await VerificationToken.findOne({ user: userId, purpose })
    .sort({ createdAt: -1 })
    .select('createdAt')
    .lean();
  if (!recent?.createdAt) return false;
  return Date.now() - new Date(recent.createdAt).getTime() < RESEND_COOLDOWN_MS;
}

/**
 * Issues a verification token and emails the link.
 *
 * The raw token is returned to the caller only in development, where the
 * console mailer prints it anyway. In production it never leaves the server,
 * which is what stops someone with access to an email address from verifying
 * an account they do not own.
 *
 * @param {import('mongoose').Document} user
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ sent: boolean, devToken?: string }>}
 */
export async function sendVerificationEmail(user, opts = {}) {
  // A verified account re-requesting a link is a no-op, not an error, so a
  // mis-click cannot put a live account back into an unverified state.
  if (user.emailVerified && !opts.force) return { sent: false };

  if (!opts.force && (await mailedRecently(user._id, 'verify_email'))) {
    return { sent: false, throttled: true };
  }

  const { raw } = await VerificationToken.issueToken(user, 'verify_email', VERIFY_TTL_MINUTES);
  const link = clientLink('/verify-email', raw);

  const mail = verificationEmail({
    name: user.name,
    link,
    minutes: Math.round(VERIFY_TTL_MINUTES / 60),
  });

  const sent = await trySendEmail({ to: user.email, ...mail });

  // eslint-disable-next-line no-console
  if (isDev) console.log(`   verify: ${user.email} → ${sent ? 'queued' : 'not delivered'}`);

  return {
    sent,
    // The development escape hatch, so the flow is testable with no mail
    // provider. `config/env.js` refuses to boot production with it enabled.
    ...(env.EMAIL_VERIFICATION_DEV_BYPASS ? { devToken: raw } : {}),
  };
}

/**
 * Consumes a verification token and marks the account verified.
 * @param {string} token
 * @returns {Promise<import('mongoose').Document>}
 */
export async function verifyEmailToken(token) {
  const user = await VerificationToken.consume(token, 'verify_email');
  if (!user) {
    throw ApiError.badRequest(
      'This verification link is invalid or has expired. Request a new one from the sign-in page.',
      [{ field: 'token', message: 'Invalid or expired link' }],
    );
  }

  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  await user.save({ validateBeforeSave: false });

  return user;
}

/**
 * Starts a password reset.
 *
 * Always resolves the same way whether or not the address is registered: a
 * caller must not be able to use this endpoint to find out which emails have
 * accounts.
 *
 * @param {string} email
 * @returns {Promise<{ devToken?: string }>}
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user || !user.isActive) return {};

  // Throttled silently, and identically to a miss — the caller must not learn
  // whether the address exists, or how recently it was mailed.
  if (await mailedRecently(user._id, 'reset_password')) return {};

  const { raw } = await VerificationToken.issueToken(user, 'reset_password', RESET_TTL_MINUTES);

  await trySendEmail({
    to: user.email,
    ...passwordResetEmail({ name: user.name, resetLink: clientLink('/reset-password', raw), minutes: RESET_TTL_MINUTES }),
  });

  return env.EMAIL_VERIFICATION_DEV_BYPASS ? { devToken: raw } : {};
}
/**
 * Completes a password reset. Consumes the token, sets the new password and
 * revokes every existing session — a password reset that leaves old refresh
 * tokens alive is not a reset.
 *
 * @param {string} token
 * @param {string} newPassword
 * @returns {Promise<import('mongoose').Document>}
 */
export async function resetPasswordWithToken(token, newPassword) {
  const user = await VerificationToken.consume(token, 'reset_password');
  if (!user) {
    throw ApiError.badRequest('This reset link is invalid or has expired.', [
      { field: 'token', message: 'Invalid or expired link' },
    ]);
  }

  user.password = newPassword;
  user.tokenVersion += 1; // kill every session issued under the old password
  await user.save();

  return user;
}

export const VERIFICATION_TTL_MINUTES = VERIFY_TTL_MINUTES;
