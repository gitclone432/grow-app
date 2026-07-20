import mongoose from 'mongoose';

const ManualEndListingAdjustmentSchema = new mongoose.Schema({
  pdtDate: { type: String, required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  country: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1 },
  note: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

ManualEndListingAdjustmentSchema.index({ pdtDate: 1, seller: 1, country: 1 });
ManualEndListingAdjustmentSchema.index({ createdAt: -1 });

export default mongoose.model('ManualEndListingAdjustment', ManualEndListingAdjustmentSchema);
