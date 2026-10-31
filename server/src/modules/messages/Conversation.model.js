import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    /**
     * Distinguishes a two-person conversation from a group one.
     *
     * This field exists so the uniqueness constraint below can be expressed at
     * all. The previous version tried to say "only when there is no third
     * participant" via `partialFilterExpression: { 'participants.2': { $exists:
     * false } }`, which MongoDB rejects — `$exists` and `$not` are not allowed
     * in a partial index expression — so the index could never be created and
     * duplicate direct conversations were possible. Naming the kind makes the
     * filter a plain equality, which is both supported and obvious.
     */
    kind: { type: String, enum: ['direct', 'group'], default: 'direct', index: true },
    /** Direct conversations are keyed by participant; groups added in Phase 4. */
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: {
      content: { type: String, default: '' },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      createdAt: { type: Date, default: null },
      type: { type: String, default: 'text' },
    },
    /** Denormalised so the inbox can sort without loading messages. */
    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

/**
 * Exactly one conversation per pair of direct-message users.
 *
 * Scoped to `kind: 'direct'` so that a future group conversation can list the
 * same people without colliding.
 */
conversationSchema.index(
  { participants: 1 },
  { unique: true, partialFilterExpression: { kind: 'direct' } },
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
