import mongoose from 'mongoose';

// Import schemas from ListingTemplate to reuse them
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
  shippingCost: {
    type: Number,
    required: false,
    default: 0
  },
  taxRate: {
    type: Number,
    default: 10
  },
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

/**
 * Template Override Model
 * Stores seller-specific customizations on top of base templates
 * Only stores differences/overrides, not full template copies
 */
const templateOverrideSchema = new mongoose.Schema({
  // Reference to base template
  baseTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListingTemplate',
    required: true,
    index: true
  },
  
  // Reference to seller
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true
  },
  
  // Override flags - what this seller has customized
  overrides: {
    customColumns: { type: Boolean, default: false },
    asinAutomation: { type: Boolean, default: false },
    pricingConfig: { type: Boolean, default: false },
    coreFieldDefaults: { type: Boolean, default: false },
    customActionField: { type: Boolean, default: false }
  },
  
  // Seller-specific customizations (only populated if overridden)
  customColumns: {
    type: [customColumnSchema],
    default: undefined
  },
  
  asinAutomation: {
    type: asinAutomationSchema,
    default: undefined
  },
  
  pricingConfig: {
    type: pricingConfigSchema,
    default: undefined
  },
  
  coreFieldDefaults: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  
  customActionField: {
    type: String,
    default: undefined
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Unique constraint: One override per seller per template
templateOverrideSchema.index(
  { baseTemplateId: 1, sellerId: 1 }, 
  { unique: true }
);

// Update timestamp on save
templateOverrideSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('TemplateOverride', templateOverrideSchema);
