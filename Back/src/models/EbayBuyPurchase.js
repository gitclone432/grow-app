import mongoose from 'mongoose';

const EbayBuyPurchaseSchema = new mongoose.Schema(
  {
    inputId: { type: String, default: '' },
    itemId: { type: String, default: '' },
    legacyItemId: { type: String, default: '' },
    title: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    marketplace: { type: String, default: 'EBAY_US' },
    checkoutSessionId: { type: String, default: '' },
    purchaseOrderId: { type: String, default: '' },
    purchaseOrderHref: { type: String, default: '' },
    purchaseOrderPaymentStatus: { type: String, default: '' },
    status: { type: String, enum: ['placed', 'failed', 'previewed'], default: 'placed' },
    error: { type: String, default: '' },
    pricingSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    raw: { type: mongoose.Schema.Types.Mixed, default: null },
    buyerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'EbayBuyerAccount', default: null, index: true },
    placedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

EbayBuyPurchaseSchema.index({ createdAt: -1 });

export default mongoose.model('EbayBuyPurchase', EbayBuyPurchaseSchema);
