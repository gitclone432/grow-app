import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess, requireRole } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import SellerSkuIndex from '../models/SellerSkuIndex.js';
import Order from '../models/Order.js';
import { getSellersMatchingAllRoute, getSellersForEbayApiPicker } from '../utils/sellersAllScope.js';
import { getActiveUserIds } from '../utils/activeSellerScope.js';
import {
  getSellerPermanentDeleteBlockers,
  permanentlyDeleteSeller,
} from '../utils/permanentSellerDelete.js';

const router = Router();

const currencyCountryLabels = {
  USD: 'United States',
  GBP: 'United Kingdom',
  GB: 'United Kingdom',
  AUD: 'Australia',
  CAD: 'Canada',
  EUR: 'Europe',
};

function formatCurrencyCountry(currency) {
  if (!currency) return 'Unknown';
  const normalized = String(currency).trim().toUpperCase();
  if (currencyCountryLabels[normalized]) return currencyCountryLabels[normalized];
  return normalized
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

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

// OAuth-connected stores for eBay API admin pages (marketing, finances, etc.)
router.get('/ebay-connected', requireAuth, async (req, res) => {
  try {
    const sellers = await getSellersForEbayApiPicker(req);
    res.json(sellers);
  } catch (err) {
    console.error('Error fetching eBay-connected sellers:', err);
    res.status(500).json({ error: 'Failed to fetch eBay-connected sellers' });
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

// Superadmin permanent delete (archived sellers only, no historical records)
router.delete('/:id/permanent', requireAuth, requireRole('superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { confirmUsername } = req.body || {};
    const seller = await Seller.findById(id).populate('user');
    if (!seller) return res.status(404).json({ error: 'Seller not found' });

    const expectedUsername = String(seller.user?.username || '').trim();
    if (!expectedUsername || String(confirmUsername || '').trim() !== expectedUsername) {
      return res.status(400).json({ error: 'confirmUsername must match the seller username exactly' });
    }

    const result = await permanentlyDeleteSeller(id);
    res.json({
      success: true,
      message: `Seller "${result.username}" permanently deleted`,
      ...result,
    });
  } catch (err) {
    if (err.status === 409) {
      return res.status(409).json({
        error: err.message,
        blockers: err.blockers || [],
      });
    }
    if (err.status === 400 || err.status === 404) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Error permanently deleting seller:', err);
    res.status(500).json({ error: 'Failed to permanently delete seller' });
  }
});

// Admin delete (archive) seller/store
router.delete('/:id', requireAuth, requirePageAccess(['StoresPage', 'AddSeller'], ['superadmin', 'listingadmin', 'hradmin', 'operationhead']), async (req, res) => {
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

// GET /sellers/sku-duplicates?sellerId=xxx&page=1&limit=25
router.get('/sku-duplicates', requireAuth, requirePageAccess('DuplicateSkus'), async (req, res) => {
  const { sellerId } = req.query;
  if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
    return res.status(400).json({ error: 'Valid sellerId query param is required.' });
  }
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const skip = (page - 1) * limit;
  try {
    const [facet] = await SellerSkuIndex.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId) } },
      {
        $group: {
          _id: '$sku',
          count: { $sum: 1 },
          itemIds: { $push: '$itemId' },
          titles: { $push: '$title' },
        },
      },
      { $match: { _id: { $ne: '' }, count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      {
        $facet: {
          total: [{ $count: 'n' }],
          data: [
            { $skip: skip },
            { $limit: limit },
            { $project: { _id: 0, sku: '$_id', count: 1, itemIds: 1, titles: 1 } },
          ],
        },
      },
    ]);

    const total = facet?.total?.[0]?.n ?? 0;
    const duplicates = facet?.data ?? [];

    const pageItemIds = duplicates.flatMap((d) => d.itemIds);
    const orderCounts = pageItemIds.length
      ? await Order.aggregate([
          { $match: { seller: new mongoose.Types.ObjectId(sellerId), itemNumber: { $in: pageItemIds } } },
          { $group: { _id: '$itemNumber', orderCount: { $sum: 1 } } },
        ])
      : [];
    const orderCountMap = Object.fromEntries(orderCounts.map((o) => [o._id, o.orderCount]));

    const duplicatesWithOrders = duplicates.map((d) => ({
      ...d,
      orderCounts: d.itemIds.map((id) => orderCountMap[id] ?? 0),
    }));

    res.json({
      duplicates: duplicatesWithOrders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    });
  } catch (err) {
    console.error('Error fetching SKU duplicates:', err);
    res.status(500).json({ error: 'Failed to fetch SKU duplicates.' });
  }
});

// GET /sellers/sku-duplicates-by-country
router.get('/sku-duplicates-by-country', requireAuth, requirePageAccess(['DuplicateSkus', 'SkuIndexDashboard']), async (req, res) => {
  try {
    const sellerSkuRows = await SellerSkuIndex.aggregate([
      { $match: { sku: { $nin: ['', null] } } },
      {
        $addFields: {
          normalizedCurrency: { $toUpper: { $ifNull: ['$currency', 'UNKNOWN'] } },
        },
      },
      {
        $group: {
          _id: { currency: '$normalizedCurrency', seller: '$seller', sku: '$sku' },
          listingCount: { $sum: 1 },
          sampleTitles: { $push: '$title' },
        },
      },
      {
        $lookup: {
          from: 'sellers',
          localField: '_id.seller',
          foreignField: '_id',
          as: 'sellerDoc',
        },
      },
      { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'sellerDoc.user',
          foreignField: '_id',
          as: 'userDoc',
        },
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          currency: '$_id.currency',
          sellerId: '$_id.seller',
          sellerName: {
            $ifNull: [
              '$userDoc.username',
              { $ifNull: ['$userDoc.email', { $toString: '$_id.seller' }] },
            ],
          },
          sku: '$_id.sku',
          listingCount: 1,
          extraCount: { $max: [{ $subtract: ['$listingCount', 1] }, 0] },
          sampleTitle: { $arrayElemAt: ['$sampleTitles', 0] },
        },
      },
    ]);

    const countryMap = new Map();
    for (const row of sellerSkuRows) {
      const country = formatCurrencyCountry(row.currency);
      if (!countryMap.has(country)) {
        countryMap.set(country, {
          country,
          currencies: new Set(),
          listingCount: 0,
          skus: new Map(),
          sellers: new Map(),
        });
      }

      const summary = countryMap.get(country);
      summary.currencies.add(row.currency || 'UNKNOWN');
      summary.listingCount += row.listingCount;

      const skuSummary = summary.skus.get(row.sku) || {
        sku: row.sku,
        listingCount: 0,
        sellers: new Set(),
        sampleTitle: row.sampleTitle || '',
      };
      skuSummary.listingCount += row.listingCount;
      skuSummary.sellers.add(String(row.sellerId || 'unknown'));
      if (!skuSummary.sampleTitle && row.sampleTitle) skuSummary.sampleTitle = row.sampleTitle;
      summary.skus.set(row.sku, skuSummary);

      const sellerKey = String(row.sellerId || row.sellerName || 'unknown');
      const sellerSummary = summary.sellers.get(sellerKey) || {
        sellerId: sellerKey,
        sellerName: row.sellerName || sellerKey,
        uniqueSkuCount: 0,
        listingCount: 0,
        duplicateSkuCount: 0,
        extraCount: 0,
      };
      sellerSummary.uniqueSkuCount += 1;
      sellerSummary.listingCount += row.listingCount;
      sellerSummary.extraCount += row.extraCount;
      if (row.extraCount > 0) sellerSummary.duplicateSkuCount += 1;
      summary.sellers.set(sellerKey, sellerSummary);
    }

    const countries = Array.from(countryMap.values())
      .map((country) => {
        const skuRows = Array.from(country.skus.values()).map((skuRow) => ({
          sku: skuRow.sku,
          listingCount: skuRow.listingCount,
          extraCount: Math.max(skuRow.listingCount - 1, 0),
          sellerCount: skuRow.sellers.size,
          sampleTitle: skuRow.sampleTitle || '',
        }));

        return {
          country: country.country,
          currencies: Array.from(country.currencies).sort(),
          uniqueSkuCount: skuRows.length,
          listingCount: country.listingCount,
          duplicateSkuCount: skuRows.filter((skuRow) => skuRow.extraCount > 0).length,
          extraCount: skuRows.reduce((sum, skuRow) => sum + skuRow.extraCount, 0),
          sellerBreakdown: Array.from(country.sellers.values())
            .sort((a, b) => b.extraCount - a.extraCount || b.listingCount - a.listingCount || a.sellerName.localeCompare(b.sellerName))
            .slice(0, 12),
          topDuplicates: skuRows
            .filter((skuRow) => skuRow.extraCount > 0)
            .sort((a, b) => b.extraCount - a.extraCount || b.listingCount - a.listingCount || a.sku.localeCompare(b.sku))
            .slice(0, 10),
        };
      })
      .sort((a, b) => b.extraCount - a.extraCount || b.uniqueSkuCount - a.uniqueSkuCount || a.country.localeCompare(b.country));

    const totals = countries.reduce(
      (acc, row) => {
        acc.uniqueSkuCount += row.uniqueSkuCount;
        acc.listingCount += row.listingCount;
        acc.duplicateSkuCount += row.duplicateSkuCount;
        acc.extraCount += row.extraCount;
        return acc;
      },
      { uniqueSkuCount: 0, listingCount: 0, duplicateSkuCount: 0, extraCount: 0 }
    );

    res.json({ countries, totals });
  } catch (err) {
    console.error('Error fetching SKU duplicate country summary:', err);
    res.status(500).json({ error: 'Failed to fetch SKU duplicate country summary.' });
  }
});

