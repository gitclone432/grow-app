import User from '../models/User.js';
import Seller from '../models/Seller.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';

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
  const activeUsers = await User.find({ active: true }).select('_id').lean();
  const activeUserIds = activeUsers.map((u) => u._id);
  const baseFilter = { user: { $in: activeUserIds }, isStoreActive: { $ne: false } };

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
