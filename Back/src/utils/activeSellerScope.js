import mongoose from 'mongoose';
import User from '../models/User.js';
import Seller from '../models/Seller.js';

/**
 * Users treated as active for order visibility.
 * Legacy rows without `active` are included (local DBs often omit the field).
 */
export async function getActiveUserIds() {
  return User.find({
    $or: [
      { active: true },
      { active: { $exists: false } },
      { active: null },
    ],
  }).distinct('_id');
}

/**
 * Sellers whose orders appear on fulfillment / stored-orders views.
 */
export async function getActiveSellerIds() {
  const activeUserIds = await getActiveUserIds();
  return Seller.find({
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
