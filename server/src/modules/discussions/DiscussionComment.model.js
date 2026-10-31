import mongoose from 'mongoose';

const discussionCommentSchema = new mongoose.Schema(
  {
    discussion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Discussion',
      required: true,
      index: true,
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'DiscussionComment', default: null, index: true },
    body: {
      type: String,
      required: [true, 'Comment cannot be empty'],
      trim: true,
      maxlength: [4000, 'A comment cannot exceed 4000 characters'],
    },
    votes: {
      type: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          value: { type: Number, enum: [1, -1], required: true },
        },
      ],
      default: [],
    },
    score: { type: Number, default: 0 },
    isAnswer: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

discussionCommentSchema.index({ discussion: 1, parent: 1, createdAt: -1 });
discussionCommentSchema.index({ discussion: 1, score: -1 });

export const DiscussionComment = mongoose.model('DiscussionComment', discussionCommentSchema);
