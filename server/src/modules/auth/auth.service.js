import { User } from '../users/User.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { uploadFile, deleteFile } from '../../infrastructure/storage/storage.service.js';
import { signAccessToken, signRefreshToken, setRefreshCookie, clearRefreshCookie } from './token.service.js';
import { Notification, NOTIFICATION_TYPES } from '../notifications/Notification.model.js';
import { sendVerificationEmail } from './verification.service.js';

/**
 * Creates a real, self-service account.
 *
 * The role is fixed to `student` here and nowhere else — a `role` in the
 * request body cannot reach this function, because the validators strip
 * unknown keys, and it is overwritten regardless. Admin promotion goes through
 * the admin API and is separately authorised.
 *
 * @param {{ name: string, username: string, email: string, password: string, college?: string, course?: string, branch?: string, year?: number|null, avatar?: Express.Multer.File }} input
 */
export async function registerUser(input) {
  const { avatar, ...fields } = input;

  const existing = await User.findOne({
    $or: [{ email: fields.email }, { username: fields.username }],
  }).lean();

  if (existing) {
    const duplicateField = existing.email === fields.email ? 'email' : 'username';
    throw ApiError.conflict(
      duplicateField === 'email' ? 'An account with this email already exists' : 'This username is taken',
      [
        {
          field: duplicateField,
          message: duplicateField === 'email' ? 'An account with this email already exists' : 'This username is taken',
        },
      ],
    );
  }

  if (avatar) {
    const uploaded = await uploadFile(avatar, { folder: 'avatars', kind: 'image' });
    fields.avatar = { url: uploaded.url, publicId: uploaded.publicId };
  }

  const user = await User.create({ ...fields, role: 'student' });

  // Verification is best-effort and must never be able to lose a successfully
  // created account: the user is already in the database, and answering 500
  // would tell them to try again with an email that is now taken. A failure
  // here is logged and the user can request a new link from the sign-in page.
  let verification = { sent: false };
  try {
    verification = await sendVerificationEmail(user);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('✖ could not issue the verification email:', err.message);
  }

  return {
    user: user.toPrivateJSON(),
    tokens: issueTokens(user),
    verification,
  };
}

/**
 * Verifies credentials and issues tokens.
 * @param {string} identifier email or username
 * @param {string} password
 */
export async function loginUser(identifier, password) {
  const normalised = identifier.trim().toLowerCase();
  const user = await User.findOne({
    $or: [{ email: normalised }, { username: normalised }],
  }).select('+password');

  // One generic message for both "no such user" and "wrong password" so the
  // endpoint cannot be used to enumerate accounts.
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized('Incorrect email/username or password');
  }

  if (user.deletionRequestedAt) {
    throw ApiError.forbidden('This account is scheduled for deletion and can no longer be used');
  }
  if (user.deactivatedAt) {
    throw ApiError.forbidden('This account has been deactivated');
  }
  if (user.suspended) {
    throw ApiError.forbidden('This account has been suspended. Contact campus administration.');
  }

  user.lastSeenAt = new Date();
  await user.save({ validateBeforeSave: false });

  return { user: user.toPrivateJSON(), tokens: issueTokens(user) };
}

/**
 * Rotates the refresh token and returns a fresh pair.
 *
 * `payloadVer` is the `ver` claim carried by the presented refresh token. The
 * user's current `tokenVersion` must still match, otherwise the token predates
 * a password change, a "log out everywhere", or a revocation and is refused.
 * This is what makes the otherwise-stateless refresh cookie revocable.
 *
 * @param {string} userId
 * @param {number} [payloadVer]
 */
export async function refreshSession(userId, payloadVer) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized('Account no longer exists');

  if (user.deletionRequestedAt || user.deactivatedAt) {
    throw ApiError.forbidden('This account is no longer active');
  }
  if (user.suspended) throw ApiError.forbidden('This account has been suspended');

  if (payloadVer !== undefined && Number(payloadVer) !== Number(user.tokenVersion)) {
    throw ApiError.unauthorized('Your session has been revoked. Please sign in again.');
  }

  return issueTokens(user);
}

