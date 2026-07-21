import mongoose from 'mongoose';

const AmazonStockSkuStateSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    asin: { type: String, required: true },
    currency: { type: String, required: true },
    country: { type: String, required: true },
    lastStatus: { type: String, default: '' },
    lastStockQuantity: { type: Number, default: null },
    lastAvailabilityText: { type: String, default: '' },
    lastRun: { type: mongoose.Schema.Types.ObjectId, ref: 'AmazonStockCheckRun', default: null },
    lastCheckedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

AmazonStockSkuStateSchema.index({ currency: 1, sku: 1, asin: 1 }, { unique: true });

export default mongoose.model('AmazonStockSkuState', AmazonStockSkuStateSchema);
