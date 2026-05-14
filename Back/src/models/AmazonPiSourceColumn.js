import mongoose from 'mongoose';

/**
 * Saved paths under ScraperAPI `product_information` for template direct-mapping / AI placeholders.
 * `key` is the value stored in ListingTemplate.fieldConfigs[].amazonField (e.g. amazon_pi_enclosure_material).
 */
const amazonPiSourceColumnSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 120,
      match: /^amazon_pi_[a-z0-9_]+$/
    },
    label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    jsonPath: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 300
    },
    lastSampleValue: {
      type: String,
      default: ''
    },
    lastSourceAsin: {
      type: String,
      default: '',
      uppercase: true,
      trim: true
    }
  },
  { timestamps: true }
);

export default mongoose.model('AmazonPiSourceColumn', amazonPiSourceColumnSchema);
