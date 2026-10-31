import mongoose from 'mongoose';

export const MESSAGE_KINDS = ['text', 'image', 'file', 'system'];

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: MESSAGE_KINDS, default: 'text' },
    content: { type: String, trim: true, default: '', maxlength: 4000 },
    attachment: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
      name: { type: String, default: '' },
      mimetype: { type: String, default: '' },
      size: { type: Number, default: 0 },
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readAt: { type: Date, default: null },
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, transform(_doc, ret) { delete ret.__v; return ret; } },
  },
);

messageSchema.index({ conversation: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
