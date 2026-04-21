import mongoose from 'mongoose';

const PaymentDisputeSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  paymentDisputeId: { type: String, required: true, unique: true },
  orderId: String,
  buyerUsername: String,
  
  // Status & Reason
  paymentDisputeStatus: String, // OPEN, WAITING_FOR_SELLER_RESPONSE, UNDER_REVIEW, RESOLVED_BUYER_FAVOUR, RESOLVED_SELLER_FAVOUR, CLOSED
  reason: String, // ITEM_NOT_RECEIVED, UNAUTHORIZED_PAYMENT, ITEM_NOT_AS_DESCRIBED, DUPLICATE_CHARGE, etc.
  worksheetStatus: { 
    type: String, 
    enum: ['open', 'attended', 'resolved'],
    default: 'open'
  }, // Manual status for worksheet tracking
  
  // Dates
  openDate: Date,
  respondByDate: Date,
  closedDate: Date,
  
  // Amounts
  amount: {
    value: String,
    currency: { type: String, default: 'USD' }
  },
  
  // Resolution
  sellerProtectionDecision: String, // ELIGIBLE, NOT_ELIGIBLE, PARTIAL
  resolution: String,
  
  // Evidence info
  evidenceDeadline: Date,
  evidenceSubmitted: { type: Boolean, default: false },
  
  // Raw eBay data for reference
  rawData: Object
}, { timestamps: true });

// Index for faster queries (paymentDisputeId already indexed via unique: true)
PaymentDisputeSchema.index({ seller: 1, paymentDisputeStatus: 1 });
PaymentDisputeSchema.index({ openDate: -1 });

export default mongoose.model('PaymentDispute', PaymentDisputeSchema);
