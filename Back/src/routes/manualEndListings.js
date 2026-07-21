import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import ManualEndListingAdjustment from '../models/ManualEndListingAdjustment.js';
import Seller from '../models/Seller.js';

const router = express.Router();

router.get('/feed/manual-end-listings', requireAuth, requirePageAccess('ManualEndListing'), async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const rows = await ManualEndListingAdjustment.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate({
        path: 'seller',
        select: 'user',
        populate: { path: 'user', select: 'username email' }
      })
      .populate('createdBy', 'username email')
      .lean();

    res.json(rows.map(row => ({
      id: row._id,
      pdtDate: row.pdtDate,
      sellerId: row.seller?._id,
      sellerName: row.seller?.user?.username || 'Unknown',
      country: row.country,
      quantity: row.quantity,
      note: row.note || '',
      createdBy: row.createdBy?.username || 'Unknown',
      createdAt: row.createdAt,
    })));
  } catch (err) {
    console.error('[Manual End Listing] History error:', err.message);
    res.status(500).json({ error: 'Failed to fetch manual end listing entries' });
  }
});

router.post('/feed/manual-end-listings', requireAuth, requirePageAccess('ManualEndListing'), async (req, res) => {
  try {
    const { pdtDate, sellerId, country, quantity, note } = req.body || {};

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(pdtDate || ''))) {
      return res.status(400).json({ error: 'Valid PDT date is required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ error: 'Valid seller is required.' });
    }
    const normalizedCountry = String(country || '').trim();
    if (!normalizedCountry) {
      return res.status(400).json({ error: 'Country is required.' });
    }
    const normalizedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive whole number.' });
    }

    const seller = await Seller.findById(sellerId).select('_id').lean();
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    const adjustment = await ManualEndListingAdjustment.create({
      pdtDate,
      seller: sellerId,
      country: normalizedCountry,
      quantity: normalizedQuantity,
      note: String(note || '').trim().slice(0, 500),
      createdBy: req.user?.userId || null,
    });

    res.status(201).json({
      id: adjustment._id,
      pdtDate: adjustment.pdtDate,
      sellerId: adjustment.seller,
      country: adjustment.country,
      quantity: adjustment.quantity,
      note: adjustment.note,
      createdAt: adjustment.createdAt,
    });
  } catch (err) {
    console.error('[Manual End Listing] Create error:', err.message);
    res.status(500).json({ error: 'Failed to save manual end listing entry' });
  }
});

router.put('/feed/manual-end-listings/:id', requireAuth, requirePageAccess('ManualEndListing'), async (req, res) => {
  try {
    const { id } = req.params;
    const { pdtDate, sellerId, country, quantity, note } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Valid entry is required.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(pdtDate || ''))) {
      return res.status(400).json({ error: 'Valid PDT date is required.' });
    }
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ error: 'Valid seller is required.' });
    }
    const normalizedCountry = String(country || '').trim();
    if (!normalizedCountry) {
      return res.status(400).json({ error: 'Country is required.' });
    }
    const normalizedQuantity = Number.parseInt(quantity, 10);
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive whole number.' });
    }

    const seller = await Seller.findById(sellerId).select('_id').lean();
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    const adjustment = await ManualEndListingAdjustment.findByIdAndUpdate(
      id,
      {
        pdtDate,
        seller: sellerId,
        country: normalizedCountry,
        quantity: normalizedQuantity,
        note: String(note || '').trim().slice(0, 500),
      },
      { new: true }
    ).lean();

    if (!adjustment) {
      return res.status(404).json({ error: 'Manual end listing entry not found.' });
    }

    res.json({
      id: adjustment._id,
      pdtDate: adjustment.pdtDate,
      sellerId: adjustment.seller,
      country: adjustment.country,
      quantity: adjustment.quantity,
      note: adjustment.note,
      updatedAt: adjustment.updatedAt,
    });
  } catch (err) {
    console.error('[Manual End Listing] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update manual end listing entry' });
  }
});

router.delete('/feed/manual-end-listings/:id', requireAuth, requirePageAccess('ManualEndListing'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Valid entry is required.' });
    }

    const adjustment = await ManualEndListingAdjustment.findByIdAndDelete(id).lean();
    if (!adjustment) {
      return res.status(404).json({ error: 'Manual end listing entry not found.' });
    }

    res.json({ success: true, id });
  } catch (err) {
    console.error('[Manual End Listing] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete manual end listing entry' });
  }
});

export default router;
