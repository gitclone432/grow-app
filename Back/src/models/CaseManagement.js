import mongoose from 'mongoose';

const CaseManagementSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  caseId: { type: String, required: true, unique: true },
  caseType: String,
  status: { type: String, default: 'OPEN' },
  orderId: String,
  buyerUsername: String,
  itemId: String,
  itemTitle: String,
  itemPictureUrl: String,
  marketplaceId: String,
  initiator: String,
  inquiryId: String,
  escalationReason: String,
  claimAmount: {
    value: String,
    currency: { type: String, default: 'USD' },
  },
  creationDate: Date,
  sellerResponseDueDate: Date,
  lastModifiedDate: Date,
  closedDate: Date,
  sellerOutcome: String,
  reasonForClosure: String,
  shipmentTrackingDetails: {
    trackingURL: String,
    trackingNumber: String,
    carrier: String,
    estimateFromDate: Date,
    currentStatus: String,
  },
  rawData: Object,
  notes: { type: String, default: '' },
  // Remark field for fulfillment status updates
  remark: { type: String, default: '' },
}, { timestamps: true });

CaseManagementSchema.index({ seller: 1, status: 1 });
CaseManagementSchema.index({ creationDate: -1 });

export default mongoose.model('CaseManagement', CaseManagementSchema);
