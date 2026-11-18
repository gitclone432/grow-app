import mongoose from 'mongoose';

const EtsyProductSheetRowSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'EtsyStore', default: null, index: true },
  date: { type: String, default: '' }, // YYYY-MM-DD
  productLink: { type: String, default: '' },
  // ASIN-based identity of productLink, used for duplicate detection.
  linkKey: { type: String, default: '', index: true },
  sku: { type: String, default: '' },
  amazonPrice: { type: String, default: '' },
  etsyPrice: { type: String, default: '' },
  altLink: { type: String, default: '' },
  rowOrder: { type: Number, default: 0, index: true },
}, { timestamps: true });

export default mongoose.model('EtsyProductSheetRow', EtsyProductSheetRowSchema);
