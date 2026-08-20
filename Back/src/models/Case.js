import mongoose from 'mongoose';

const CaseSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  caseId: { type: String, required: true, unique: true },
  caseType: { type: String, enum: ['INR', 'SNAD', 'OTHER'], default: 'INR' },
  orderId: String,
  buyerUsername: String,
  status: { type: String, default: 'OPEN' }, // OPEN, CLOSED, WAITING_BUYER_RESPONSE, WAITING_SELLER_RESPONSE, ON_HOLD
  worksheetStatus: { 
    type: String, 
    enum: ['open', 'attended', 'resolved'],
    default: 'open'
  }, // Manual status for worksheet tracking

  complianceBoardStatus: {
    type: String,
    enum: ['inr_case_opened', 'inr_follow_up', 'inr_tracking_id_upload', 'inr_case_open_ebay_step_in', 'inr_fully_refunded', 'inr_partial_refund', 'inr_not_refunded_resolved', 'inr_case_closed'],
    default: 'inr_case_opened'
  }, // Status for compliance board kanban view

  inrCaseNotOpenedAssignedAt: Date, // Timestamp of when card was first moved to Case Not Opened column
  
  // Dates
  creationDate: Date,
  sellerResponseDueDate: Date,
  escalationDate: Date,
  closedDate: Date,
  lastModifiedDate: Date,
  
  // Item Info
  itemId: String,
  itemTitle: String,
  itemPictureUrl: String,
  marketplaceId: String,
  
  // Amount
  claimAmount: {
    value: String,
    currency: { type: String, default: 'USD' }
  },
  
  // Resolution
  resolution: String,
  reasonForClosure: String,
  sellerOutcome: String,
  sellerResponse: String,

  shipmentTrackingDetails: {
    trackingURL: String,
    trackingNumber: String,
    carrier: String,
    estimateFromDate: Date,
    currentStatus: String,
  },

  // Raw eBay data for reference
  rawData: Object,
  
  // Internal notes
  notes: { type: String, default: '' },
  
  // Manual logs field for internal notes
  logs: { type: String, default: '' }
}, { timestamps: true });

// Index for faster queries (caseId already indexed via unique: true)
CaseSchema.index({ seller: 1, status: 1 });
CaseSchema.index({ creationDate: -1 });

export default mongoose.model('Case', CaseSchema);
