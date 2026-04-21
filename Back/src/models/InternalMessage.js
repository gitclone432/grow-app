import mongoose from 'mongoose';

const InternalMessageSchema = new mongoose.Schema(
  {
    // Conversation identifier: sorted usernames to ensure consistency
    // Example: "alice_bob" (always alphabetically sorted)
    conversationId: { type: String, required: true, index: true },
    
    // Participants
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    // Message content
    body: { type: String, required: true },
    
    // Optional attachments (images/files)
    mediaUrls: [{ type: String }],
    
    // Message status
    read: { type: Boolean, default: false },
    
    // Timestamp
    messageDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

// Indexes for efficient queries
InternalMessageSchema.index({ conversationId: 1, messageDate: -1 });
InternalMessageSchema.index({ sender: 1, recipient: 1 });
InternalMessageSchema.index({ recipient: 1, read: 1 });
InternalMessageSchema.index({ createdAt: -1 }); // For superadmin pagination

export default mongoose.model('InternalMessage', InternalMessageSchema);
