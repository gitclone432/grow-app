import mongoose from 'mongoose';

const OrderQtyExcludeLegacySchema = new mongoose.Schema(
  {
    legacyItemId: { type: String, required: true, unique: true, trim: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null },
  },
  { timestamps: true }
);

export default mongoose.model('OrderQtyExcludeLegacy', OrderQtyExcludeLegacySchema);
