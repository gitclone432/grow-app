import mongoose from 'mongoose';

const EbayVehicleModelSchema = new mongoose.Schema(
  {
    make: { type: String, required: true },        // e.g., "Honda"
    model: { type: String, required: true },       // e.g., "Accord"
    fullName: { type: String, required: true },    // e.g., "Honda Accord"
    years: [{ type: String }],                     // e.g., ["2008", "2009", "2010"]
    categoryId: { type: String },                  // eBay category ID if available
    source: { type: String, default: 'ebay' }      // where this data came from
  },
  { timestamps: true }
);

// Index for fast lookups
EbayVehicleModelSchema.index({ fullName: 1 }, { unique: true });
EbayVehicleModelSchema.index({ make: 1 });
EbayVehicleModelSchema.index({ model: 1 });

export default mongoose.model('EbayVehicleModel', EbayVehicleModelSchema);
