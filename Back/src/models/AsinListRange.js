import mongoose from 'mongoose';

const asinListRangeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
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

// Unique name per category
asinListRangeSchema.index({ name: 1, categoryId: 1 }, { unique: true });

export default mongoose.model('AsinListRange', asinListRangeSchema);
