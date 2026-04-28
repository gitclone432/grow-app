import { Router } from 'express';
import { requireAuth, requirePageAccess, requireRole } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import UserSellerAssignment from '../models/UserSellerAssignment.js';

const router = Router();

async function getActiveUserIdsSet() {
  const users = await User.find({ active: true }).select('_id').lean();
  return users.map(u => u._id);
}

// List all sellers (for admin dashboard)
// Superadmin sees all; other users see only their assigned sellers
router.get('/all', requireAuth, async (req, res) => {
  try {
    const activeUserIds = await getActiveUserIdsSet();

    if (req.user.role === 'superadmin') {
      // Superadmin sees all sellers with an active linked user
      const sellers = await Seller.find({ user: { $in: activeUserIds }, isStoreActive: true }).populate('user', 'username email active');
      return res.json(sellers);
    }

    // For non-superadmin: get their seller assignments
    const assignments = await UserSellerAssignment.find({ user: req.user.userId }).select('seller').lean();
    const assignedSellerIds = assignments.map(a => a.seller);

    if (assignedSellerIds.length === 0) {
      // No assignments — return all sellers (backward compat for roles that had full access before)
      // This preserves existing behavior for users who haven't been explicitly assigned sellers
      const sellers = await Seller.find({ user: { $in: activeUserIds }, isStoreActive: true }).populate('user', 'username email active');
      return res.json(sellers);
    }

    // Filter to only assigned sellers
    const sellers = await Seller.find({
      _id: { $in: assignedSellerIds },
      user: { $in: activeUserIds },
      isStoreActive: true
    }).populate('user', 'username email active');
    res.json(sellers);
  } catch (err) {
    console.error('Error fetching sellers:', err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

// List all sellers without filtering (for Fulfillment Dashboard)
// All authenticated users can see all sellers
router.get('/all-unfiltered', requireAuth, async (req, res) => {
  try {
    const activeUserIds = await getActiveUserIdsSet();
    const sellers = await Seller.find({ user: { $in: activeUserIds }, isStoreActive: true }).populate('user', 'username email active');
    res.json(sellers);
  } catch (err) {
    console.error('Error fetching sellers:', err);
    res.status(500).json({ error: 'Failed to fetch sellers' });
  }
});

// Get current seller profile and eBay marketplaces
router.get('/me', requireAuth, requireRole('seller'), async (req, res) => {
  try {
    console.log('Fetching seller for user:', req.user);
    const seller = await Seller.findOne({ user: req.user.userId });
    if (!seller) {
      console.log('Seller not found for userId:', req.user.userId);
      return res.status(404).json({ error: 'Seller not found' });
    }
    console.log('Seller found:', seller);
    res.json(seller);
  } catch (error) {
    console.error('Error fetching seller profile:', error);
    res.status(500).json({ error: 'Failed to fetch seller profile' });
  }
});

// Add an eBay marketplace region (e.g., EBAY_US, EBAY_UK)
router.post('/marketplaces', requireAuth, requireRole('seller'), async (req, res) => {
  const { region } = req.body;
  if (!region) return res.status(400).json({ error: 'Marketplace region required' });
  const seller = await Seller.findOne({ user: req.user.userId });
  if (!seller) return res.status(404).json({ error: 'Seller not found' });
  if (seller.ebayMarketplaces.includes(region)) {
    return res.status(409).json({ error: 'Marketplace region already exists' });
  }
  seller.ebayMarketplaces.push(region);
  await seller.save();
  res.json(seller);
});

// Remove an eBay marketplace region
router.delete('/marketplaces/:region', requireAuth, requireRole('seller'), async (req, res) => {
  const { region } = req.params;
  const seller = await Seller.findOne({ user: req.user.userId });
  if (!seller) return res.status(404).json({ error: 'Seller not found' });
  seller.ebayMarketplaces = seller.ebayMarketplaces.filter(r => r !== region);
  await seller.save();
  res.json(seller);
});

// Disconnect eBay account (clear tokens) - allows re-authorization with new scopes
router.delete('/disconnect-ebay', requireAuth, requireRole('seller'), async (req, res) => {
  try {
    const seller = await Seller.findOne({ user: req.user.userId });
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    
    // Clear the eBay tokens
    seller.ebayTokens = {};
    seller.isStoreActive = false;
    seller.disconnectedAt = new Date();
    await seller.save();
    
    console.log(`eBay disconnected for seller ${seller._id}`);
    res.json({ message: 'eBay account disconnected successfully. You can now reconnect with updated permissions.' });
  } catch (error) {
    console.error('Error disconnecting eBay:', error);
    res.status(500).json({ error: 'Failed to disconnect eBay account' });
  }
});

export default router;