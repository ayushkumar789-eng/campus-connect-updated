import mongoose from 'mongoose';

export const DISCUSSION_CATEGORIES = [
  'programming',
  'placements',
  'academics',
  'college-life',
  'projects',
  'career',
  'general',
];

const voteSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    value: { type: Number, enum: [1, -1], required: true },
  },
  { _id: false },
);

const discussionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [8, 'Title must be at least 8 characters'],
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    body: { type: String, trim: true, default: '', maxlength: 8000 },

    category: { type: String, enum: DISCUSSION_CATEGORIES, default: 'general', index: true },
    tags: [{ type: String, trim: true, maxlength: 30, lowercase: true }],

    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },

    votes: { type: [voteSchema], default: [] },
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 },
    score: { type: Number, default: 0, index: true },
    commentCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    isAnswered: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

discussionSchema.index({ title: 'text', body: 'text' });
discussionSchema.index({ category: 1, score: -1 });
discussionSchema.index({ createdAt: -1 });
discussionSchema.index({ score: 1, commentCount: -1 });

export const Discussion = mongoose.model('Discussion', discussionSchema);
