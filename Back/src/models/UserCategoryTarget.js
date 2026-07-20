import mongoose from 'mongoose';

const UserCategoryTargetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    marketplace: { type: String, enum: ['US', 'UK', 'AU', 'Canada'], required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'AsinListCategory', required: true },
    range: { type: mongoose.Schema.Types.ObjectId, ref: 'AsinListRange', default: null },
    dailyDesiredQuantity: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true }
);

UserCategoryTargetSchema.index({ user: 1, seller: 1, marketplace: 1, category: 1, range: 1 }, { unique: true });

export default mongoose.model('UserCategoryTarget', UserCategoryTargetSchema);
