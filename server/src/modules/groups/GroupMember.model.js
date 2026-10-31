import mongoose from 'mongoose';

export const GROUP_ROLES = ['member', 'moderator', 'admin'];

const groupMemberSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: GROUP_ROLES, default: 'member' },
  },
  { timestamps: true },
);

groupMemberSchema.index({ group: 1, user: 1 }, { unique: true });
groupMemberSchema.index({ user: 1, createdAt: -1 });

export const GroupMember = mongoose.model('GroupMember', groupMemberSchema);
