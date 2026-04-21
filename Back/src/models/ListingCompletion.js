// models/ListingCompletion.js
import mongoose from 'mongoose';

const ListingCompletionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    lister: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listingPlatform: { type: mongoose.Schema.Types.ObjectId, ref: 'Platform', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    marketplace: { type: String, enum: ['EBAY_US', 'EBAY_AUS', 'EBAY_CANADA'], required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory', required: true },
    
    // Range-level completions
    rangeCompletions: [{
      range: { type: mongoose.Schema.Types.ObjectId, ref: 'Range', required: true },
      quantity: { type: Number, required: true, min: 1 }
    }],
    
    totalQuantity: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

// Index for efficient querying
ListingCompletionSchema.index({ date: 1, listingPlatform: 1, store: 1, marketplace: 1 });
ListingCompletionSchema.index({ lister: 1, date: 1 });

export default mongoose.model('ListingCompletion', ListingCompletionSchema);
