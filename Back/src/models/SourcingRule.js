import mongoose from 'mongoose';

/**
 * One row per (template, seller) automated ASIN sourcing config.
 * The cron job (see scheduledJobs.js -> asinSourcingAutomation) runs every
 * enabled rule on a shared cadence: search Amazon for `searchKeyword` within
 * `priceMin`/`priceMax`, precheck-enrich the results, apply `filters` (the
 * same "universal" thresholds used on the manual ASIN Precheck page), and
 * save up to `targetAsinCount` qualifying (inactive) ASINs as an
 * AsinSourcingBatch ready to be opened in the Template Listings Lab.
 */
const SourcingRuleSchema = new mongoose.Schema(
  {
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ListingTemplate',
      required: true,
      index: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Seller',
      required: true,
      index: true,
    },
    searchKeyword: {
      type: String,
      required: true,
      trim: true,
    },
    priceMin: {
      type: Number,
      default: null,
    },
    priceMax: {
      type: Number,
      default: null,
    },
    region: {
      type: String,
      enum: ['US', 'UK', 'CA', 'AU'],
      default: 'US',
    },
    targetAsinCount: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },
    // Mirrors the hardcoded PRECHECK_HANDOFF_FILTERS used by the manual
    // ASIN Sourcing -> Precheck handoff (Front/src/pages/admin/AsinSourcingPage.jsx).
    filters: {
      minRating: { type: Number, default: 3.5 },
      deliveryWithinDays: { type: Number, default: 8 },
      stock: { type: String, enum: ['all', 'in_stock', 'out_of_stock'], default: 'in_stock' },
      active: { type: String, enum: ['all', 'active', 'inactive'], default: 'inactive' },
      // ASINs whose title contains any of these (case-insensitive) are
      // skipped entirely — the run keeps searching further pages until
      // targetAsinCount is still met by non-excluded ASINs.
      excludeKeywords: { type: [String], default: [] },
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    // Identity used to act as the automation when it calls the internal
    // bulk-preview/bulk-save APIs (see lib/asinSourcingAutomation.js) — set
    // from req.user.userId when the rule is created, never overwritten.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Opt-in: after collecting a batch, also generate + save the listings
    // as Active (no human review) instead of stopping at a ready batch.
    autoGenerateAndSave: {
      type: Boolean,
      default: false,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    lastRunStatus: {
      type: String,
      enum: ['success', 'partial', 'error', null],
      default: null,
    },
    lastRunSummary: {
      type: String,
      default: '',
    },
    lastRunAsinCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

SourcingRuleSchema.index({ template: 1, seller: 1 });

export default mongoose.model('SourcingRule', SourcingRuleSchema);
