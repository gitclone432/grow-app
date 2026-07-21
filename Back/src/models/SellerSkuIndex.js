import mongoose from 'mongoose';

// Lightweight collection for fast SKU-active checks.
// Populated by the "Sync SKU Index" action / cron.
const SellerSkuIndexSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    itemId: { type: String, required: true },
    sku: { type: String, default: '' },
    baseSku: { type: String, default: '' }, // sku with trailing -<number> stripped
    title: { type: String, default: '' },
    price: { type: Number, default: null },
    currency: { type: String, default: '' },
    syncedAt: { type: Date, required: true },
});

SellerSkuIndexSchema.index({ seller: 1, itemId: 1 }, { unique: true });
SellerSkuIndexSchema.index({ seller: 1, baseSku: 1 });
SellerSkuIndexSchema.index({ seller: 1, sku: 1 });
SellerSkuIndexSchema.index({ sku: 1 });
SellerSkuIndexSchema.index({ baseSku: 1 });

export default mongoose.model('SellerSkuIndex', SellerSkuIndexSchema);
