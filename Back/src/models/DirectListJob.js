import mongoose from 'mongoose';

const directListJobResultSchema = new mongoose.Schema({
  asin: { type: String, required: true },
  status: { type: String, enum: ['success', 'error', 'ready'], default: 'error' },
  sku: { type: String, default: '' },
  itemId: { type: String, default: '' },
  listingUrl: { type: String, default: '' },
  error: { type: String, default: '' },
}, { _id: false });

const directListJobSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ListingTemplate', required: true },
  region: { type: String, default: 'US' },
  asins: { type: [String], required: true },
  scheduledAt: { type: Date, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'done', 'failed', 'cancelled'],
    default: 'pending',
  },
  batchSize: { type: Number, default: 25 },
  delayMinutesBetweenBatches: { type: Number, default: 2 },
  delaySecondsBetweenListings: { type: Number, default: 5 },
  currentBatchIndex: { type: Number, default: 0 },
  nextRunAt: { type: Date, default: null },
  results: { type: [directListJobResultSchema], default: [] },
  successfulCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true });

directListJobSchema.index({ status: 1, scheduledAt: 1 });
directListJobSchema.index({ status: 1, nextRunAt: 1 });
directListJobSchema.index({ sellerId: 1, createdAt: -1 });

export const DIRECT_LIST_JOB_MAX_ASINS = 1000;
export const DIRECT_LIST_JOB_DEFAULT_BATCH_SIZE = 25;
export const DIRECT_LIST_JOB_DEFAULT_DELAY_MINUTES = 2;
export const DIRECT_LIST_JOB_DEFAULT_DELAY_SECONDS = 5;
export const DIRECT_LIST_JOB_MIN_DELAY_SECONDS = 3;
export const DIRECT_LIST_JOB_MAX_DELAY_SECONDS = 60;

export default mongoose.model('DirectListJob', directListJobSchema);