// GET /sellers/skus-in-multiple-currencies
router.get('/skus-in-multiple-currencies', requireAuth, requirePageAccess(['DuplicateSkus', 'SkuIndexDashboard']), async (req, res) => {
  try {
    const rows = await SellerSkuIndex.aggregate([
      { $match: { sku: { $nin: ['', null] } } },
      {
        $addFields: {
          normalizedCurrency: { $toUpper: { $ifNull: ['$currency', 'UNKNOWN'] } },
        },
      },
      {
        $group: {
          _id: { sku: '$sku', currency: '$normalizedCurrency' },
          listingCount: { $sum: 1 },
          sellers: { $addToSet: '$seller' },
          sampleTitles: { $push: '$title' },
        },
      },
      {
        $group: {
          _id: '$_id.sku',
          currencyCount: { $sum: 1 },
          totalListings: { $sum: '$listingCount' },
          currencyRows: {
            $push: {
              currency: '$_id.currency',
              country: '$_id.currency',
              listingCount: '$listingCount',
              sellerCount: { $size: '$sellers' },
              sampleTitle: { $arrayElemAt: ['$sampleTitles', 0] },
            },
          },
        },
      },
      { $match: { currencyCount: { $gt: 1 } } },
      { $sort: { currencyCount: -1, totalListings: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          sku: '$_id',
          currencyCount: 1,
          totalListings: 1,
          currencyRows: 1,
        },
      },
    ]);

    const data = rows.map((row) => ({
      ...row,
      currencyRows: row.currencyRows
        .map((currencyRow) => ({
          ...currencyRow,
          country: formatCurrencyCountry(currencyRow.currency),
        }))
        .sort((a, b) => b.listingCount - a.listingCount || a.currency.localeCompare(b.currency)),
    }));

    res.json({
      skus: data,
      total: data.length,
      extraCount: data.reduce((sum, row) => sum + Math.max((row.currencyCount || 0) - 1, 0), 0),
    });
  } catch (err) {
    console.error('Error fetching SKUs in multiple currencies:', err);
    res.status(500).json({ error: 'Failed to fetch SKUs in multiple currencies.' });
  }
});

export default router;