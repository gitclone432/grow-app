import mongoose from 'mongoose';

/**
 * Output of one automated SourcingRule run: a ready-to-review set of ASINs
 * that already passed the Amazon search + precheck-enrichment + universal
 * filters + "select all inactive" logic. Consumed by the Template Listings
 * Lab page via ?fromSourcingBatch=<id>, mirroring the existing
 * asinPrecheckHandoff sessionStorage handoff used by the manual flow.
 */
const AsinSourcingBatchSchema = new mongoose.Schema(
  {
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SourcingRule',
      required: true,
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ListingTemplate',
      required: true,
      index: true,
    },
    region: {
      type: String,
      enum: ['US', 'UK', 'CA', 'AU'],
      default: 'US',
    },
    asins: {
      type: [String],
      default: [],
    },
    targetCount: {
      type: Number,
      required: true,
    },
    foundCount: {
      type: Number,
      required: true,
    },
    shortfall: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      // 'generated' = autoGenerateAndSave completed for this batch (see
      // lib/asinSourcingAutomation.js) — listings already exist, nothing
      // left to hand off to the Template Listings Lab.
      enum: ['ready', 'consumed', 'generated'],
      default: 'ready',
      index: true,
    },
    consumedAt: {
      type: Date,
      default: null,
    },
    // Populated only when the owning SourcingRule has autoGenerateAndSave on.
    generation: {
      attempted: { type: Boolean, default: false },
      previewSummary: {
        total: Number,
        successful: Number,
        failed: Number,
        warnings: Number,
      },
      saveSummary: {
        total: Number,
        created: Number,
        updated: Number,
        reactivated: Number,
        failed: Number,
        skipped: Number,
      },
      // Per-status counts from bulk-preview (success/warning/error/blocked),
      // for diagnosing why a run saved fewer than expected.
      statusBreakdown: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      skippedForWarnings: { type: Number, default: 0 },
      // Outcome of exporting the saved rows to CSV and uploading that CSV
      // through the eBay Feed API — see lib/ebayFeedUpload.js
      // (performFeedUpload) and the CSV Storage / Feed Upload admin pages,
      // which show the same taskId's live status.
      feedUpload: {
        exported: { type: Boolean, default: false },
        csvStorageId: { type: String, default: null },
        listingCount: { type: Number, default: 0 },
        taskId: { type: String, default: null },
        status: { type: String, default: '' },
        blockedByDailyLimit: { type: Boolean, default: false },
        error: { type: String, default: '' },
      },
      error: { type: String, default: '' },
      generatedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.model('AsinSourcingBatch', AsinSourcingBatchSchema);
