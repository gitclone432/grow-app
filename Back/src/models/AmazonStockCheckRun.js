import mongoose from 'mongoose';

const AmazonStockCheckRunSchema = new mongoose.Schema(
  {
    countries: [{ type: String, required: true }],
    currencies: [{ type: String, required: true }],
    status: {
      type: String,
      enum: ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      index: true
    },
    mode: {
      type: String,
      enum: ['pilot_option_b', 'custom', 'full', 'seller'],
      default: 'custom'
    },
    // Optional seller scope: when set, only this seller's SKU index rows are checked.
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
    threshold: { type: Number, default: 5 },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Which server instance owns/processes this run ('render' | 'local'), same
    // convention as AutoCompatibilityBatch. Empty/missing = legacy run created
    // before ownership tracking — only the Render runner adopts those on boot.
    runnerId: { type: String, default: '' },
    totalSkus: { type: Number, default: 0 },
    asinFoundCount: { type: Number, default: 0 },
    noAsinCount: { type: Number, default: 0 },
    checkedCount: { type: Number, default: 0 },
    inStockCount: { type: Number, default: 0 },
    // Inferred available (a price was found but Amazon gave no explicit
    // stock/availability text) — kept separate from inStockCount so it's
    // never conflated with Amazon-confirmed availability.
    inStockUnconfirmedCount: { type: Number, default: 0 },
    lowStockCount: { type: Number, default: 0 },
    outOfStockCount: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    becameAvailableCount: { type: Number, default: 0 },
    quantityZeroAttemptedCount: { type: Number, default: 0 },
    quantityZeroSuccessCount: { type: Number, default: 0 },
    quantityZeroFailedCount: { type: Number, default: 0 },
    creditsEstimated: { type: Number, default: 0 },
    creditsUsed: { type: Number, default: 0 },
    candidateBuildComplete: { type: Boolean, default: false },
    unknownStockTextCount: { type: Number, default: 0 },
    error: { type: String, default: '' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

AmazonStockCheckRunSchema.index({ createdAt: -1 });

export default mongoose.model('AmazonStockCheckRun', AmazonStockCheckRunSchema);
