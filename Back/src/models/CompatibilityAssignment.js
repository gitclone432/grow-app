// models/CompatibilityAssignment.js
import mongoose from 'mongoose';

const CompatibilityAssignmentSchema = new mongoose.Schema(
  {
    sourceAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    editor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    quantity: { type: Number, required: true, min: 1 },

    // completion tracking
    completedQuantity: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date, default: null },

    // Assigned range quantities (from admin, never changes)
    assignedRangeQuantities: [
      {
        range: { type: mongoose.Schema.Types.ObjectId, ref: 'Range', required: true },
        quantity: { type: Number, required: true, min: 0 },
      },
    ],

    // Completed range quantities (what editor fills, changes as work progresses)
    completedRangeQuantities: [
      {
        range: { type: mongoose.Schema.Types.ObjectId, ref: 'Range', required: true },
        quantity: { type: Number, required: true, min: 0 },
      },
    ],

    notes: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model('CompatibilityAssignment', CompatibilityAssignmentSchema);
