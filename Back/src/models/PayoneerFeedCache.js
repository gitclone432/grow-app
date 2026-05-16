import mongoose from 'mongoose';

/** Shared eBay SUCCEEDED payouts feed for Payoneer sheet (all API instances). */
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
    total: { type: Number, default: 0 },
    cachedAt: { type: Date, default: null },
  },
  { collection: 'payoneer_feed_cache', versionKey: false }
);

export default mongoose.models.PayoneerFeedCache
  || mongoose.model('PayoneerFeedCache', schema);
