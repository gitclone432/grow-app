import mongoose from 'mongoose';

const SellerItemSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
    sellerName: { type: String, default: '' },
    itemId: { type: String, default: '' },
    title: { type: String, default: '' },
    price: { type: Number, default: null },
    currency: { type: String, default: '' },
    orderCount: { type: Number, default: 0 },
    orderCount90d: { type: Number, default: 0 },
    lastOrderDate: { type: Date, default: null },
    quantityZeroStatus: {
      type: String,
      enum: ['not_needed', 'pending', 'success', 'failed', 'skipped'],
      default: 'not_needed'
    },
    quantityZeroError: { type: String, default: '' },
    quantityOneStatus: {
      type: String,
      enum: ['not_needed', 'pending', 'success', 'failed', 'skipped'],
      default: 'not_needed'
    },
    quantityOneError: { type: String, default: '' }
  },
  { _id: false }
);

const AmazonStockCheckItemSchema = new mongoose.Schema(
  {
    run: { type: mongoose.Schema.Types.ObjectId, ref: 'AmazonStockCheckRun', required: true, index: true },
    sku: { type: String, required: true, index: true },
    asin: { type: String, default: '', index: true },
    currency: { type: String, required: true, index: true },
    country: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'in_stock', 'in_stock_unconfirmed', 'low_stock', 'out_of_stock', 'unknown_stock_text', 'no_asin', 'error'],
      default: 'queued',
      index: true
    },
    stockQuantity: { type: Number, default: null },
    availabilityText: { type: String, default: '' },
    scraperStatusCode: { type: Number, default: null },
    scraperResponseSummary: { type: Object, default: {} },
    // True when the ambiguous unknown_stock_text retry ran for this item
    // (see parseStockStatus's returns-policy fallback in the route).
    retryAttempted: { type: Boolean, default: false },
    // Brand and buy-box seller ("Sold by") from the same Scrapingdog response
    // the stock status came from, as the ASIN precheck reads them. Recorded for
    // the Excluded Brands page only — nothing in the stock check itself reads
    // them. The *Key twins are normalizeBrand() of each, which the page matches
    // the exclusion list against. No defaults on purpose: a missing field means
    // the item was checked before these were recorded, while '' means Amazon
    // showed no brand/seller.
    amazonBrand: { type: String },
    amazonSoldBy: { type: String },
    amazonBrandKey: { type: String },
    amazonSoldByKey: { type: String },
    // Buy-box "Ships from" from the same response, and whether it is Amazon
    // (isShipsFromAmazon — the ASIN precheck's rule; blank counts as not
    // Amazon). Also for the Excluded Brands page only, and also no defaults:
    // missing means the item was checked before these were recorded.
    amazonShipsFrom: { type: String },
    amazonShippedByAmazon: { type: Boolean },
    sellerItems: { type: [SellerItemSchema], default: [] },
    // True when any seller carrying this SKU sold at least one unit in the
    // last 90 days — drives the Low Stock (No Orders 90d) / (Orders 90d) split.
    hasRecentOrder90d: { type: Boolean, default: false, index: true },
    previousStatus: { type: String, default: '' },
    becameAvailable: { type: Boolean, default: false, index: true },
    error: { type: String, default: '' },
    errorType: { type: String, default: '', index: true },
    errorSource: { type: String, default: '' },
    retryable: { type: Boolean, default: false },
    checkedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

AmazonStockCheckItemSchema.index({ run: 1, status: 1 });
AmazonStockCheckItemSchema.index({ run: 1, status: 1, hasRecentOrder90d: 1 });
AmazonStockCheckItemSchema.index({ run: 1, status: 1, asin: 1 });
AmazonStockCheckItemSchema.index({ run: 1, becameAvailable: 1 });
AmazonStockCheckItemSchema.index({ run: 1, 'sellerItems.quantityZeroStatus': 1 });
AmazonStockCheckItemSchema.index({ run: 1, 'sellerItems.quantityOneStatus': 1 });
AmazonStockCheckItemSchema.index({ run: 1, 'sellerItems.orderCount': 1 });
AmazonStockCheckItemSchema.index({ currency: 1, sku: 1, asin: 1 });
// Excluded Brands page, "Not shipped by Amazon" view: its counts are answered
// from this index alone and its rows are paged in this order.
AmazonStockCheckItemSchema.index({ run: 1, amazonShippedByAmazon: 1, amazonShipsFrom: 1, sku: 1 });
// Per-seller views of a run (stock-check item filters and the Excluded Brands
// page) filter on run + the nested sellerItems.sellerId. Without this, those
// queries seek the run (~160k items) then fetch every doc to test the nested
// array — the 25k:1 scan the Query Advisor flags. Multikey is valid here:
// sellerItems is the only array field in the key.
AmazonStockCheckItemSchema.index({ run: 1, 'sellerItems.sellerId': 1 });

export default mongoose.model('AmazonStockCheckItem', AmazonStockCheckItemSchema);
