import mongoose from 'mongoose';

const LatestMessageSchema = new mongoose.Schema(
  {
    messageId: String,
    messageBody: String,
    subject: String,
    senderUsername: String,
    recipientUsername: String,
    createdDate: Date,
    readStatus: mongoose.Schema.Types.Mixed
  },
  { _id: false }
);

const EbayMessageConversationSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    conversationType: {
      type: String,
      enum: ['FROM_MEMBERS', 'FROM_EBAY'],
      default: 'FROM_MEMBERS',
      index: true
    },
    conversationTitle: { type: String, default: '' },
    conversationStatus: { type: String, default: '' },
    otherPartyUsername: { type: String, default: '', index: true },
    referenceType: { type: String, default: '' },
    referenceId: { type: String, default: '', index: true },
    orderId: { type: String, default: '', index: true },
    unreadCount: { type: Number, default: 0 },
    latestMessage: { type: LatestMessageSchema, default: null },
    ebayCreatedDate: { type: Date, default: null },
    ebayUpdatedDate: { type: Date, default: null },
    lastSyncedAt: { type: Date, default: Date.now, index: true },
    messagesSyncedAt: { type: Date, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

EbayMessageConversationSchema.index(
  { seller: 1, conversationId: 1, conversationType: 1 },
  { unique: true }
);
EbayMessageConversationSchema.index({ seller: 1, lastSyncedAt: -1 });
EbayMessageConversationSchema.index({ seller: 1, ebayUpdatedDate: -1 });
// All-sellers inbox load (Buyer Messages "All Sellers"): filter by
// conversationType + recency and sort by ebayUpdatedDate / lastSyncedAt.
// Without these, that query does a full collection scan + in-memory sort, which
// is why the very first load (cold cache) was slow.
EbayMessageConversationSchema.index({ conversationType: 1, ebayUpdatedDate: -1 });
EbayMessageConversationSchema.index({ conversationType: 1, lastSyncedAt: -1 });

const EbayMessageConversationMessageSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    conversationType: {
      type: String,
      enum: ['FROM_MEMBERS', 'FROM_EBAY'],
      default: 'FROM_MEMBERS'
    },
    messageId: { type: String, required: true },
    senderUsername: { type: String, default: '' },
    recipientUsername: { type: String, default: '' },
    subject: { type: String, default: '' },
    messageBody: { type: String, default: '' },
    readStatus: { type: mongoose.Schema.Types.Mixed, default: null },
    createdDate: { type: Date, default: null, index: true },
    messageMedia: { type: [mongoose.Schema.Types.Mixed], default: [] },
    lastSyncedAt: { type: Date, default: Date.now },
    raw: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

EbayMessageConversationMessageSchema.index(
  { seller: 1, conversationId: 1, messageId: 1 },
  { unique: true }
);
EbayMessageConversationMessageSchema.index({ seller: 1, conversationId: 1, createdDate: 1 });

export const EbayMessageConversation = mongoose.model(
  'EbayMessageConversation',
  EbayMessageConversationSchema
);

export const EbayMessageConversationMessage = mongoose.model(
  'EbayMessageConversationMessage',
  EbayMessageConversationMessageSchema
);

export default EbayMessageConversation;
