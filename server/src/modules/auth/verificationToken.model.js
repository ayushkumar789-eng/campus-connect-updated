import mongoose from 'mongoose';
import crypto from 'node:crypto';

const { Schema } = mongoose;

/**
 * One-shot, hashed, expiring tokens for email verification and password reset.
 *
 * Design notes:
 *
 *  • Only the SHA-256 hash is stored. A dump of this collection therefore
 *    cannot be used to verify an account or reset a password — the attacker
 *    would need the raw token, which only ever exists in the emailed link and
 *    in the request that consumes it.
 *  • `consumedAt` makes every token single-use. Verifying twice fails the second
 *    time even if the raw token is replayed inside its window.
 *  • Tokens are per-purpose (`purpose`), so a password-reset link can never be
 *    pasted into the email-verification endpoint.
 *  • Issuing a new token retires any outstanding one of the same purpose, so
 *    "request another link" genuinely invalidates the previous link rather than
 *    leaving two working ones in the user's inbox.
 */
const tokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: ['verify_email', 'reset_password'], required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Mongo's TTL monitor removes expired rows; a successful verification deletes
// the row immediately, so this is only a safety net for abandoned attempts.
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
tokenSchema.index({ tokenHash: 1, purpose: 1, consumedAt: 1 });
tokenSchema.index({ user: 1, purpose: 1, consumedAt: 1 });

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * Creates a token row and returns the *raw* token, which is the only moment the
 * cleartext value exists outside the database.
 * @param {import('mongoose').Document} user
 * @param {'verify_email'|'reset_password'} purpose
 * @param {number} ttlMinutes
 * @returns {Promise<{ raw: string, expiresAt: Date }>}
 */
tokenSchema.statics.issueToken = async function issueToken(user, purpose, ttlMinutes) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const now = new Date();

  // Retire any outstanding token of the same purpose for this user.
  await this.updateMany({ user: user._id, purpose, consumedAt: null }, { $set: { consumedAt: now } });

  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  await this.create({ user: user._id, purpose, tokenHash: hashToken(raw), expiresAt });

  return { raw, expiresAt };
};

/**
 * Consumes a raw token: verifies the hash, checks it is unexpired and unused,
 * marks it consumed and returns the owning user.
 *
 * Returns `null` for every failure mode on purpose — the caller cannot
 * distinguish "expired" from "already used" from "never existed", so the
 * endpoint is not an oracle for guessing token values.
 *
 * @param {string} raw
 * @param {'verify_email'|'reset_password'} purpose
 * @returns {Promise<import('mongoose').Document|null>}
 */
tokenSchema.statics.consume = async function consume(raw, purpose) {
  if (!raw || typeof raw !== 'string') return null;

  const row = await this.findOne({
    purpose,
    tokenHash: hashToken(raw),
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!row) return null;

  // Claim the row first. A concurrent request finds nothing and fails, which is
  // exactly the single-use guarantee we want.
  const claimed = await this.findOneAndUpdate(
    { _id: row._id, consumedAt: null },
    { $set: { consumedAt: new Date() } },
    { new: true },
  );
  if (!claimed) return null;

  const User = mongoose.model('User');
  return User.findById(claimed.user);
};

/** Housekeeping: drop consumed rows older than `days`. */
tokenSchema.statics.prune = async function prune(days = 7) {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const { deletedCount } = await this.deleteMany({ consumedAt: { $lt: cutoff } });
  return deletedCount ?? 0;
};

export const VerificationToken = mongoose.model('VerificationToken', tokenSchema);