export function issueTokens(user) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
}

export function attachSession(res, tokens) {
  setRefreshCookie(res, tokens.refreshToken);
  return { accessToken: tokens.accessToken };
}

export function endSession(res) {
  clearRefreshCookie(res);
}

/**
 * The only fields a user may ever set on their own profile.
 *
 * This is the second of two independent guards against privilege escalation.
 * The first is the `.strict()` validator on each route, which rejects unknown
 * keys outright. This one exists because a single forgotten `validate()` on a
 * future route would otherwise turn `Object.assign` into a way to set `role`,
 * `tokenVersion` or `emailVerified` — which is exactly the bug this allowlist
 * was written to make impossible rather than merely absent.
 *
 * Everything not listed here — `role`, `suspended`, `tokenVersion`,
 * `followersCount`, `emailVerified`, `password`, … — is server-controlled.
 */
const PROFILE_EDITABLE = new Set([
  'name',
  'bio',
  'college',
  'course',
  'branch',
  'year',
  'semester',
  'skills',
  'interests',
  'username',
  'email',
]);

/**
 * Applies a profile edit. Avatar replacement deletes the previous file.
 *
 * Serves both `PUT /auth/profile` (the onboarding wizard) and `PUT /users/:id`
 * (the Settings form), so it is deliberately the one place that decides what a
 * profile edit may touch. Both entry points apply the same allowlist; splitting
 * them could only produce a field one door accepts and the other rejects.
 *
 * @param {import('mongoose').Document} user
 * @param {Record<string, any>} changes
 * @param {Express.Multer.File} [avatarFile]
 */
export async function updateProfile(user, changes, avatarFile) {
  const applied = {};
  for (const [key, value] of Object.entries(changes)) {
    if (PROFILE_EDITABLE.has(key)) applied[key] = value;
  }

  const { skills, interests, ...rest } = applied;

  if (skills) user.skills = dedupe(skills);
  if (interests) user.interests = dedupe(interests);
  Object.assign(user, rest);

  if (avatarFile) {
    const previousPublicId = user.avatar?.publicId;
    const uploaded = await uploadFile(avatarFile, { folder: 'avatars', kind: 'image' });
    user.avatar = { url: uploaded.url, publicId: uploaded.publicId };
    if (previousPublicId) await deleteFile(previousPublicId, 'local-or-cloudinary');
  }

  // `profileCompleted` is a one-way latch, and deliberately not derived from the
  // current field values.
  //
  // It records that this student has been through the eight-step wizard. It
  // used to be recomputed on every save, so clearing a bio or a college — an
  // ordinary edit the Settings form invites, and which the schema deliberately
  // permits — flipped it to false and the route guard bounced the student
  // straight back into onboarding. They had finished it, and an edit undid it.
  //
  // Computing it only while it is still false keeps the wizard's own "am I done
  // yet" check working during setup, while making it impossible for any later
  // edit to reopen a flow that was already closed.
  if (!user.profileCompleted) {
    user.profileCompleted = Boolean(user.bio && user.college && user.course);
  }

  await user.save();
  return user.toPrivateJSON();
}

