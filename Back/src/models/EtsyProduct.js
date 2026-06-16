import mongoose from 'mongoose';

const EtsyProductSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'EtsyStore', index: true },
  listedDate: { type: String, default: '' },
  links: { type: String, default: '' },
  sku: { type: String, default: '' },
  supplierPrice: { type: String, default: '' },
  listedPrice: { type: String, default: '' },
  region: { type: String, default: '' },
  timeLeft: { type: String, default: '' },
  listingStatus: { type: String, default: '' },
  rowOrder: { type: Number, default: 0, index: true },
}, { timestamps: true });

EtsyProductSchema.index({ store: 1, rowOrder: 1 });

export default mongoose.model('EtsyProduct', EtsyProductSchema);
