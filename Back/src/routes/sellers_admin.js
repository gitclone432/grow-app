import { Router } from 'express';
import { requireAuth, requirePageAccess, requireRole } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';

const router = Router();

// List all sellers (for admin dashboard)
router.get('/all', requireAuth, requirePageAccess('SelectSeller'), async (req, res) => {
  const activeUserIds = (await User.find({ active: true }).select('_id').lean()).map(u => u._id);
  const sellers = await Seller.find({ user: { $in: activeUserIds }, isStoreActive: { $ne: false } }).populate('user', 'username email active');
  res.json(sellers);
});

export default router;
