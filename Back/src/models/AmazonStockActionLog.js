import mongoose from 'mongoose';

const AmazonStockActionLogSchema = new mongoose.Schema(
  {
    run: { type: mongoose.Schema.Types.ObjectId, ref: 'AmazonStockCheckRun', default: null, index: true },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'AmazonStockCheckItem', default: null },
    sku: { type: String, default: '', index: true },
    asin: { type: String, default: '' },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null },
    itemId: { type: String, default: '', index: true },
    actionType: {
      type: String,
      enum: ['set_quantity_zero', 'set_quantity_one', 'revise_listing', 'end_item'],
      required: true
    },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'skipped'],
      default: 'pending'
    },
    requestPayload: { type: Object, default: {} },
    responseSummary: { type: Object, default: {} },
    error: { type: String, default: '' }
  },
  { timestamps: true }
);

AmazonStockActionLogSchema.index({ createdAt: -1 });

export default mongoose.model('AmazonStockActionLog', AmazonStockActionLogSchema);
