import mongoose from 'mongoose';

const ReturnSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    returnId: { type: String, required: true, unique: true }, // eBay return ID
    orderId: { type: String, required: true }, // Related order ID
    legacyOrderId: String, // Legacy order ID if available

    // Buyer information
    buyerUsername: String,

    // Return details
    returnReason: String, // e.g., "NOT_AS_DESCRIBED", "DEFECTIVE", etc.
    reasonType: String, // e.g., "SNAD", "REMORSE"
    returnCloseReason: String, // e.g., why the return was closed
    sellerAvailableOptions: [{
      actionType: String,
      actionURL: String
    }],
    returnStatus: String, // e.g., "RETURN_OPEN", "RETURN_CLOSED", "SELLER_CLOSED", etc.
    returnType: String, // e.g., "MONEY_BACK"
    worksheetStatus: {
      type: String,
      enum: ['open', 'attended', 'resolved'],
      default: 'open'
    }, // Manual status for worksheet tracking
    ebayStatus: {
      type: String,
      default: ''
    }, // Manual eBay return lifecycle status
    amazonStatus: {
      type: String,
      default: ''
    }, // Manual Amazon return lifecycle status

    // Item details
    itemId: String,
    itemTitle: String,
    sku: String,
    returnQuantity: Number,

    sellerLoginName: String,
    marketplaceId: String,
    returnState: String,

    // Shipment / tracking (from GET /return/{id} + /tracking)
    trackingNumber: String,
    carrierUsed: String,
    trackingStatus: String,
    shippingMethod: String,
    deliveryStatus: String,
    trackingScanHistory: [{
      eventStatus: String,
      eventDesc: String,
      eventCode: String,
      eventTime: Date
    }],
    trackingInfo: Object,

    // Files metadata only (from GET /return/{id}/files) — never store fileData blobs
    filesCount: { type: Number, default: 0 },
    files: [{
      fileId: String,
      fileName: String,
      filePurpose: String,
      fileFormat: String,
      fileSize: Number
    }],

    // Detail payloads (sanitized)
    rawDetail: Object,
    rawTracking: Object,

    // Financial
    refundAmount: {
      value: String,
      currency: String
    },

    // Dates
    creationDate: Date,
    transactionDate: Date, // order sale / eBay transaction date
    responseDate: Date, // When seller must respond by
    rmaNumber: String, // Return Merchandise Authorization number

    // Comments/notes
    buyerComments: String,
    notes: String, // alias/display field for return notes (usually buyer comments)
    sellerComments: String,

    // Full eBay response (for reference)
    rawData: Object,

    // Manual logs field for internal notes
    logs: { type: String, default: '' },

    // Internal team notes (separate from buyer comments)
    internalNotes: { type: String, default: '' },

    // Compliance board status for kanban board
    complianceBoardStatus: { type: String, default: 'case_opened' },

    // Timestamp of when card was first moved to Case Not Opened column
    returnCaseNotOpenedAssignedAt: Date,

    // Manual SNAD override — counts this return in the BBE calculation even if the reason code is not SNAD
    markedAsSNAD: { type: Boolean, default: false }
  },
  { timestamps: true }
);

// Indexes for faster queries
ReturnSchema.index({ seller: 1, creationDate: -1 });
// Note: returnId already has unique index from schema definition
ReturnSchema.index({ orderId: 1 });
ReturnSchema.index({ returnStatus: 1, creationDate: -1 });

export default mongoose.model('Return', ReturnSchema);
