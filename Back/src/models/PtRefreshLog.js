import mongoose from 'mongoose';

const PtRefreshLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    dateMode: { type: String, enum: ['single', 'range'], required: true },
    startDate: { type: String, required: true }, // Format: YYYY-MM-DD
    endDate: { type: String, required: true },   // Format: YYYY-MM-DD
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' }, // Optional filter by seller
    clickedRefreshAt: { type: Date, required: true },
    clickedConfirmAt: { type: Date, required: true },
    clickedRefreshAtIST: { type: String, required: true },
    clickedConfirmAtIST: { type: String, required: true },
    status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing', required: true },
    success: { type: Boolean, default: false },
    totalFetched: { type: Number, default: 0 },
    totalExistingMatched: { type: Number, default: 0 },
    totalUpdated: { type: Number, default: 0 },
    totalIgnoredNew: { type: Number, default: 0 },
    errorMessage: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { timestamps: true }
);

PtRefreshLogSchema.index({ createdAt: -1 });
PtRefreshLogSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('PtRefreshLog', PtRefreshLogSchema);
