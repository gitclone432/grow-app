import mongoose from 'mongoose';

const cashflowEntrySchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    marketplace: { type: String, default: 'EBAY_US' }, // EBAY_US, EBAY_GB, EBAY_AU, EBAY_CA
    date: { type: Date, required: true }, // Date for this entry
    gross: { type: Number, default: 0 }, // Gross (Total Sales)
    taxesAndFees: { type: Number, default: 0 }, // Taxes & Fees
    sellingCosts: { type: Number, default: 0 }, // Selling costs
    net: { type: Number, default: 0 }, // Net (Net sales)
    notes: { type: String }, // Optional notes
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Index for fast lookups
cashflowEntrySchema.index({ seller: 1, date: 1, marketplace: 1 });

export default mongoose.model('CashflowEntry', cashflowEntrySchema);
