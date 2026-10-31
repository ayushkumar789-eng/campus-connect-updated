import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = /** @type {const} */ (['student', 'group_admin', 'admin']);

export const COURSES = [
  'MCA',
  'BCA',
  'B.Tech',
  'BBA',
  'B.Sc',
  'M.Sc',
  'B.Com',
  'MA',
  'MBA',
  'Diploma',
  'Other',
];

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [24, 'Username cannot exceed 24 characters'],
      match: [/^[a-z0-9_.]+$/, 'Username can only contain letters, numbers, dots and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },

    avatar: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    // ── Academic identity ────────────────────────────────────────────────
    college: { type: String, trim: true, default: '', maxlength: 120 },
    course: { type: String, trim: true, default: '', enum: [...COURSES, ''] },
    branch: { type: String, trim: true, default: '', maxlength: 80 },
    year: { type: Number, min: 1, max: 6, default: null },
    semester: { type: Number, min: 1, max: 10, default: null },

    bio: { type: String, trim: true, default: '', maxlength: 280 },
    skills: [{ type: String, trim: true, maxlength: 40 }],
    interests: [{ type: String, trim: true, maxlength: 40 }],

    // ── Email verification ────────────────────────────────────────────────
    // A user may register and browse before confirming, but the flag gates
    // anything that sends mail to others or could be used to impersonate them.
    emailVerified: { type: Boolean, default: false },
    emailVerifiedAt: { type: Date, default: null },

    // Bumped to invalidate every outstanding refresh token. Refresh tokens are
    // stateless JWTs, so this counter is what makes revocation possible: it is
    // carried in the token and compared on every refresh.
    tokenVersion: { type: Number, default: 0 },

    // How far through onboarding this account is. Lets a user leave and return
    // to the step they were on instead of starting over.
    onboardingStep: { type: Number, default: 0, min: 0, max: 8 },

    // Previous handles, newest last. Not an auth or uniqueness mechanism —
    // a durable trail so cycling between two usernames to shed a profile's
    // history is visible to moderation rather than invisible.
    recentUsernames: [{ type: String, lowercase: true, trim: true }],

    // ── Notification preferences ──────────────────────────────────────────
    // Stored per user so opting out is a data change, not a client-side
    // toggle that silently reappears on the next device.
    notificationPrefs: {
      follows: { type: Boolean, default: true },
      likes: { type: Boolean, default: true },
      comments: { type: Boolean, default: true },
      replies: { type: Boolean, default: true },
      shares: { type: Boolean, default: true },
    },

    // Denormalised counters — the `follows` collection is the source of truth.
    followersCount: { type: Number, default: 0, min: 0 },
    followingCount: { type: Number, default: 0, min: 0 },
    postsCount: { type: Number, default: 0, min: 0 },
    notesCount: { type: Number, default: 0, min: 0 },

    role: { type: String, enum: USER_ROLES, default: 'student' },
    // Every account created through public registration is a student. `admin`
    // and `group_admin` are only ever set by an existing admin or the seed
    // script — never accepted from a request body.
    profileCompleted: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false },
    suspendedReason: { type: String, default: '' },
    // Soft account closure. The row and its content are kept but the account is
    // hidden from every public surface and cannot sign in.
    deactivatedAt: { type: Date, default: null },
    // Set once the user confirms a deletion request; the account is scheduled
    // for a hard delete and cannot be used in the meantime.
    deletionRequestedAt: { type: Date, default: null },

    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.__v;
        delete ret.email; // email is only exposed on your own profile
        return ret;
      },
    },
  },
);

userSchema.virtual('displayName').get(function () {
  return this.name;
});

/** True when the account is visible to other people. */
userSchema.virtual('isActive').get(function () {
  return !this.suspended && !this.deactivatedAt && !this.deletionRequestedAt;
});

userSchema.index({ name: 'text', username: 'text', college: 'text' });
userSchema.index({ course: 1, year: 1 });
// Directory search sorts by relevance, then by follower count, so the sort field
// has to be indexed alongside it or every search is a collection scan.
userSchema.index({ suspended: 1, followersCount: -1 });
userSchema.index({ emailVerified: 1 });

/** Hashes the password whenever it is set or changed. */
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/**
 * Invalidates every outstanding refresh token by bumping the version the
 * tokens carry. Call this after a password change, on logout-everywhere, and
 * before a hard account delete.
 */
userSchema.methods.revokeSessions = function revokeSessions() {
  this.tokenVersion += 1;
  return this.tokenVersion;
};

/**
 * Shape returned to other users. Keeps email private and trims heavy fields.
 * @param {{ populateAvatar?: boolean }} [opts]
 */
userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: this._id,
    name: this.name,
    username: this.username,
    avatar: this.avatar?.url ?? '',
    college: this.college,
    course: this.course,
    branch: this.branch,
    year: this.year,
    bio: this.bio,
    skills: this.skills,
    role: this.role,
    followersCount: this.followersCount,
    followingCount: this.followingCount,
    postsCount: this.postsCount,
    profileCompleted: this.profileCompleted,
    createdAt: this.createdAt,
  };
};

/** Shape returned to the account owner. */
userSchema.methods.toPrivateJSON = function toPrivateJSON() {
  return {
    ...this.toPublicJSON(),
    email: this.email,
    semester: this.semester,
    interests: this.interests,
    notesCount: this.notesCount,
    suspended: this.suspended,
    suspendedReason: this.suspendedReason,
    // Owner-only session state. `tokenVersion` is deliberately omitted: it is
    // an internal revocation counter and has no business leaving the server.
    emailVerified: this.emailVerified,
    emailVerifiedAt: this.emailVerifiedAt,
    onboardingStep: this.onboardingStep,
    notificationPrefs: this.notificationPrefs,
    deactivatedAt: this.deactivatedAt,
    deletionRequestedAt: this.deletionRequestedAt,
  };
};

export const User = mongoose.model('User', userSchema);
