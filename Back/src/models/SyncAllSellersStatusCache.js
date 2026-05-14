import mongoose from 'mongoose';

/** Last-known sync-all job status for cross-instance reads (e.g. GET /ebay/sync-all-sellers-status). */
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'sync_all_sellers_status_cache', versionKey: false }
);

export default mongoose.models.SyncAllSellersStatusCache
  || mongoose.model('SyncAllSellersStatusCache', schema);
