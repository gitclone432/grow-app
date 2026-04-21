import mongoose from 'mongoose';

const amazonProductSchema = new mongoose.Schema({
  asin: {
    type: String,
    required: true,
    trim: true
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Seller',
    required: false
  },
  productUmbrellaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductUmbrella',
    required: true
  },
  title: {
    type: String,
    trim: true
  },
  price: {
    type: String,
    trim: true
  },
  brand: {
    type: String,
    trim: true
  },
  description: {
    type: String
  },
  images: [{
    type: String
  }],
  ebayImage: {
    type: String,
    trim: true
  },
  rawData: {
    type: mongoose.Schema.Types.Mixed
  },
  customFields: {
    type: Map,
    of: String,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  deleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
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

// Compound index for unique constraint: same ASIN cannot be added twice for the same seller
amazonProductSchema.index({ asin: 1, sellerId: 1 }, { unique: true });

// Additional index for query performance
amazonProductSchema.index({ productUmbrellaId: 1 });

amazonProductSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('AmazonProduct', amazonProductSchema);
