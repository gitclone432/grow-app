import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { sellerUploadLimitSchema, sellerUploadLimitCheckQuerySchema } from '../schemas/index.js';
import SellerUploadLimit from '../models/SellerUploadLimit.js';
import Seller from '../models/Seller.js';
import { checkUploadLimit } from '../lib/ebayFeedUpload.js';

const router = express.Router();

// ─── GET /seller-upload-limits ───────────────────────────────────────────────
// Returns all configured limits with live currentCount and isBlocked status.
router.get('/', requireAuth, requirePageAccess('SellerUploadLimits'), async (req, res) => {
    try {
        const limits = await SellerUploadLimit.find()
            .populate({ path: 'seller', populate: { path: 'user', select: 'username email' } })
            .sort({ createdAt: -1 });

        const limitsWithCounts = await Promise.all(limits.map(async (limit) => {
            const { isBlocked, currentCount } = await checkUploadLimit(
                limit.seller._id.toString(),
                limit.country
            );
            return {
                ...limit.toObject(),
                sellerName: limit.seller?.user?.username || limit.seller?.user?.email || 'Unknown',
                currentCount,
                isBlocked
            };
        }));

        return res.json(limitsWithCounts);
    } catch (err) {
        console.error('[SellerUploadLimits] GET / error:', err);
        return res.status(500).json({ error: 'Failed to fetch upload limits' });
    }
});

// ─── GET /seller-upload-limits/check ─────────────────────────────────────────
// Lightweight check used by Feed Upload (and similar) UIs.
// Query params: sellerId, country
router.get('/check', requireAuth, validate(sellerUploadLimitCheckQuerySchema, 'query'), async (req, res) => {
    const { sellerId, country } = req.query;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
        return res.status(400).json({ error: 'Invalid sellerId' });
    }
    try {
        const result = await checkUploadLimit(sellerId, country);
        return res.json(result);
    } catch (err) {
        console.error('[SellerUploadLimits] GET /check error:', err);
        return res.status(500).json({ error: 'Failed to check upload limit' });
    }
});

// ─── POST /seller-upload-limits ──────────────────────────────────────────────
// Creates or updates a daily limit for a seller+country pair (upsert).
router.post('/', requireAuth, requirePageAccess('SellerUploadLimits'), validate(sellerUploadLimitSchema), async (req, res) => {
    const { sellerId, country, limit } = req.body;

    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
        return res.status(400).json({ error: 'Invalid sellerId' });
    }

    const sellerExists = await Seller.exists({ _id: sellerId });
    if (!sellerExists) return res.status(404).json({ error: 'Seller not found' });

    try {
        const record = await SellerUploadLimit.findOneAndUpdate(
            { seller: sellerId, country },
            { seller: sellerId, country, limit },
            { upsert: true, new: true, runValidators: true }
        );
        return res.status(200).json(record);
    } catch (err) {
        console.error('[SellerUploadLimits] POST / error:', err);
        return res.status(500).json({ error: 'Failed to save upload limit' });
    }
});

// ─── DELETE /seller-upload-limits/:id ────────────────────────────────────────
router.delete('/:id', requireAuth, requirePageAccess('SellerUploadLimits'), async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid id' });
    }
    try {
        const deleted = await SellerUploadLimit.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'Limit not found' });
        return res.json({ success: true });
    } catch (err) {
        console.error('[SellerUploadLimits] DELETE /:id error:', err);
        return res.status(500).json({ error: 'Failed to delete upload limit' });
    }
});

export default router;
