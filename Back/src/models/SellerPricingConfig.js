import mongoose from 'mongoose';

const pricingConfigSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  // Currency conversion rates
  spentRate: {
    type: Number,
    required: false,
    default: null
  },
  payoutRate: {
    type: Number,
    required: false,
    default: null
  },
  // Profit & Fees
  desiredProfit: {
    type: Number,
    required: false,
    default: null
  },
  fixedFee: {
    type: Number,
    default: 0
  },
  saleTax: {
    type: Number,
    default: 0
  },
  ebayFee: {
    type: Number,
    default: 12.9
  },
  adsFee: {
    type: Number,
    default: 3
  },
  tdsFee: {
    type: Number,
    default: 1
  },
  shippingCost: {
    type: Number,
    default: 0
  },
  taxRate: {
    type: Number,
    default: 10
  },
  // Tiered profit system
  profitTiers: {
    enabled: {
      type: Boolean,
      default: false
    },
    tiers: [{
      minCost: {
        type: Number,
        required: true,
        min: 0
      },
      maxCost: {
        type: Number,
        required: false,
        default: null
      },
      profit: {
        type: Number,
        required: true,
        min: 0
      }
    }]
  }
}, { _id: false });

const sellerPricingConfigSchema = new mongoose.Schema({
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListingTemplate',
    required: true,
    index: true
  },
  pricingConfig: {
    type: pricingConfigSchema,
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

// Compound unique index: one config per seller+template combination
sellerPricingConfigSchema.index({ sellerId: 1, templateId: 1 }, { unique: true });

export default mongoose.model('SellerPricingConfig', sellerPricingConfigSchema);
