import mongoose from 'mongoose';

const OrderQtyExcludeLegacySchema = new mongoose.Schema(
  {
    legacyItemId: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);

OrderQtyExcludeLegacySchema.index({ legacyItemId: 1 });

export default mongoose.model('OrderQtyExcludeLegacy', OrderQtyExcludeLegacySchema);
