import mongoose from 'mongoose';

/**
 * One execution attempt (manual "Run Now" or scheduled cron tick) of a
 * SourcingRule. Turns runSourcingRule from a request-scoped function call
 * into a durable, queryable job — so "is it still running?" and "what did
 * past runs do?" survive a page refresh and don't depend on which browser
 * tab triggered them. Processed by lib/sourcingRuleRunQueue.js, which caps
 * concurrent executions and drains queued runs as slots free up.
 */
const SourcingRuleRunSchema = new mongoose.Schema(
  {
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SourcingRule',
      required: true,
      index: true,
    },
    trigger: {
      type: String,
      enum: ['manual', 'cron'],
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'done', 'failed'],
      default: 'queued',
      index: true,
    },
    stage: {
      type: String,
      enum: [
        'collecting_asins',
        'prechecking_asins',
        'generating_listings',
        'saving_listings',
        'feed_uploading',
        'completed',
        null,
      ],
      default: null,
    },
    stageDetail: {
      type: String,
      default: '',
    },
    queuedAt: {
      type: Date,
      default: Date.now,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AsinSourcingBatch',
      default: null,
    },
    summary: {
      type: String,
      default: '',
    },
    error: {
      type: String,
      default: '',
    },
    foundCount: {
      type: Number,
      default: null,
    },
    targetCount: {
      type: Number,
      default: null,
    },
    shortfall: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

SourcingRuleRunSchema.index({ rule: 1, createdAt: -1 });
SourcingRuleRunSchema.index({ status: 1, queuedAt: 1 });

export default mongoose.model('SourcingRuleRun', SourcingRuleRunSchema);
