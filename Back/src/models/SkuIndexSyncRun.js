import mongoose from 'mongoose';

const SkuIndexSyncRunSellerSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  sellerName: { type: String, default: '' },
  status: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', 'dismissed', 'interrupted'],
    default: 'queued',
  },
  totalCount: { type: Number, default: 0 },
  currentPage: { type: Number, default: 0 },
  totalPages: { type: Number, default: 0 },
  totalEntries: { type: Number, default: 0 },
  error: { type: String, default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  dismissedAt: { type: Date, default: null },
}, { _id: false });

const SkuIndexSyncRunSchema = new mongoose.Schema({
  source: { type: String, enum: ['cron', 'manual'], default: 'cron' },
  runnerId: { type: String, default: null },
  status: {
    type: String,
    enum: ['queued', 'running', 'stopping', 'completed', 'failed', 'stopped', 'interrupted'],
    default: 'queued',
    index: true,
  },
  requestedStop: { type: Boolean, default: false },
  concurrency: { type: Number, default: 3 },
  sellersTotal: { type: Number, default: 0 },
  sellersComplete: { type: Number, default: 0 },
  sellers: { type: [SkuIndexSyncRunSellerSchema], default: [] },
  syncStartedAt: { type: Date, default: null },
  endTimeFrom: { type: Date, default: null },
  endTimeTo: { type: Date, default: null },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  stoppedAt: { type: Date, default: null },
  interruptedAt: { type: Date, default: null },
  stopRequestedAt: { type: Date, default: null },
  error: { type: String, default: null },
}, { timestamps: true });

SkuIndexSyncRunSchema.index({ startedAt: -1 });

export default mongoose.model('SkuIndexSyncRun', SkuIndexSyncRunSchema);
