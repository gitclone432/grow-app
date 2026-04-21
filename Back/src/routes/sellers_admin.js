import { Router } from 'express';
import { requireAuth, requirePageAccess, requireRole } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';

const router = Router();

// List all sellers (for admin dashboard)
router.get('/all', requireAuth, requirePageAccess('SelectSeller'), async (req, res) => {
  const sellers = await Seller.find().populate('user', 'username email');
  res.json(sellers);
});

export default router;
