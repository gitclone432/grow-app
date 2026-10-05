import mongoose from 'mongoose';

// USD -> INR rate used by Store Profitability, one per month (YYYY-MM)
const storeProfitabilityRateSchema = new mongoose.Schema(
  {
    month: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
    rate: { type: Number, required: true, min: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('StoreProfitabilityRate', storeProfitabilityRateSchema);
