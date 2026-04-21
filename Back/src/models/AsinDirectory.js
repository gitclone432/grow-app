import mongoose from 'mongoose';

const asinDirectorySchema = new mongoose.Schema({
  asin: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    minlength: 10,
    maxlength: 10,
    validate: {
      validator: function(v) {
        return /^B[0-9A-Z]{9}$/.test(v);
      },
      message: props => `${props.value} is not a valid ASIN format!`
    }
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  addedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  // Enrichment fields from ScraperAPI
  title: { type: String, default: '' },
  brand: { type: String, default: '' },
  price: { type: String, default: '' },
  images: { type: [String], default: [] },
  description: { type: String, default: '' },
  color: { type: String, default: '' },
  compatibility: { type: String, default: '' },
  model: { type: String, default: '' },
  material: { type: String, default: '' },
  specialFeatures: { type: String, default: '' },
  size: { type: String, default: '' },

  // Scrape tracking
  scraped: { type: Boolean, default: false, index: true },
  scrapedAt: { type: Date, default: null },
  scrapeError: { type: String, default: null },

  // Manual edit tracking
  manuallyEdited: { type: Boolean, default: false },
  manuallyEditedAt: { type: Date, default: null },

  // Listing count — increments every time this ASIN is listed in any template/seller
  listingCount: {
    type: Number,
    default: 0,
    min: 0
  },

  // Assignment to a product list (Category → Range → Product)
  listProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListProduct',
    default: null,
    index: true
  },

  // Timestamp of when this ASIN was moved to a list via “Move to List”
  movedAt: {
    type: Date,
    default: null
  },

  // Marketplace / region this ASIN was scraped from
  region: {
    type: String,
    default: 'US',
    enum: ['US', 'UK', 'CA', 'AU'],
    index: true
  }
});

// Indexes
asinDirectorySchema.index({ addedAt: -1 });
asinDirectorySchema.index({ addedByUserId: 1, listProductId: 1, addedAt: -1 });

export default mongoose.model('AsinDirectory', asinDirectorySchema);
