import mongoose from 'mongoose';

/** Cached Seller Funds Overview rows (no eBay call on page load). */
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    sellers: { type: [mongoose.Schema.Types.Mixed], default: [] },
    cachedAt: { type: Date, default: null },
  },
  { collection: 'seller_funds_summary_cache', versionKey: false },
);

export default mongoose.models.SellerFundsSummaryCache
  || mongoose.model('SellerFundsSummaryCache', schema);
