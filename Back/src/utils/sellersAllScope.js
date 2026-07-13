import Seller from '../models/Seller.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';
import { getActiveUserIds } from './activeSellerScope.js';

const ORG_WIDE_SELLER_ROLES = new Set(['superadmin', 'listingadmin']);

/** Display name for a store row (never use legacy/wrong sellerId fields). */
export function resolveStoreDisplayName(seller) {
    if (!seller) return 'Unknown store';
    const u = seller.user;
    if (u && typeof u === 'object') {
        const name = String(u.username || u.email || '').trim();
        if (name) return name;
    }
    if (seller._id) return `Store …${String(seller._id).slice(-6)}`;
    return 'Unknown store';
}

/**
 * Same seller list as GET /api/sellers/all so Store Listings and the store
 * dropdown stay aligned.
 *
 * - superadmin + listingadmin: all stores with an active linked user (ignore assignments).
 * - Everyone else: assigned sellers only, or full list if they have no assignments.
 */
export async function getSellersMatchingAllRoute(req) {
  const activeUserIds = await getActiveUserIds();
  const baseFilter = {
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
  };

  if (ORG_WIDE_SELLER_ROLES.has(req.user?.role)) {
    return Seller.find(baseFilter).select('_id user').populate('user', 'username email active').lean();
  }

  const assignments = await UserSellerAssignment.find({ user: req.user.userId }).select('seller').lean();
  const assignedSellerIds = assignments.map((a) => a.seller);

  if (assignedSellerIds.length === 0) {
    return Seller.find(baseFilter).select('_id user').populate('user', 'username email active').lean();
  }

  return Seller.find({
    _id: { $in: assignedSellerIds },
    ...baseFilter,
  })
    .select('_id user')
    .populate('user', 'username email active')
    .lean();
}

function sortSellersByName(sellers) {
  return [...sellers].sort((a, b) => {
    const nameA = String(a?.user?.username || a?.user?.email || a?._id || '').toLowerCase();
    const nameB = String(b?.user?.username || b?.user?.email || b?._id || '').toLowerCase();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });
}

/**
 * Seller picker for eBay API pages (marketing, finances, etc.).
 * Org-wide roles see every OAuth-connected store (including inactive-user stores).
 * Everyone else sees OAuth-connected stores within their assignment scope.
 */
export async function getSellersForEbayApiPicker(req) {
  const scoped = await getSellersMatchingAllRoute(req);
  const oauthConnected = await Seller.find({
    isStoreActive: { $ne: false },
    'ebayTokens.refresh_token': { $exists: true, $nin: [null, ''] },
  })
    .select('_id user')
    .populate('user', 'username email active')
    .lean();

  if (ORG_WIDE_SELLER_ROLES.has(req.user?.role)) {
    return sortSellersByName(oauthConnected);
  }

  const allowed = new Set(scoped.map((s) => String(s._id)));
  return sortSellersByName(oauthConnected.filter((s) => allowed.has(String(s._id))));
}
