import Seller from '../models/Seller.js';
import mongoose from 'mongoose';
import { getSellersMatchingAllRoute } from './sellersAllScope.js';

const ORG_WIDE_SELLER_ROLES = new Set(['superadmin', 'listingadmin']);

/** Status values written by eBay sync and legacy rows. */
export const ACTIVE_LISTING_STATUS_VALUES = ['Active', 'ACTIVE', 'active'];

/** Ended / completed statuses from Trading API + our sync upserts. */
export const ENDED_LISTING_STATUS_VALUES = [
  'Ended',
  'ENDED',
  'ended',
  'Completed',
  'COMPLETED',
  'completed',
];

/**
 * Mongo match for rows that should appear on Store Listings (active).
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

/** Mongo match for ended/completed store listings. */
export function endedListingStatusFilter() {
  return { listingStatus: { $in: ENDED_LISTING_STATUS_VALUES } };
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
 * @param {'active'|'ended'} [listingStatusMode='active']
 */
export function buildStoreListingsMatch({
  sellerIds = [],
  sellerId = '',
  search = '',
  startDateFrom = '',
  startDateTo = '',
  listingStatusMode = 'active',
} = {}) {
  const clauses = [
    listingStatusMode === 'ended'
      ? endedListingStatusFilter()
      : activeListingStatusFilter(),
  ];

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

  // Date-only strings (YYYY-MM-DD) are interpreted as IST calendar days,
  // matching /ebay/listings and the admin UI timezone.
  const fromRaw = String(startDateFrom || '').trim();
  const toRaw = String(startDateTo || '').trim();
  const startTimeRange = {};
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromRaw)) {
    const from = new Date(`${fromRaw}T00:00:00+05:30`);
    if (!Number.isNaN(from.getTime())) startTimeRange.$gte = from;
  } else if (fromRaw) {
    const from = new Date(fromRaw);
    if (!Number.isNaN(from.getTime())) startTimeRange.$gte = from;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
    const to = new Date(`${toRaw}T23:59:59.999+05:30`);
    if (!Number.isNaN(to.getTime())) startTimeRange.$lte = to;
  } else if (toRaw) {
    const to = new Date(toRaw);
    if (!Number.isNaN(to.getTime())) startTimeRange.$lte = to;
  }
  if (Object.keys(startTimeRange).length) {
    clauses.push({ startTime: startTimeRange });
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}
