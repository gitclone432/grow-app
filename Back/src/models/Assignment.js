// models/Assignment.js
import mongoose from 'mongoose';

const AssignmentSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    lister: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quantity: { type: Number, required: true, min: 1 },
    listingPlatform: { type: mongoose.Schema.Types.ObjectId, ref: 'Platform', required: true },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    marketplace: { type: String, enum: ['EBAY_US', 'EBAY_AUS', 'EBAY_CANADA'], required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // listing admin who shared
    notes: { type: String, default: '' }, // notes from listing admin to lister

    // ✅ Scheduled date - when the task should appear to lister
    scheduledDate: { 
      type: Date, 
      required: true,
      default: function() {
        return this.createdAt || new Date();
      }
    },

    // ✅ Completion tracking
    completedQuantity: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date, default: null },
    
    // Range quantity distribution
    rangeQuantities: [{
      range: { type: mongoose.Schema.Types.ObjectId, ref: 'Range', required: true },
      quantity: { type: Number, required: true, min: 0 }
    }],
  },
  { timestamps: true }
);

export default mongoose.model('Assignment', AssignmentSchema);
