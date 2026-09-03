import mongoose from 'mongoose';

const InternalMessageSchema = new mongoose.Schema(
  {
    // Reference to the owning Conversation (dm or group)
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },

    // Author
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Message content
    body: { type: String, required: true },

    // Optional attachments (images/files)
    mediaUrls: [{ type: String }],

    // Users @mentioned in this message
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Per-user read receipts — needed once a conversation can have >2 participants
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        readAt: { type: Date, default: Date.now }
      }
    ],

    // Timestamp
    messageDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Indexes for efficient queries
InternalMessageSchema.index({ conversationId: 1, messageDate: -1 });
InternalMessageSchema.index({ sender: 1 });
InternalMessageSchema.index({ createdAt: -1 }); // For superadmin pagination

export default mongoose.model('InternalMessage', InternalMessageSchema);
