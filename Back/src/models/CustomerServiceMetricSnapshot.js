import mongoose from 'mongoose';

const CustomerServiceMetricSnapshotSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
    marketplace: { type: String, required: true },
    metricType: { type: String, required: true },
    evaluationType: { type: String, required: true },
    report: { type: mongoose.Schema.Types.Mixed, required: true },
    evaluationDate: { type: String, default: null },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

CustomerServiceMetricSnapshotSchema.index(
  { seller: 1, marketplace: 1, metricType: 1, evaluationType: 1 },
  { unique: true }
);

export default mongoose.model('CustomerServiceMetricSnapshot', CustomerServiceMetricSnapshotSchema);
