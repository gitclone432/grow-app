import mongoose from 'mongoose';

// Every flow that ends listings through /ebay/end-item and is reported in End
// Listing Stats. excluded_brand = the Stock Check Excluded Brands page.
export const END_LISTING_SOURCES = Object.freeze([
  'duplicate_sku',
  'expiry_listing',
  'amazon_stock_check',
  'sku_listing_manager',
  'keyword_end_listing',
  'excluded_brand'
]);

const EndListingLogSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  itemId: { type: String, required: true },
  sku: { type: String, default: null },
  country: { type: String, default: null },
  marketplaceId: { type: String, default: null },
  // Which Amazon Stock Check run triggered this end, if any (set for
  // amazon_stock_check and excluded_brand; null for the other sources, which
  // aren't run-scoped).
  run: { type: mongoose.Schema.Types.ObjectId, ref: 'AmazonStockCheckRun', default: null, index: true },
  source: {
    type: String,
    enum: END_LISTING_SOURCES,
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
