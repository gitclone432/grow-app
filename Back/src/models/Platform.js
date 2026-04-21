import mongoose from 'mongoose';

const PlatformSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, enum: ['source', 'listing'], required: true }
  },
  { timestamps: true }
);

PlatformSchema.index({ name: 1, type: 1 }, { unique: true });

export default mongoose.model('Platform', PlatformSchema);


