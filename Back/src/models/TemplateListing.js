import mongoose from 'mongoose';

const templateListingSchema = new mongoose.Schema({
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ListingTemplate',
    required: true
  },
  
  // Seller association for multi-seller template management
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: true,
    index: true
  },
  
  // CORE COLUMNS (38 fixed fields)
  action: {
    type: String,
    default: 'Add'
  },
  customLabel: {
    type: String,
    required: true,
    trim: true
  },
  categoryId: Number,
  categoryName: String,
  title: {
    type: String,
    required: true,
    maxlength: 80
  },
  relationship: String,
  relationshipDetails: String,
  scheduleTime: String,
  upc: String,
  epid: String,
  startPrice: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    default: 1
  },
  itemPhotoUrl: String,
  videoId: String,
  conditionId: {
    type: String,
    default: '1000-New'
  },
  description: String,
  format: {
    type: String,
    default: 'FixedPrice'
  },
  duration: {
    type: String,
    default: 'GTC'
  },
  buyItNowPrice: Number,
  bestOfferEnabled: Boolean,
  bestOfferAutoAcceptPrice: Number,
  minimumBestOfferPrice: Number,
  immediatePayRequired: Boolean,
  location: {
    type: String,
    default: 'UnitedStates'
  },
  shippingService1Option: String,
  shippingService1Cost: Number,
  shippingService1Priority: Number,
  shippingService2Option: String,
  shippingService2Cost: Number,
  shippingService2Priority: Number,
  maxDispatchTime: Number,
  returnsAcceptedOption: String,
  returnsWithinOption: String,
  refundOption: String,
  returnShippingCostPaidBy: String,
  shippingProfileName: String,
  returnProfileName: String,
  paymentProfileName: String,
  
  // ASIN reference for tracking (NOT exported to CSV)
  _asinReference: {
    type: String,
    trim: true,
    select: false,
    index: true
  },
  
  // Amazon product link - auto-generated from ASIN
  amazonLink: {
    type: String,
    trim: true
  },
  
  // Listing status for database tracking
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'sold', 'ended'],
    default: 'draft',
    index: true
  },
  
  // eBay integration fields (for future use)
  ebayItemId: {
    type: String,
    trim: true
  },
  ebayListingUrl: {
    type: String,
    trim: true
  },
  ebayPublishedAt: Date,
  lastSyncedAt: Date,
  
  // Soft delete support
  deletedAt: {
    type: Date,
    default: null
  },
  
  // Download batch tracking
  downloadBatchId: {
    type: String,
    default: null,
    index: true
  },
  downloadedAt: {
    type: Date,
    default: null
  },
  downloadBatchNumber: {
    type: Number,
    default: null
  },
  downloadedActionField: {
    type: String,
    default: null
  },
  
  // Duplicate tracking
  duplicateCount: {
    type: Number,
    default: 0,
    min: 0
  },
  pendingRedownload: {
    type: Boolean,
    default: false,
    index: true
  },
  lastDuplicateAttempt: {
    type: Date,
    default: null
  },
  
  // CUSTOM COLUMNS (flexible Map structure)
  customFields: {
    type: Map,
    of: String,
    default: new Map()
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

// Compound index for SKU uniqueness per seller per template
templateListingSchema.index({ templateId: 1, sellerId: 1, customLabel: 1 }, { unique: true });

// Compound index for seller + template filtering
templateListingSchema.index({ templateId: 1, sellerId: 1 });

// Additional indexes for database view performance
templateListingSchema.index({ sellerId: 1, templateId: 1, createdAt: -1 });
templateListingSchema.index({ customLabel: 1 });
templateListingSchema.index({ deletedAt: 1 });
templateListingSchema.index({ templateId: 1, sellerId: 1, downloadBatchId: 1 });

// Pre-save hook to auto-generate Amazon link and update timestamp
templateListingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-generate Amazon link from ASIN
  if (this._asinReference && !this.amazonLink) {
    this.amazonLink = `https://www.amazon.com/dp/${this._asinReference}`;
  }
  
  // Update amazonLink if ASIN changed
  if (this.isModified('_asinReference') && this._asinReference) {
    this.amazonLink = `https://www.amazon.com/dp/${this._asinReference}`;
  }
  
  next();
});

export default mongoose.model('TemplateListing', templateListingSchema);
