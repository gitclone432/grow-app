import mongoose from 'mongoose';

/** Cached marketing API payloads for faster dashboard loads. */
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    expiresAt: { type: Date, required: true, index: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'marketing_view_cache', versionKey: false }
);

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.MarketingViewCache
  || mongoose.model('MarketingViewCache', schema);
