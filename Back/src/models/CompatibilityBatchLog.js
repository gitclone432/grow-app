import mongoose from 'mongoose';

const CompatibilityBatchLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  totalItems: { type: Number, required: true },
  correctCount: { type: Number, required: true },
  skippedCount: { type: Number, required: true },
  successCount: { type: Number, default: 0 },
  failureCount: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'processing', 'completed'], default: 'pending' },
  items: [
    {
      itemId: { type: String, required: true },
      title: { type: String },
      sku: { type: String },
      status: { type: String, enum: ['success', 'failure', 'skipped'], required: true },
      error: { type: String },
      compatibilityCount: { type: Number, default: 0 },
    }
  ],
  date: { type: String }, // YYYY-MM-DD for grouping
}, { timestamps: true });

CompatibilityBatchLogSchema.index({ user: 1, date: -1 });
CompatibilityBatchLogSchema.index({ seller: 1, date: -1 });

export default mongoose.model('CompatibilityBatchLog', CompatibilityBatchLogSchema);
