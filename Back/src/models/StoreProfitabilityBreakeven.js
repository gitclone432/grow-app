import mongoose from 'mongoose';

const storeProfitabilityBreakevenSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    amount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

storeProfitabilityBreakevenSchema.index({ seller: 1, month: 1 }, { unique: true });

export default mongoose.model('StoreProfitabilityBreakeven', storeProfitabilityBreakevenSchema);
