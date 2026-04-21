import mongoose from 'mongoose';

const ColumnPresetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    page: { type: String, default: 'dashboard', index: true },
    columns: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Compound unique index on name + page
ColumnPresetSchema.index({ name: 1, page: 1 }, { unique: true });

export default mongoose.model('ColumnPreset', ColumnPresetSchema);
