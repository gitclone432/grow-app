import mongoose from 'mongoose';

const CancellationSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    cancelId: { type: String, required: true, unique: true },
    legacyOrderId: String,
    orderId: String,

    buyerUsername: String,
    buyerLoginName: String,
    sellerLoginName: String,
    respondType: String,

    cancelState: String,
    cancelStatus: String,
    cancelReason: String,
    cancelCloseReason: String,
    requestorType: String,
    paymentStatus: String,
    marketplaceId: String,
    partialOrderType: String,

    requestRefundAmount: {
      value: String,
      currency: String
    },

    cancelRequestDate: Date,
    cancelCloseDate: Date,
    sellerResponseDueDate: Date,
    buyerResponseDueDate: Date,
    lastModifiedDate: Date,
    shipmentDate: Date,

    itemId: String,
    itemTitle: String,

    worksheetStatus: {
      type: String,
      enum: ['open', 'attended', 'resolved'],
      default: 'open'
    }, // Manual status for worksheet tracking

    complianceBoardStatus: {
      type: String,
      enum: ['cancellation_request', 'accepted', 'declined'],
      default: 'cancellation_request'
    }, // Status for compliance board kanban view

    dateSold: Date, // Date the order was sold (from related Order.creationDate or Order.dateSold)
    remark: String, // Cancellation-specific remark/note

    rawData: Object,
    logs: { type: String, default: '' }
  },
  { timestamps: true }
);

CancellationSchema.index({ seller: 1, cancelRequestDate: -1 });
CancellationSchema.index({ orderId: 1 });
CancellationSchema.index({ legacyOrderId: 1 });
CancellationSchema.index({ cancelState: 1, cancelRequestDate: -1 });
CancellationSchema.index({ cancelStatus: 1, cancelRequestDate: -1 });

export default mongoose.model('Cancellation', CancellationSchema);
