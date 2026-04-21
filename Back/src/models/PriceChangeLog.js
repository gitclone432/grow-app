import mongoose from 'mongoose';

const PriceChangeLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    legacyItemId: { type: String, required: true, index: true },
    orderId: { type: String },
    productTitle: { type: String },
    originalPrice: { type: Number, required: true },
    newPrice: { type: Number, required: true },
    priceDifference: { type: Number },
    changeReason: { type: String, default: 'Manual price update' },
    changeSource: { 
      type: String, 
      enum: ['all_orders_sheet', 'compatibility_dashboard', 'listings_page', 'other'],
      default: 'all_orders_sheet'
    },
    success: { type: Boolean, default: true },
    errorMessage: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

// Indexes for efficient queries
PriceChangeLogSchema.index({ createdAt: -1 });
PriceChangeLogSchema.index({ user: 1, createdAt: -1 });
PriceChangeLogSchema.index({ seller: 1, createdAt: -1 });
PriceChangeLogSchema.index({ legacyItemId: 1, createdAt: -1 });

export default mongoose.model('PriceChangeLog', PriceChangeLogSchema);
