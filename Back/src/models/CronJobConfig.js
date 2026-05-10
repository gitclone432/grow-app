import mongoose from 'mongoose';

const CronJobConfigSchema = new mongoose.Schema(
  {
    jobKey: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    cronExpr: { type: String, required: true, trim: true },
    timezone: { type: String, default: '', trim: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CronJobConfigSchema.index({ jobKey: 1 });

export default mongoose.model('CronJobConfig', CronJobConfigSchema);
