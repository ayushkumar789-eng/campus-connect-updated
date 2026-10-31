import mongoose from 'mongoose';

/**
 * Directed follow edge: `follower` follows `following`.
 * Unique index makes a duplicate follow impossible even under a race.
 */
const followSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true },
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ following: 1, createdAt: -1 });

followSchema.pre('validate', function noSelfFollow(next) {
  if (this.follower.equals(this.following)) {
    this.invalidate('following', 'You cannot follow yourself');
  }
  next();
});

export const Follow = mongoose.model('Follow', followSchema);
