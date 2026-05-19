import { Router } from 'express';
import { requireAuth, requirePageAccess, requireRole } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import { getSellersMatchingAllRoute } from '../utils/sellersAllScope.js';
import { getActiveUserIds } from '../utils/activeSellerScope.js';

const router = Router();

// List all sellers (for admin dashboard)
// superadmin + listingadmin: all active-user stores; others: assignments (or full list if none).
router.get('/all', requireAuth, async (req, res) => {
  try {
    const sellers = await getSellersMatchingAllRoute(req);
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
    const activeUserIds = await getActiveUserIds();
    const sellers = await Seller.find({
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
    }).populate('user', 'username email active');
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

// Admin edit seller/store details from Stores page
router.patch('/:id', requireAuth, requirePageAccess('StoresPage', ['superadmin', 'listingadmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, isStoreActive, ebayMarketplaces } = req.body || {};

    const seller = await Seller.findById(id).populate('user');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.user) return res.status(400).json({ error: 'Seller has no linked user' });

    // Username uniqueness check (if changed)
    if (typeof username === 'string' && username.trim() && username.trim() !== seller.user.username) {
      const taken = await User.findOne({ username: username.trim(), _id: { $ne: seller.user._id } }).lean();
      if (taken) return res.status(409).json({ error: 'Username already in use' });
      seller.user.username = username.trim();
    }

    // Email uniqueness check (if changed)
    if (typeof email === 'string') {
      const normalizedEmail = email.trim();
      if (normalizedEmail) {
        const taken = await User.findOne({ email: normalizedEmail, _id: { $ne: seller.user._id } }).lean();
        if (taken) return res.status(409).json({ error: 'Email already in use' });
        seller.user.email = normalizedEmail;
      } else {
        seller.user.email = undefined;
      }
    }

    if (typeof isStoreActive === 'boolean') {
      seller.isStoreActive = isStoreActive;
      if (isStoreActive) {
        seller.reconnectedAt = new Date();
        seller.disconnectedAt = null;
      } else {
        seller.disconnectedAt = new Date();
      }
    }

    if (Array.isArray(ebayMarketplaces)) {
      seller.ebayMarketplaces = ebayMarketplaces
        .map((m) => String(m || '').trim())
        .filter(Boolean);
    }

    await seller.user.save();
    await seller.save();

    const updated = await Seller.findById(id).populate('user', 'username email active');
    res.json(updated);
  } catch (err) {
    console.error('Error updating seller:', err);
    res.status(500).json({ error: 'Failed to update seller' });
  }
});

// Admin helper: get OAuth connect URL for renewing a specific seller token
router.get('/:id/renew-ebay-url', requireAuth, requirePageAccess('StoresPage', ['superadmin', 'listingadmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await Seller.findById(id).populate('user', '_id role');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });
    if (!seller.user?._id) return res.status(400).json({ error: 'Seller has no linked user' });

    const stateToken = jwt.sign(
      {
        userId: seller.user._id,
        role: seller.user.role || 'seller',
      },
      process.env.JWT_SECRET,
      { expiresIn: '20m' }
    );

    const encoded = encodeURIComponent(stateToken);
    res.json({ url: `/api/ebay/connect?token=${encoded}` });
  } catch (err) {
    console.error('Error creating renew URL:', err);
    res.status(500).json({ error: 'Failed to create renew URL' });
  }
});

// Admin delete (archive) seller/store
router.delete('/:id', requireAuth, requirePageAccess('StoresPage', ['superadmin', 'listingadmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const seller = await Seller.findById(id).populate('user');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    // Soft-delete/archive behavior to keep audit/history safe.
    seller.isStoreActive = false;
    seller.disconnectedAt = new Date();
    seller.ebayTokens = {};
    await seller.save();

    if (seller.user) {
      seller.user.active = false;
      await seller.user.save();
    }

    res.json({ success: true, message: 'Store archived successfully' });
  } catch (err) {
    console.error('Error deleting seller:', err);
    res.status(500).json({ error: 'Failed to delete store' });
  }
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