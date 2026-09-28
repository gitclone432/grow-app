import mongoose from 'mongoose';

/**
 * Brands the ASIN precheck never surfaces. Managed from the "Excluded Brands"
 * dialog on the ASIN Precheck page so listers can add a brand the moment a
 * takedown lands, without a code change / redeploy.
 *
 * An ASIN is dropped when the name appears (as a whole word, case and ®/™
 * ignored) in the brand Scrapingdog returns. Only the brand field counts — a
 * title or description that mentions the name does not exclude the ASIN.
 */
const PrecheckBlockedBrandSchema = new mongoose.Schema(
  {
    // As entered — what the UI and the precheck's "excluded by brand" summary show.
    brand: {
      type: String,
      required: true,
      trim: true
    },
    // normalizeBrand(brand): lowercase, marks/quotes stripped, whitespace
    // collapsed. One entry per distinct brand regardless of casing.
    normalized: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    note: {
      type: String,
      trim: true,
      default: ''
    },
    // 'seed' for the entries imported from the old hard-coded list, 'manual'
    // for anything added through the UI.
    source: {
      type: String,
      enum: ['seed', 'manual'],
      default: 'manual'
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdByName: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

export default mongoose.model('PrecheckBlockedBrand', PrecheckBlockedBrandSchema);
