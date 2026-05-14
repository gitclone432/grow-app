import User from '../models/User.js';
import Seller from '../models/Seller.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';

/**
 * Same seller list as GET /api/sellers/all so Store Listings and the store
 * dropdown stay aligned (superadmin vs assignments vs fallback).
 */
export async function getSellersMatchingAllRoute(req) {
  const activeUsers = await User.find({ active: true }).select('_id').lean();
  const activeUserIds = activeUsers.map((u) => u._id);
  const baseFilter = { user: { $in: activeUserIds }, isStoreActive: { $ne: false } };

  if (req.user?.role === 'superadmin') {
    return Seller.find(baseFilter).select('_id user').populate('user', 'username').lean();
  }

  const assignments = await UserSellerAssignment.find({ user: req.user.userId }).select('seller').lean();
  const assignedSellerIds = assignments.map((a) => a.seller);

  if (assignedSellerIds.length === 0) {
    return Seller.find(baseFilter).select('_id user').populate('user', 'username').lean();
  }

  return Seller.find({
    _id: { $in: assignedSellerIds },
    ...baseFilter,
  }).select('_id user').populate('user', 'username').lean();
}
