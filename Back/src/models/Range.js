import mongoose from 'mongoose';

const RangeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true }
  },
  { timestamps: true }
);

RangeSchema.index({ name: 1, category: 1 }, { unique: true });

export default mongoose.model('Range', RangeSchema);
