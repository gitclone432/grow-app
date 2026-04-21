import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    orderId: String, 
    itemId: String,
    itemTitle: String,
    buyerUsername: { type: String, required: true },
    
    externalMessageId: { type: String, unique: true, sparse: true },
    sender: { type: String, enum: ['SELLER', 'BUYER'], required: true },
    subject: String,
    body: String,
    
    // NEW: Array to store image links
    mediaUrls: [{ type: String }], 

    read: { type: Boolean, default: false },
    messageType: { type: String, enum: ['ORDER', 'INQUIRY', 'DIRECT'], default: 'ORDER' },
    
    messageDate: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

MessageSchema.index({ seller: 1, orderId: 1 });
MessageSchema.index({ seller: 1, buyerUsername: 1 });
MessageSchema.index({ messageDate: -1 });

export default mongoose.model('Message', MessageSchema);