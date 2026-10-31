import { z } from 'zod';
import { COURSES } from '../modules/users/User.model.js';
import { trimmed, optionalInt, stringArray } from './common.js';

const courseEnum = z.enum(COURSES.filter(Boolean));

export const registerSchema = z
  .object({
    name: trimmed(2, 60, 'Name'),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be at least 3 characters')
      .max(24, 'Username cannot exceed 24 characters')
      .regex(/^[a-z0-9_.]+$/, 'Username can only contain letters, numbers, dots and underscores'),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password cannot exceed 72 characters')
      .regex(/[a-zA-Z]/, 'Password must contain a letter')
      .regex(/[0-9]/, 'Password must contain a number'),
    /**
     * Optional, but honoured when sent.
     *
     * Confirming the password is the user's job, not the server's — the
     * strength rules already run on `password`. But the form has the field, so
     * the API accepts it: without this, a client that forwarded it got
     * "Unrecognized key(s) in object: 'confirmPassword'" from a `.strict()`
     * schema, which is a genuinely baffling way to learn about a one-character
     * client bug. Now the mistake is either impossible or plainly reported.
     */
    confirmPassword: z.string().optional(),
    /**
     * College is collected at signup but not demanded: the form does not mark
     * it required, and the onboarding wizard treats it as skippable.
     *
     * Written as a preprocess rather than `trimmed(2).optional().default('')`
     * because that combination rejects its own default — an empty string fails
     * the 2-character minimum, so a student who left the field blank was told
     * "College must be at least 2 characters" about a field the form had
     * presented as optional. Blank now means "not set yet"; a value that is
     * present still has to be a real one.
     *
     * Registration is the one place where blank collapses to absent, because
     * there is nothing to clear — a brand-new account has no prior college. The
     * profile schema preserves the empty string instead, so a save can
     * distinguish "don't touch it" from "remove it".
     */
    college: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : v),
      trimmed(2, 120, 'College').optional(),
    ),
    course: z.preprocess((v) => (v === '' || v === undefined ? 'Other' : v), courseEnum).default('Other'),
    branch: z.string().trim().max(80).optional().default(''),
    year: optionalInt(1, 6).default(null),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Only enforced when the client actually sent it.
    if (data.confirmPassword !== undefined && data.confirmPassword !== data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
    }
  });

export const loginSchema = z
  .object({
    // Accepts either an email address or a username.
    identifier: trimmed(3, 120, 'Email or username'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

/**
 * An optional free-text field that can also be *cleared*.
 *
 * Two states that look identical on the wire and mean opposite things:
 *
 *  • **Absent** — leave it alone. A student editing only their bio must not
 *    have their college wiped, which is what a `.default()` here would do.
 *  • **Present but empty** — clear it. Without this, a student who typed the
 *    wrong college had no way to remove it: the Settings form could blank the
 *    box, the client omitted the empty field, and the save reported success
 *    having changed nothing. A silent no-op behind a "Profile updated" toast is
 *    worse than a disabled field, because it actively misleads.
 *
 * A blank is only acceptable as a *deletion*, never as a typo, so a non-empty
 * value still has to clear the minimum.
 *
 * The empty string is preserved rather than normalised to `undefined`, because
 * collapsing the two is precisely the bug this exists to fix.
 */
const clearableText = (min, max, label) =>
  z
    .string()
    .trim()
    .max(max, `${label} cannot exceed ${max} characters`)
    .refine((v) => v.length === 0 || v.length >= min, `${label} must be at least ${min} characters`)
    .optional();

/**
 * The editable profile surface, shared by `PUT /auth/profile` (onboarding and
 * the avatar upload) and `PUT /users/:id` (the Settings form).
 *
 * One schema for both on purpose. The two endpoints apply the same
 * allowlist and the same service function, so a second copy could only ever
 * drift — and when they did, one of them silently rejected a field the other
 * accepted.
 *
 * No field carries a `.default()`. A default here is a *write*: Zod fills it
 * in, so a request that touched only the bio would also blank the college and
 * wipe the skills. Omitted means "leave alone".
 */
const profileFields = {
  name: trimmed(2, 60, 'Name').optional(),
  bio: z.string().trim().max(280, 'Bio cannot exceed 280 characters').optional(),
  skills: stringArray(15).optional(),
  interests: stringArray(15).optional(),
  course: z.preprocess((v) => (v === '' || v === undefined ? undefined : v), courseEnum).optional(),
  branch: clearableText(2, 80, 'Branch'),
  year: optionalInt(1, 6),
  semester: optionalInt(1, 10),
  college: clearableText(2, 120, 'College'),
};

export const profileSetupSchema = z.object(profileFields).strict();

export const updateProfileSchema = z.object(profileFields).strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72)
      .regex(/[a-zA-Z]/, 'Password must contain a letter')
      .regex(/[0-9]/, 'Password must contain a number'),
  })
  .strict();

/**
 * Password strength for the self-service reset flow, where there is no
 * existing password to check against. Deliberately identical to the rules
 * applied at registration and change-password time, so a reset cannot be used
 * to set a weaker password than signup would have accepted.
 */
export const newPasswordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot exceed 72 characters')
  .regex(/[a-zA-Z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

/** POST /api/auth/verify-email */
export const verifyEmailSchema = z
  .object({
    token: trimmed(20, 200, 'Verification token'),
  })
  .strict();

/**
 * POST /api/auth/resend-verification and /forgot-password.
 *
 * Deliberately permissive: a strict address check would let a caller
 * distinguish "malformed" from "well-formed but unknown" and rebuild the
 * account enumeration this endpoint is designed to prevent.
 */
export const emailOnlySchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254, 'Email is too long'),
  })
  .strict();

/** POST /api/auth/reset-password */
export const resetPasswordSchema = z
  .object({
    token: trimmed(20, 200, 'Reset token'),
    password: newPasswordRule,
  })
  .strict();

/**
 * POST /api/auth/deactivate and DELETE /api/auth/account.
 *
 * Both re-authenticate, so the current password is mandatory — a stolen access
 * token should not be enough to close somebody's account.
 */
export const accountClosureSchema = z
  .object({
    password: z.string().min(1, 'Confirm your password to continue'),
    reason: z.string().trim().max(200, 'Reason cannot exceed 200 characters').optional(),
  })
  .strict();

/**
 * PATCH /api/auth/account-details
 *
 * Username and email live here rather than in the profile schema, because they
 * carry uniqueness and re-verification rules the ordinary profile fields do not.
 */
export const accountDetailsSchema = z
  .object({
    name: trimmed(2, 60, 'Name').optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be at least 3 characters')
      .max(24, 'Username cannot exceed 24 characters')
      .regex(/^[a-z0-9_.]+$/, 'Username can only contain letters, numbers, dots and underscores')
      .optional(),
    email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to change' });

/** PATCH /api/auth/notification-prefs */
export const notificationPrefsSchema = z
  .object({
    follows: z.boolean().optional(),
    likes: z.boolean().optional(),
    comments: z.boolean().optional(),
    replies: z.boolean().optional(),
    shares: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one preference' });

/** PATCH /api/auth/onboarding — how far through the wizard the user is. */
export const onboardingStepSchema = z
  .object({
    step: z.coerce.number().int().min(0).max(8),
  })
  .strict();
