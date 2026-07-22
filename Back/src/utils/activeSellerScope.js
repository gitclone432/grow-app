import mongoose from 'mongoose';
import User from '../models/User.js';
import Seller from '../models/Seller.js';

const ACTIVE_SCOPE_CACHE_MS = 60 * 1000;

let activeUserIdsCache = { at: 0, value: null };
let activeSellerIdsCache = { at: 0, value: null };

function cacheFresh(entry) {
  return entry.value != null && Date.now() - entry.at < ACTIVE_SCOPE_CACHE_MS;
}

/** Clear caches after seller/user activation changes so lists stay correct. */
export function invalidateActiveSellerScopeCache() {
  activeUserIdsCache = { at: 0, value: null };
  activeSellerIdsCache = { at: 0, value: null };
}

/**
 * Users treated as active for order visibility.
 * Legacy rows without `active` are included (local DBs often omit the field).
 */
export async function getActiveUserIds() {
  if (cacheFresh(activeUserIdsCache)) return activeUserIdsCache.value;

  const ids = await User.find({
    $or: [
      { active: true },
      { active: { $exists: false } },
      { active: null },
    ],
  }).distinct('_id');

  activeUserIdsCache = { at: Date.now(), value: ids };
  return ids;
}

/**
 * Sellers whose orders appear on fulfillment / stored-orders views.
 */
export async function getActiveSellerIds() {
  if (cacheFresh(activeSellerIdsCache)) return activeSellerIdsCache.value;

  const activeUserIds = await getActiveUserIds();
  const ids = await Seller.find({
    isStoreActive: { $ne: false },
    $or: activeUserIds.length
      ? [
        { user: { $in: activeUserIds } },
        { user: { $exists: false } },
        { user: null },
      ]
      : [
        { user: { $exists: false } },
        { user: null },
      ],
  }).distinct('_id');

  activeSellerIdsCache = { at: Date.now(), value: ids };
  return ids;
}

export async function applyActiveSellerScope(query, requestedSellerId) {
  const activeSellerIds = await getActiveSellerIds();
  if (activeSellerIds.length === 0) {
    query.seller = { $in: [] };
    return { activeSellerIds, activeSellerCount: 0 };
  }

  if (requestedSellerId) {
    if (!mongoose.Types.ObjectId.isValid(requestedSellerId)) {
      query.seller = { $in: [] };
      return { activeSellerIds, activeSellerCount: activeSellerIds.length };
    }
    const requestedObjectId = new mongoose.Types.ObjectId(requestedSellerId);
    const isAllowed = activeSellerIds.some((id) => id.equals(requestedObjectId));
    query.seller = isAllowed ? requestedObjectId : { $in: [] };
    return { activeSellerIds, activeSellerCount: activeSellerIds.length };
  }

  query.$and = query.$and || [];
  query.$and.push({ seller: { $in: activeSellerIds } });
  return { activeSellerIds, activeSellerCount: activeSellerIds.length };
}
