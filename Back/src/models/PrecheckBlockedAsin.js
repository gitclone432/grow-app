import mongoose from 'mongoose';

/**
 * One document per ASIN the precheck dropped for an excluded brand — the
 * durable record of what the end-of-run "excluded by brand" summary showed.
 * Answers "has this ASIN ever been excluded, and why?" and "how often does
 * brand X get hit?" after the summary is gone.
 *
 * Written fire-and-forget by the asin-precheck-stream route at the moment of
 * exclusion; a failed write never blocks the precheck itself.
 */
const PrecheckBlockedAsinSchema = new mongoose.Schema(
  {
    asin: { type: String, required: true, trim: true, uppercase: true },
    // The excluded-brands entry that matched, as it is written in that list.
    brand: { type: String, required: true, trim: true },
    // Which field the entry was found in. Rows from before the seller check
    // have no value and are brand matches (the default).
    matchedOn: { type: String, enum: ['brand', 'soldBy'], default: 'brand' },
    // What Amazon showed as the brand (detectedBrand). Differs from `brand`
    // when the field is longer than the entry ("Spigen Inc" vs "Spigen"), or
    // when the hit came from the seller instead. Rows written before matching
    // became brand-only may also differ because the hit came from the title
    // or description.
    amazonBrand: { type: String, default: '' },
    // The buy-box seller ("Sold by") at the time of the exclusion.
    amazonSoldBy: { type: String, default: '' },
    title: { type: String, default: '' },
    region: { type: String, enum: ['US', 'UK', 'CA', 'AU'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', default: null },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'ListingTemplate', default: null },
    // The batch this exclusion happened in.
    precheckLog: { type: mongoose.Schema.Types.ObjectId, ref: 'AsinPrecheckLog', default: null }
  },
  { timestamps: true }
);

PrecheckBlockedAsinSchema.index({ createdAt: -1 });
PrecheckBlockedAsinSchema.index({ asin: 1, createdAt: -1 });
PrecheckBlockedAsinSchema.index({ brand: 1, createdAt: -1 });

export default mongoose.model('PrecheckBlockedAsin', PrecheckBlockedAsinSchema);
