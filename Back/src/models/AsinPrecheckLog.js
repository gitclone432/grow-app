import mongoose from 'mongoose';

// One document per ASIN Precheck batch (max 100 ASINs each) — powers the
// Precheck Stats page's by-country / by-date / by-user / by-seller counts.
// Written fire-and-forget by the asin-precheck-stream route; a failed write
// never blocks the precheck itself.
const AsinPrecheckLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'ListingTemplate', default: null, index: true },
    region: { type: String, enum: ['US', 'UK', 'CA', 'AU'], required: true, index: true },
    asins: { type: [String], default: [] },
    asinCount: { type: Number, required: true },
    // Missing-stock-info re-fetches made during this batch (see
    // scrapingdogProduct.js availability retry) and how many recovered info.
    availabilityRetryCount: { type: Number, default: 0 },
    availabilityRetrySuccessCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

AsinPrecheckLogSchema.index({ createdAt: -1 });
AsinPrecheckLogSchema.index({ region: 1, createdAt: -1 });

export default mongoose.model('AsinPrecheckLog', AsinPrecheckLogSchema);
