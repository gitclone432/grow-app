import mongoose from 'mongoose';

const customColumnSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  dataType: {
    type: String,
    enum: ['text', 'number', 'multiselect', 'boolean'],
    default: 'text'
  },
  defaultValue: {
    type: String,
    default: ''
  },
  isRequired: {
    type: Boolean,
    default: false
  },
  order: {
    type: Number,
    required: true
  },
  placeholder: {
    type: String,
    default: ''
  }
}, { _id: false });

const fieldConfigSchema = new mongoose.Schema({
  fieldType: {
    type: String,
    enum: ['core', 'custom'],
    default: 'core'
  },
  ebayField: {
    type: String,
    required: true
    // No enum - can be core field name OR custom column name
    // Validation happens at application level based on fieldType
  },
  source: {
    type: String,
    enum: ['ai', 'direct'],
    default: 'ai'
  },
  promptTemplate: String,
  amazonField: String,
  transform: {
    type: String,
    enum: ['none', 'pipeSeparated', 'removeSymbol', 'htmlFormat', 'truncate80'],
    default: 'none'
  },
  enabled: {
    type: Boolean,
    default: true
  },
  defaultValue: {
    type: String,
    default: ''
  }
}, { _id: false });

const asinAutomationSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  fieldConfigs: [fieldConfigSchema]
}, { _id: false });

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
    required: false,
    default: 0
  },
  // Percentage-based fees
  saleTax: {
    type: Number,
    required: false,
    default: 0
  },
  ebayFee: {
    type: Number,
    required: false,
    default: 12.9
  },
  adsFee: {
    type: Number,
    required: false,
    default: 3
  },
  tdsFee: {
    type: Number,
    required: false,
    default: 1
  },
  // Shipping & Tax on cost
  shippingCost: {
    type: Number,
    required: false,
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

const listingTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    default: ''
  },
  ebayCategory: {
    id: {
      type: Number
    },
    name: {
      type: String
    }
  },
  customColumns: [customColumnSchema],
  asinAutomation: {
    type: asinAutomationSchema,
    default: { enabled: false, fieldConfigs: [] }
  },
  pricingConfig: {
    type: pricingConfigSchema,
    default: () => ({ enabled: false })
  },
  coreFieldDefaults: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  customActionField: {
    type: String,
    default: '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)'
  },
  // Assignment to the hierarchy: Range (required for directory page) + Product (optional sub-link)
  rangeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListRange',
    default: null,
    index: true
  },
  listProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListProduct',
    default: null,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

listingTemplateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('ListingTemplate', listingTemplateSchema);
