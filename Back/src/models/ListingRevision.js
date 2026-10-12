import mongoose from 'mongoose';

// The eBay-side state of a listing at one moment — what was actually live,
// which is not necessarily what templatelistings said was live (someone may
// have edited the listing on eBay directly).
const snapshotSchema = new mongoose.Schema(
  {
    sku: { type: String, default: '' },
    title: { type: String, default: '' },
    price: { type: Number, default: null },
    currency: { type: String, default: '' },
    description: { type: String, default: '' },
    images: { type: [String], default: [] },
    itemSpecifics: {
      type: [{ name: String, value: String }],
      default: []
    },
    categoryId: { type: String, default: '' },
    categoryName: { type: String, default: '' }
  },
  { _id: false }
);

/**
 * One ASIN swap applied to a live eBay listing from the Amazon Stock Check page.
 *
 * `before` is written BEFORE the ReviseFixedPriceItem call, never after, so a
 * crash between the eBay write and the bookkeeping still leaves a row the
 * listing can be restored from — the same ordering ListingOverlayItem uses, for
 * the same reason.
 *
 * This is also the only record tying the two TemplateListing rows together.
 * templatelistings deliberately stores no item-id relation (the whole system is
 * keyed on SKU), so "old row -> new row -> which eBay item" lives here alone.
 */
const listingRevisionSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, index: true },
    itemId: { type: String, required: true, index: true },

    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ListingTemplate', default: null },

    previousAsin: { type: String, default: '' },
    previousSku: { type: String, default: '' },
    // The row that described this listing before the swap. Left completely
    // untouched by the revise — it is history, not a record to be edited.
    previousListing: { type: mongoose.Schema.Types.ObjectId, ref: 'TemplateListing', default: null },

    newAsin: { type: String, required: true, index: true },
    newSku: { type: String, default: '' },
    // Set only after the eBay call succeeds and the row is inserted.
    newListing: { type: mongoose.Schema.Types.ObjectId, ref: 'TemplateListing', default: null },

    before: { type: snapshotSchema, default: () => ({}) },
    after: { type: snapshotSchema, default: () => ({}) },

    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
      index: true
    },
    // eBay accepted the revise but the follow-up bookkeeping failed. The
    // listing is live with the new content and needs manual reconciliation —
    // distinct from 'failed', where eBay rejected and nothing changed.
    bookkeepingError: { type: String, default: '' },
    error: { type: String, default: '' },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    appliedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Revision history for one listing, newest first — the verify panel's read.
listingRevisionSchema.index({ itemId: 1, createdAt: -1 });
listingRevisionSchema.index({ createdAt: -1 });

export default mongoose.model('ListingRevision', listingRevisionSchema);
