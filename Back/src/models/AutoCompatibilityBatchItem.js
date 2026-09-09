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
    suggestedTrims: [String],
    excludedTrims: [String],
    suggestedEngines: [String],
    excludedEngines: [String],
    allFitments: [mongoose.Schema.Types.Mixed]
  },
  trimsStrategy: String,
  resolvedMake: String,
  resolvedModel: String,
  // Per-fitment outcome when the AI found multiple vehicles:
  // [{ make, model, startYear, endYear, resolvedMake, resolvedModel, status: 'applied'|'failed', reason, entryCount }]
  fitmentResults: [mongoose.Schema.Types.Mixed],
  failureReason: String,
  compatibilityList: [mongoose.Schema.Types.Mixed],
  ebayWarning: String,
  ebayError: String,
  strippedCount: { type: Number, default: 0 }
}, { timestamps: true });

AutoCompatibilityBatchItemSchema.index({ batchId: 1 });

export default mongoose.model('AutoCompatibilityBatchItem', AutoCompatibilityBatchItemSchema);
