import mongoose from 'mongoose';

const EndListingLogSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  itemId: { type: String, required: true },
  sku: { type: String, default: null },
  country: { type: String, default: null },
  marketplaceId: { type: String, default: null },
  // Which Amazon Stock Check run triggered this end, if any (null for the
  // duplicate_sku/expiry_listing sources, which aren't run-scoped).
  run: { type: mongoose.Schema.Types.ObjectId, ref: 'AmazonStockCheckRun', default: null, index: true },
  source: {
    type: String,
    enum: ['duplicate_sku', 'expiry_listing', 'amazon_stock_check'],
    required: true,
  },
  // User who triggered the end action (null for legacy rows).
  endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  endedAt: { type: Date, default: Date.now },
}, { timestamps: false });

EndListingLogSchema.index({ seller: 1, endedAt: -1 });
EndListingLogSchema.index({ seller: 1, country: 1, endedAt: -1 });
EndListingLogSchema.index({ endedAt: -1 });
// Supports "was this item already ended?" lookups on the verify panel.
EndListingLogSchema.index({ itemId: 1, endedAt: -1 });

export default mongoose.model('EndListingLog', EndListingLogSchema);
