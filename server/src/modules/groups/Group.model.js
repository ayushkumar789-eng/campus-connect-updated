import mongoose from 'mongoose';

export const GROUP_CATEGORIES = [
  'course',
  'subject',
  'placement',
  'development',
  'photography',
  'events',
  'general',
];

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      minlength: [3, 'Group name must be at least 3 characters'],
      maxlength: [60, 'Group name cannot exceed 60 characters'],
    },
    /** URL-safe unique handle, e.g. "java-developers". */
    slug: { type: String, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, default: '', maxlength: 1000 },

    coverImage: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    category: { type: String, enum: GROUP_CATEGORIES, default: 'general' },
    tags: [{ type: String, trim: true, maxlength: 30, lowercase: true }],

    creator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    memberCount: { type: Number, default: 1, min: 0 },
    isPrivate: { type: Boolean, default: false },
    rules: [{ type: String, trim: true, maxlength: 200 }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

groupSchema.index({ name: 'text', description: 'text', tags: 'text' });
groupSchema.index({ category: 1, memberCount: -1 });

groupSchema.pre('validate', function buildSlug(next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }
  next();
});

/** Role of a member within the group, resolved against `admins`. */
groupSchema.virtual('isGroupAdmin').get(function () {
  return (this.admins ?? []).some((a) => a.toString() === this?.__viewerId);
});

export const Group = mongoose.model('Group', groupSchema);
