import mongoose from 'mongoose';

const eventRegistrationSchema = new mongoose.Schema(
  {
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** Set when the user asks to be reminded ahead of the event. */
    reminderAt: { type: Date, default: null },
  },
  { timestamps: true },
);

eventRegistrationSchema.index({ event: 1, user: 1 }, { unique: true });
eventRegistrationSchema.index({ user: 1, createdAt: -1 });

export const EventRegistration = mongoose.model('EventRegistration', eventRegistrationSchema);
