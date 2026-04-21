import mongoose from 'mongoose';

const AutoCompatibilityBatchItemSchema = new mongoose.Schema({
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'AutoCompatibilityBatch', required: true },
  itemId: { type: String, required: true },
  title: { type: String },
  sku: { type: String },
  status: { type: String, enum: ['success', 'warning', 'needs_manual', 'ebay_error', 'ai_failed'], required: true },
  aiSuggestion: {
    make: String,
    model: String,
    startYear: String,
    endYear: String,
    allFitments: [mongoose.Schema.Types.Mixed]
  },
  resolvedMake: String,
  resolvedModel: String,
  failureReason: String,
  compatibilityList: [mongoose.Schema.Types.Mixed],
  ebayWarning: String,
  ebayError: String,
  strippedCount: { type: Number, default: 0 }
}, { timestamps: true });

AutoCompatibilityBatchItemSchema.index({ batchId: 1 });

export default mongoose.model('AutoCompatibilityBatchItem', AutoCompatibilityBatchItemSchema);
