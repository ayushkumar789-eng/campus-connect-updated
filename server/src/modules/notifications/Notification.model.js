import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'follow',
  'like',
  'comment',
  'reply',
  'share',
  'message',
  'group_invite',
  'group_announcement',
  'note_activity',
  'event_reminder',
];

/**
 * Polymorphic pointer to whatever triggered the notification.
 *
 * Declared as an explicit sub-schema with `_id: false` so the target lives at
 * the predictable path `entity.type`. An inline `{ type: { type: ObjectId } }`
 * definition silently drops the value — the outer `type` key is read as the
 * schema-type declaration — so the sub-schema form is the one to keep.
 *
 * `type` is deliberately declared without a `ref`. It is genuinely polymorphic
 * (`Post`, `User`, `Conversation`, …) and is never `populate`d, so a `ref`
 * naming one collection would be misleading. Excerpt hydration goes through the
 * explicit `model` check in `notifications.service.js` instead.
 */
const entitySchema = new mongoose.Schema(
  {
    type: { type: mongoose.Schema.Types.ObjectId, default: null },
    model: { type: String, trim: true, default: 'Post' },

    /**
     * The specific comment that caused the notification, when there is one.
     *
     * This is the field that makes a comment notification addressable. Without
     * it the only identity a comment notification had was the *post*, so every
     * comment by the same actor on the same post produced the same dedupe key
     * and the second, third and fourth were silently swallowed — and there was
     * no way to know which comment to clean up when it was deleted.
     *
     * Left null for every other notification type, including rows written
     * before this field existed, which keeps them on the old dedupe behaviour
     * and keeps them from colliding with new per-comment rows.
     */
    comment: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false },
);

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },

    /** Polymorphic reference to the thing that triggered the notification. */
    entity: { type: entitySchema, default: null },

    text: { type: String, trim: true, maxlength: 200, default: '' },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

// Drives the "Notifications (tab)" list and the unread badge.
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

/**
 * One notification per distinct event.
 *
 * The key is the full identity of the thing that happened: who it was to,
 * who did it, what kind of event, and which subject it happened on. Every
 * field the event can vary by belongs here, because a field that is *not* in
 * the key is a field two different events are allowed to share — and the second
 * one is then silently discarded as a duplicate.
 *
 * `entity.model` disambiguates the polymorphic subject (a `Post` id and a
 * `Conversation` id are both bare ObjectIds and mean nothing without it).
 *
 * `entity.comment` is what makes `comment` and `reply` work. Those two types
 * used to be keyed on the post alone, so two comments by the same person on one
 * post collapsed into a single notification and everyone after the first was
 * lost. It is null for every other type, so likes, shares and follows keep
 * their existing one-per-post behaviour.
 *
 * MIGRATION: this replaces the previous `{recipient, actor, type, entity.type}`
 * index, which must be dropped or comment B remains suppressed by comment A.
 * See `server/scripts/migrate-notification-entity.js` and Phase 4 of
 * PRODUCTION_READINESS.md. Production index sync is additive-only for exactly
 * this reason; nothing drops a unique constraint behind your back.
 */
notificationSchema.index(
  {
    recipient: 1,
    actor: 1,
    type: 1,
    'entity.model': 1,
    'entity.type': 1,
    'entity.comment': 1,
  },
  { unique: true, partialFilterExpression: { actor: { $type: 'objectId' } } },
);

export const Notification = mongoose.model('Notification', notificationSchema);
