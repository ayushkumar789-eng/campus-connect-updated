import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [140, 'Title cannot exceed 140 characters'],
    },
    description: { type: String, trim: true, default: '', maxlength: 4000 },

    startsAt: { type: Date, required: [true, 'Start date is required'] },
    endsAt: { type: Date, default: null },
    location: { type: String, trim: true, default: '', maxlength: 160 },
    isOnline: { type: Boolean, default: false },
    meetingLink: { type: String, trim: true, default: '' },

    coverImage: { url: { type: String, default: '' }, publicId: { type: String, default: '' } },

    organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },
    college: { type: String, trim: true, default: '', index: true },

    registrationCount: { type: Number, default: 0, min: 0 },
    capacity: { type: Number, default: null, min: 1 },
    tags: [{ type: String, trim: true, maxlength: 30, lowercase: true }],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Declared once, here, rather than as `index: true` on the field above — both at
// once makes Mongoose warn about a duplicate index on every boot.
eventSchema.index({ startsAt: 1 });
eventSchema.index({ title: 'text', description: 'text' });

export const Event = mongoose.model('Event', eventSchema);
