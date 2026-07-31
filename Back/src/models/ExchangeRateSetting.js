import mongoose from 'mongoose';

// Singleton model to store current USD to INR exchange rate
const ExchangeRateSettingSchema = new mongoose.Schema(
  {
    rate: {
      type: Number,
      required: true,
      default: 83.5
    }, // Default rate: 1 USD = 83.5 INR
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

export default mongoose.model('ExchangeRateSetting', ExchangeRateSettingSchema);