export async function changePassword(user, currentPassword, newPassword) {
  const withPassword = await User.findById(user._id).select('+password');
  if (!(await withPassword.comparePassword(currentPassword))) {
    throw ApiError.badRequest('Current password is incorrect', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
  withPassword.password = newPassword;
  // A password change must log the other devices out — otherwise a stolen
  // refresh cookie survives exactly the event meant to end it.
  withPassword.revokeSessions();
  await withPassword.save();
}

/**
 * Invalidates every outstanding refresh token, optionally ending the current
 * session too. "Log out everywhere" and password-reset rely on this.
 * @param {import('mongoose').Document} user
 */
export async function revokeAllSessions(user) {
  user.revokeSessions();
  await user.save({ validateBeforeSave: false });
}

/**
 * Changes the account identity fields: name, username, email.
 *
 * Kept separate from `updateProfile` because these carry rules the profile
 * fields do not:
 *
 *  • **Uniqueness.** A username or email can only be claimed if it is free.
 *  • **Changing the email un-verifies the account.** The new address has not
 *    been proven to belong to this person, so `emailVerified` drops and a fresh
 *    verification mail goes out. Anything gated on verification stays gated.
 *  • **The old username is remembered.** Otherwise somebody could cycle between
 *    two handles to shed a profile's history; the trail makes that visible.
 *
 * @param {import('mongoose').Document} user
 * @param {{ name?: string, username?: string, email?: string }} changes
 */
export async function updateAccountDetails(user, changes) {
  const nextEmail = changes.email?.trim().toLowerCase();
  const nextUsername = changes.username?.trim().toLowerCase();
  const emailChanged = Boolean(nextEmail && nextEmail !== user.email);
  const usernameChanged = Boolean(nextUsername && nextUsername !== user.username);

  if (emailChanged || usernameChanged) {
    const clash = await User.findOne({
      _id: { $ne: user._id },
      $or: [
        ...(emailChanged ? [{ email: nextEmail }] : []),
        ...(usernameChanged ? [{ username: nextUsername }] : []),
      ],
    }).select('email username');

    if (clash) {
      const field = emailChanged ? 'email' : 'username';
      throw ApiError.conflict(
        field === 'email' ? 'An account with this email already exists' : 'This username is taken',
        [{ field, message: field === 'email' ? 'That email is already in use' : 'That username is taken' }],
      );
    }
  }

  if (changes.name) user.name = changes.name.trim();
  if (usernameChanged) {
    user.recentUsernames = [...(user.recentUsernames ?? []), user.username].slice(-5);
    user.username = nextUsername;
  }
  if (emailChanged) {
    user.email = nextEmail;
    // A new address has not been proven. Until it is, the account drops back to
    // unverified and anything gated on that re-gates.
    user.emailVerified = false;
    user.emailVerifiedAt = null;
  }

  await user.save();

  if (emailChanged) {
    // Best effort: a mail failure must not roll back a successful change. The
    // user can request a new link from Settings.
    try {
      await sendVerificationEmail(user);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('✖ could not issue the verification email:', err.message);
    }
  }

  return { user: user.toPrivateJSON(), emailChanged, usernameChanged };
}

/** Maps a notification type onto the user's preference switch for it. */
const PREF_FOR_TYPE = {
  follow: 'follows',
  like: 'likes',
  comment: 'comments',
  reply: 'replies',
  share: 'shares',
};

/**
 * Fires a notification without ever letting a failure break the main action.
 *
 * Two guards, both required by the product rules:
 *  • never notify someone about their own action;
 *  • never notify someone who turned that category off.
 */
export async function notify({ recipient, actor, type, entity, text }) {
  if (!recipient || String(recipient) === String(actor)) return;
  if (!NOTIFICATION_TYPES.includes(type)) return;

  try {
    const prefKey = PREF_FOR_TYPE[type];
    if (prefKey) {
      const pref = await User.findById(recipient).select('notificationPrefs').lean();
      if (pref?.notificationPrefs?.[prefKey] === false) return;
    }


    await Notification.create({ recipient, actor, type, entity, text });
  } catch (err) {
    // Duplicate keys mean the notification already exists — that's fine.
    if (err?.code !== 11000) {
      // eslint-disable-next-line no-console
      console.warn('⚠ notification failed:', err.message);
    }
  }
}

function dedupe(list = []) {
  const seen = new Set();
  return list
    .map((v) => v.trim())
    .filter((v) => {
      const key = v.toLowerCase();
      if (!v || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
