import mongoose from 'mongoose';

export const POST_TYPES = ['text', 'image', 'video', 'poll', 'resource'];
export const POST_VISIBILITY = ['public', 'followers', 'group'];

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    name: { type: String, default: '' },
    mimetype: { type: String, default: '' },
    size: { type: Number, default: 0 },
    alt: { type: String, default: '' },
  },
  { _id: false },
);

const pollOptionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 80 },
    // Kept on the post so a feed read can render results, percentages and the
    // viewer's own vote in one round trip. Deliberately NOT `select: false`:
    // hiding it would make both the tally and `hasVoted` silently read as zero.
    votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { _id: true },
);

const pollSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 200 },
    options: {
      type: [pollOptionSchema],
      validate: [(v) => v.length >= 2 && v.length <= 6, 'A poll needs between 2 and 6 options'],
    },
    endsAt: { type: Date, default: null },
    totalVotes: { type: Number, default: 0 },
  },
  { _id: false },
);

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, maxlength: 140, default: '' },
    fileUrl: { type: String, required: true },
    publicId: { type: String, default: '' },
    name: { type: String, default: '' },
    mimetype: { type: String, default: '' },
    size: { type: Number, default: 0 },
    /** Set when the attachment is also a Note, linking the two records. */
    note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', default: null },
  },
  { _id: false },
);

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    content: {
      type: String,
      trim: true,
      default: '',
      maxlength: [2200, 'A post cannot exceed 2200 characters'],
    },

    type: { type: String, enum: POST_TYPES, default: 'text' },
    media: { type: [mediaSchema], default: [] },
    poll: { type: pollSchema, default: undefined },
    resource: { type: resourceSchema, default: undefined },

    visibility: { type: String, enum: POST_VISIBILITY, default: 'public' },
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null, index: true },

    // Denormalised counters. The Like / Comment / SavedPost collections are
    // the source of truth; these keep feed reads to a single query.
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    saveCount: { type: Number, default: 0 },
    pollVoteCount: { type: Number, default: 0 },

    // `likedBy` allows personalising a feed read in one round trip.
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sharedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    editedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

// Feed query: newest first, scoped to an author or visibility.
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ visibility: 1, group: 1, createdAt: -1 });
postSchema.index({ content: 'text' });
postSchema.index({ 'poll.options.votes': 1 });

/** True when this post's poll has a closing date in the past. */
postSchema.virtual('pollClosed').get(function () {
  return Boolean(this.poll?.endsAt && this.poll.endsAt.getTime() < Date.now());
});

export const Post = mongoose.model('Post', postSchema);
