import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import PriceChangeLog from '../models/PriceChangeLog.js';

const router = express.Router();

// GET /api/price-change-logs — Get price change history with filters
router.get('/', requireAuth, requirePageAccess('PriceChangeHistory'), async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      legacyItemId,
      orderId,
      userId,
      sellerId,
      startDate,
      endDate,
      successOnly,
      failedOnly
    } = req.query;

    const query = {};

    if (legacyItemId) query.legacyItemId = legacyItemId;
    if (orderId) query.orderId = orderId;
    if (userId) query.user = userId;
    if (sellerId) query.seller = sellerId;
    if (successOnly === 'true') query.success = true;
    if (failedOnly === 'true') query.success = false;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [logs, total] = await Promise.all([
      PriceChangeLog.find(query)
        .populate('user', 'username email')
        .populate('seller', 'user')
        .populate({
          path: 'seller',
          populate: { path: 'user', select: 'username' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      PriceChangeLog.countDocuments(query)
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('[Price Change Logs] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
