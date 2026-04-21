import mongoose from 'mongoose';

/**
 * EbayDeviceModel - Stores cell phone and tablet models from eBay
 * 
 * Used for Range Analyzer to detect device models from pasted listing titles.
 * Similar to EbayVehicleModel but for Cell Phones & Accessories category.
 * 
 * Sources:
 * - Category 9355 (Cell Phones & Smartphones) - ~3,445 models
 * - Category 171485 (Tablets & eBook Readers) - ~532 models
 */
const ebayDeviceModelSchema = new mongoose.Schema({
  // Full model name as provided by eBay (e.g., "Apple iPhone 15 Pro Max", "Samsung Galaxy Tab S9")
  fullName: {
    type: String,
    required: true,
    index: true,
  },
  
  // Pre-normalized version for fast matching (lowercase, no spaces/hyphens)
  normalizedName: {
    type: String,
    required: true,
    index: true,
  },
  
  // Brand/Make (e.g., "Apple", "Samsung", "Google")
  // Extracted from fullName or from eBay Brand aspect
  brand: {
    type: String,
    default: '',
    index: true,
  },
  
  // The model name without brand (e.g., "iPhone 15 Pro Max", "Galaxy Tab S9")
  model: {
    type: String,
    default: '',
  },
  
  // Type of device: "cellphone" or "tablet"
  deviceType: {
    type: String,
    enum: ['cellphone', 'tablet'],
    required: true,
    index: true,
  },
  
  // eBay category ID where this model came from
  // 9355 = Cell Phones & Smartphones
  // 171485 = Tablets & eBook Readers
  ebayCategoryId: {
    type: String,
    required: true,
  },
  
}, { timestamps: true });

// Compound index for efficient queries
ebayDeviceModelSchema.index({ deviceType: 1, brand: 1 });
ebayDeviceModelSchema.index({ normalizedName: 1, deviceType: 1 });

// Prevent duplicates
ebayDeviceModelSchema.index({ fullName: 1, ebayCategoryId: 1 }, { unique: true });

const EbayDeviceModel = mongoose.model('EbayDeviceModel', ebayDeviceModelSchema);

export default EbayDeviceModel;
