import mongoose from 'mongoose';

/** Cached Finances-by-payout groups per seller (no eBay call on page load). */
const schema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    groups: { type: [mongoose.Schema.Types.Mixed], default: [] },
    details: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    cachedAt: { type: Date, default: null },
    cacheFromDate: { type: String, default: '' },
    cacheToDate: { type: String, default: '' },
    marketplace: { type: String, default: 'ALL' },
  },
  { collection: 'finances_payout_groups_cache', versionKey: false },
);

export default mongoose.models.FinancesPayoutGroupsCache
  || mongoose.model('FinancesPayoutGroupsCache', schema);
