import Seller from '../models/Seller.js';
import mongoose from 'mongoose';
import { getSellersMatchingAllRoute } from './sellersAllScope.js';

const ORG_WIDE_SELLER_ROLES = new Set(['superadmin', 'listingadmin']);

/** Status values written by eBay sync and legacy rows. */
export const ACTIVE_LISTING_STATUS_VALUES = ['Active', 'ACTIVE', 'active'];

/**
 * Mongo match for rows that should appear on Store Listings.
 * eBay uses "Active"; some code paths used "ACTIVE".
 */
export function activeListingStatusFilter() {
  return {
    $or: [
      { listingStatus: { $in: ACTIVE_LISTING_STATUS_VALUES } },
      { listingStatus: { $exists: false } },
      { listingStatus: null },
      { listingStatus: '' },
    ],
  };
}

/**
 * Sellers visible on Store Listings. For superadmin/listingadmin, union in every
 * eBay-connected store so synced activelistings rows are not hidden when the
 * linked User is inactive or missing from assignment scope.
 */
export async function getSellersForStoreListings(req) {
  const scoped = await getSellersMatchingAllRoute(req);
  if (!ORG_WIDE_SELLER_ROLES.has(req.user?.role)) {
    return scoped;
  }

  const tokenConnected = await Seller.find({
    isStoreActive: { $ne: false },
    'ebayTokens.access_token': { $exists: true, $nin: [null, ''] },
  })
    .select('_id user')
    .populate('user', 'username email active')
    .lean();

  const byId = new Map(scoped.map((s) => [String(s._id), s]));
  for (const s of tokenConnected) {
    byId.set(String(s._id), s);
  }
  return [...byId.values()];
}

/** Match seller field stored as ObjectId or legacy string. */
export function sellerIdsInMatch(sellerIds) {
  const ids = Array.isArray(sellerIds) ? sellerIds : [sellerIds];
  return { $in: [...new Set(ids.flatMap((id) => [id, String(id)]))] };
}

/**
 * Mongo filter for Store Listings (ActiveListing). Uses $and so search $or
 * does not overwrite listingStatus $or.
 */
export function buildStoreListingsMatch({ sellerIds = [], sellerId = '', search = '' } = {}) {
  const clauses = [activeListingStatusFilter()];

  const sid = String(sellerId || '').trim();
  if (sid && mongoose.Types.ObjectId.isValid(sid)) {
    const oid = new mongoose.Types.ObjectId(sid);
    clauses.push({ seller: { $in: [oid, String(oid)] } });
  } else if (sellerIds.length) {
    clauses.push({ seller: sellerIdsInMatch(sellerIds) });
  }

  const q = String(search || '').trim();
  if (q) {
    const searchRegex = { $regex: q, $options: 'i' };
    clauses.push({
      $or: [{ title: searchRegex }, { sku: searchRegex }, { itemId: searchRegex }],
    });
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}
