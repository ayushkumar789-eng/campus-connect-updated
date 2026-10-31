import mongoose from 'mongoose';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate_speech',
  'misinformation',
  'copyright',
  'inappropriate_content',
  'other',
];

export const REPORT_TARGETS = ['post', 'comment', 'discussion', 'note', 'user', 'group', 'message'];

/**
 * A moderation ticket. `status` moves open → reviewed → actioned.
 * Resolved reports keep the reason and who actioned them for the audit log.
 */
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true, index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, default: '', maxlength: 500 },

    status: { type: String, enum: ['open', 'reviewed', 'actioned', 'dismissed'], default: 'open', index: true },
    resolutionNote: { type: String, default: '', maxlength: 500 },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, createdAt: -1 });
// Prevents the same user reporting the same thing twice.
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });

export const Report = mongoose.model('Report', reportSchema);
