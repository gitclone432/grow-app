import mongoose from 'mongoose';

const asinListProductSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  rangeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListRange',
    required: true,
    index: true
  },
  // Denormalized for easy top-level filtering
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AsinListCategory',
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Unique name per range
asinListProductSchema.index({ name: 1, rangeId: 1 }, { unique: true });

export default mongoose.model('AsinListProduct', asinListProductSchema);
