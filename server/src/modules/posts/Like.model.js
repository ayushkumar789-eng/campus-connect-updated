import mongoose from 'mongoose';

/**
 * Like records. `Post.likedBy` is the fast read path for feed personalisation;
 * this collection is the durable record used for audit, analytics and the
 * "who liked this" list.
 */
const likeSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  },
  { timestamps: true },
);

// A user can like a given post exactly once.
likeSchema.index({ user: 1, post: 1 }, { unique: true });

export const Like = mongoose.model('Like', likeSchema);
