import mongoose from 'mongoose';

/** Distributed lease for "sync all sellers" so only one API instance runs the job at a time. */
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    leaseUntil: { type: Date },
    holder: { type: String, default: '' },
  },
  { collection: 'sync_all_sellers_lock', versionKey: false }
);

export default mongoose.models.SyncAllSellersLock
  || mongoose.model('SyncAllSellersLock', schema);
