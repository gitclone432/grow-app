import mongoose from 'mongoose';

const ConversationMetaSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },

    // Identifiers (Logic: Unique per OrderID OR Buyer+Item)
    buyerUsername: { type: String, required: true },
    orderId: { type: String, default: null }, // Null for inquiries
    itemId: { type: String, required: true },

    // The Workflow Dropdowns
    category: {
      type: String,
      enum: ['', 'INR', 'Cancellation', 'Return', 'Refund', 'Replace', 'Out of Stock', 'Issue with Product', 'Inquiry'],
      default: ''
    },
    caseStatus: {
      type: String,
      enum: ['Case Opened', 'Case Not Opened'],
      default: 'Case Not Opened'
    },

    // Management Status
    status: { type: String, enum: ['Case Not Opened', 'Open', 'In Progress', 'Resolved'], default: 'Open' },

    // Who picked up the conversation
    pickedUpBy: { type: String, default: null },

    // Resolution Details
    notes: { type: String, default: '' },
    resolvedAt: Date,
    resolvedBy: String
  },
  { timestamps: true }
);

// Compound Indexes to enforce the "Linking Logic"
// 1. If OrderID exists, it must be unique per seller
ConversationMetaSchema.index(
  { seller: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: "string" } } }
);

// 2. If OrderID is NULL (Inquiry), Buyer + Item must be unique
ConversationMetaSchema.index(
  { seller: 1, buyerUsername: 1, itemId: 1, orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: null } }
);

export default mongoose.model('ConversationMeta', ConversationMetaSchema);
