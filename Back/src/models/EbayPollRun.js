import mongoose from 'mongoose';

const EbayPollRunSchema = new mongoose.Schema(
  {
    jobType: {
      type: String,
      enum: ['poll-new-orders', 'poll-order-updates', 'buyer-chat-check-new'],
      required: true,
      index: true
    },
    source: {
      type: String,
      enum: ['manual', 'cron'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed', 'skipped'],
      default: 'running',
      index: true
    },
    startedAt: { type: Date, default: Date.now, index: true },
    completedAt: { type: Date, default: null },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    runnerId: { type: String, default: '' },
    totalPolled: { type: Number, default: 0 },
    totalNewOrders: { type: Number, default: 0 },
    totalUpdatedOrders: { type: Number, default: 0 },
    totalNewMessages: { type: Number, default: 0 },
    totalUpdatedMessages: { type: Number, default: 0 },
    results: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' }
  },
  { timestamps: true }
);

EbayPollRunSchema.index(
  { jobType: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'running' } }
);

export default mongoose.model('EbayPollRun', EbayPollRunSchema);
