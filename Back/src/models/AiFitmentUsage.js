import mongoose from 'mongoose';

const aiFitmentUsageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: ['ai_suggest', 'save_next'],
    index: true
  },
  // Number of items in the batch (for bulk AI suggest this = selected count, for save_next = 1)
  itemCount: {
    type: Number,
    default: 1
  },
  // Whether the AI response had fitment data (only relevant for ai_suggest)
  hadData: {
    type: Boolean,
    default: false
  },
  // Pre-calculated date parts for fast aggregation
  date: {
    type: String, // 'YYYY-MM-DD'
    required: true,
    index: true
  },
  year: { type: Number, index: true },
  month: { type: Number, index: true },
  day: { type: Number, index: true }
}, {
  timestamps: true
});

// Compound indexes for common queries
aiFitmentUsageSchema.index({ userId: 1, date: 1, action: 1 });
aiFitmentUsageSchema.index({ date: 1, action: 1 });

export default mongoose.model('AiFitmentUsage', aiFitmentUsageSchema);
