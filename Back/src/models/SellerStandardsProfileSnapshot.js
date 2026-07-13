import mongoose from 'mongoose';

const SellerStandardsProfileSnapshotSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true, unique: true },
    report: { type: mongoose.Schema.Types.Mixed, required: true },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('SellerStandardsProfileSnapshot', SellerStandardsProfileSnapshotSchema);
