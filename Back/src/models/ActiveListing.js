import mongoose from 'mongoose';

// Separate collection for ALL active listings (used by Edit Listings Dashboard)
// This keeps the original Listing collection intact for eBay Motors Compatibility Dashboard
const ActiveListingSchema = new mongoose.Schema({
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    itemId: { type: String, required: true, unique: true },
    sku: { type: String },
    title: { type: String },
    currentPrice: { type: Number },
    currency: { type: String },
    quantity: { type: Number, default: 0 },
    soldQuantity: { type: Number, default: 0 },
    views30d: { type: Number, default: null },
    promoted: { type: Boolean, default: null },
    adRate: { type: Number, default: null },
    watchCount: { type: Number, default: null },
    timeLeft: { type: String, default: '' },
    mainImageUrl: { type: String },

    // Primary category from eBay
    categoryName: { type: String },

    // Clean HTML description
    descriptionPreview: { type: String },

    listingStatus: { type: String }, // Active, Ended
    startTime: Date,
    endTime: Date,
}, { timestamps: true });

// Index for efficient queries
ActiveListingSchema.index({ seller: 1, listingStatus: 1, startTime: -1 });

export default mongoose.model('ActiveListing', ActiveListingSchema);
