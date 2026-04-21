import mongoose from 'mongoose';

const ListingSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  itemId: { type: String, required: true, unique: true },
  sku: { type: String },
  title: { type: String },
  currentPrice: { type: Number },
  currency: { type: String },
  mainImageUrl: { type: String },

  // Primary category from eBay (e.g., "eBay Motors:Parts & Accessories:...")
  categoryName: { type: String },

  // We store the clean HTML here
  descriptionPreview: { type: String },

  // Compatibility Data
  compatibility: [
    {
      notes: String,
      nameValueList: [
        { name: String, value: String } // e.g., Name: Year, Value: 2024
      ]
    }
  ],

  listingStatus: { type: String }, // Active, Ended
  startTime: Date,
  endTime: Date,
}, { timestamps: true });

// Compound index for efficient pagination queries
// Optimizes: { seller: X, listingStatus: 'Active' } sorted by startTime
ListingSchema.index({ seller: 1, listingStatus: 1, startTime: -1 });
ListingSchema.index({ startTime: -1 }); // For listing stats date-range queries

export default mongoose.model('Listing', ListingSchema);