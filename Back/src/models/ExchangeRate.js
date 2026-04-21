import mongoose from 'mongoose';

const EXCHANGE_RATE_MARKETPLACES = [
  'EBAY',
  'AMAZON',
  'EBAY_US',
  'EBAY_CA',
  'EBAY_AU',
  'EBAY_GB',
  'AMAZON_US',
  'AMAZON_CA',
  'AMAZON_AU',
  'AMAZON_GB',
  'OTHER'
];

const ExchangeRateSchema = new mongoose.Schema(
  {
    rate: {
      type: Number,
      required: true
    },
    effectiveDate: {
      type: Date,
      required: true
    },
    marketplace: {
      type: String,
      default: 'EBAY',
      enum: EXCHANGE_RATE_MARKETPLACES
    },
    applicationMode: {
      type: String,
      enum: ['effective', 'specific-date'],
      default: 'effective'
    },
    createdBy: {
      type: String,
      default: 'system'
    },
    notes: String
  },
  { timestamps: true }
);

// Index for faster queries
ExchangeRateSchema.index({ effectiveDate: -1, marketplace: 1 });

export default mongoose.model('ExchangeRate', ExchangeRateSchema);
