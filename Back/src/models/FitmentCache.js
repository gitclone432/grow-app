import mongoose from 'mongoose';

export const CACHE_TTL_LONG_MS = 60 * 24 * 60 * 60 * 1000;  // 60 days — Make, Model, Year
export const CACHE_TTL_SHORT_MS = 10 * 24 * 60 * 60 * 1000;  // 10 days — Trim, Engine

const FitmentCacheSchema = new mongoose.Schema({
  // Unique Key to identify the list (e.g., "MAKES" or "MODELS_Ford" or "YEARS_Ford_F-150")
  cacheKey: { type: String, required: true, unique: true, index: true },
  
  // The actual list of values (e.g., ["Ford", "BMW", ...])
  values: [{ type: String }],
  
  lastUpdated: { type: Date, default: Date.now },

  // TTL: MongoDB will auto-delete this document after expireAt
  expireAt: { type: Date, default: () => new Date(Date.now() + CACHE_TTL_SHORT_MS) }
});

// MongoDB TTL index — deletes docs when current time >= expireAt
FitmentCacheSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

const FitmentCache = mongoose.model('FitmentCache', FitmentCacheSchema);

// One-time migration: backfill expireAt for old documents that don't have it.
// Make/Model/Year keys get 30-day TTL from lastUpdated; Trim/Engine get 7-day.
FitmentCache.updateMany(
  { expireAt: { $exists: false } },
  [{
    $set: {
      expireAt: {
        $cond: {
          if: {
            $or: [
              { $regexMatch: { input: '$cacheKey', regex: /^Make_/ } },
              { $regexMatch: { input: '$cacheKey', regex: /^Model_/ } },
              { $regexMatch: { input: '$cacheKey', regex: /^Year_/ } }
            ]
          },
          then: { $add: ['$lastUpdated', CACHE_TTL_LONG_MS] },
          else: { $add: ['$lastUpdated', CACHE_TTL_SHORT_MS] }
        }
      }
    }
  }]
).then(result => {
  if (result.modifiedCount > 0) {
    console.log(`[FitmentCache] Backfilled expireAt on ${result.modifiedCount} legacy documents`);
  }
}).catch(err => {
  console.error('[FitmentCache] Migration error:', err.message);
});

export default FitmentCache;