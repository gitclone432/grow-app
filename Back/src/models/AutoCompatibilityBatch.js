import mongoose from 'mongoose';

const AutoCompatibilityBatchSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  triggeredBy: { type: mongoose.Schema.Types.Mixed, ref: 'User', default: 'auto' },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  targetDate: { type: String, required: true }, // YYYY-MM-DD — listing startTime filter
  itemLimit: { type: Number, default: 0 }, // 0 = no limit, >0 = max items to process
  sourceItemIds: [{ type: String }],

  // Counters
  totalListings: { type: Number, default: 0 },
  processedCount: { type: Number, default: 0 },
  successCount: { type: Number, default: 0 },
  warningCount: { type: Number, default: 0 },
  needsManualCount: { type: Number, default: 0 },
  ebayErrorCount: { type: Number, default: 0 },
  aiFailedCount: { type: Number, default: 0 },

  // Manual review summary (filled when user does manual review after batch)
  manualReviewDone: { type: Boolean, default: false },
  manualCorrectCount: { type: Number, default: 0 },
  manualSkippedCount: { type: Number, default: 0 },
  manualEndedCount: { type: Number, default: 0 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },

  // Currently processing item (for live progress)
  currentItemTitle: { type: String, default: '' },
  currentStep: { type: String, default: '' }, // e.g. 'ai_suggest', 'fetching_models', 'sending_to_ebay'

  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },

  // Which server instance owns this batch (prevents cross-environment resume conflicts)
  runnerId: { type: String, default: null },
  lastHeartbeatAt: { type: Date, default: null },
}, { timestamps: true });

AutoCompatibilityBatchSchema.index({ seller: 1, createdAt: -1 });
AutoCompatibilityBatchSchema.index({ triggeredBy: 1, createdAt: -1 });

export default mongoose.model('AutoCompatibilityBatch', AutoCompatibilityBatchSchema);
