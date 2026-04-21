import mongoose from 'mongoose';

const StoreSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    platform: { type: mongoose.Schema.Types.ObjectId, ref: 'Platform', required: true }
  },
  { timestamps: true }
);

StoreSchema.index({ name: 1, platform: 1 }, { unique: true });

export default mongoose.model('Store', StoreSchema);


