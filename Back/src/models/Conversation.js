import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['dm', 'group'], required: true, default: 'dm' },

    // For dm: exactly 2 users. For group: N users.
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],

    // Group-only fields (null/undefined for dm)
    name: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Group admins — can remove members, rename the group, promote/demote other
    // admins. Any participant can still add new members. The creator is
    // admin by default. Empty/legacy groups fall back to "everyone is admin"
    // (see isGroupAdmin() in routes/internalMessages.js) so nobody gets locked out.
    admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Denormalized for fast sidebar listing without re-aggregating messages
    lastMessage: {
      body: { type: String, default: null },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      createdAt: { type: Date, default: null }
    },
    lastMessageAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export default mongoose.model('Conversation', ConversationSchema);
