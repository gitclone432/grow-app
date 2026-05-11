import { Router } from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Seller from '../models/Seller.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = Router();

const EXCLUDED_CLIENT_USERNAME = 'Vergo';

async function getExcludedClientSellerIds() {
  const sellers = await Seller.find({})
    .populate('user', 'username')
    .select('_id user')
    .lean();
  return sellers
    .filter((s) => s.user?.username?.toLowerCase() === EXCLUDED_CLIENT_USERNAME.toLowerCase())
    .map((s) => s._id);
}

// sellerCostINR    = subtotal(USD) × 90
// sellerMarkupFee  = subtotal(USD) × 90 × 4%
// sellerIGST       = sellerMarkupFee × 18%
// profitFake       = pBalanceINR − sellerCostINR − sellerMarkupFee − sellerIGST
const COST_FACTOR = 90;
const MARKUP_FACTOR = 90 * 0.04;
const IGST_FACTOR = 90 * 0.04 * 0.18;

/**
 * GET /api/micro-orders
 *
 * Orders where 0.01 < subtotal < 3.00 with computed sellerCost, markup, IGST, profitFake.
 */
router.get('/', requireAuth, requirePageAccess('MicroOrders'), async (req, res) => {
  try {
    const {
      seller,
      dateMode = 'none',
      date,
      dateFrom,
      dateTo,
      excludeClient,
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const match = {
      subtotal: { $gt: 0.01, $lt: 3.0 },
    };

    if (seller) {
      if (!mongoose.Types.ObjectId.isValid(seller)) {
        return res.status(400).json({ error: 'Invalid seller id' });
      }
      match.seller = new mongoose.Types.ObjectId(seller);
    }

    if (excludeClient === 'true') {
      const excludedIds = await getExcludedClientSellerIds();
      if (excludedIds.length > 0) {
        if (match.seller) {
          if (excludedIds.some((id) => id.equals(match.seller))) {
            return res.json({
              orders: [],
              totalRecords: 0,
              totalPages: 0,
              currentPage: 1,
              totalCount: 0,
              totalProfitFake: 0,
            });
          }
        } else {
          match.seller = { $nin: excludedIds };
        }
      }
    }

    if (dateMode === 'single' && date) {
      const start = new Date(date);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setUTCHours(23, 59, 59, 999);
      match.dateSold = { $gte: start, $lte: end };
    } else if (dateMode === 'range' && dateFrom && dateTo) {
      const start = new Date(dateFrom);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(dateTo);
      end.setUTCHours(23, 59, 59, 999);
      match.dateSold = { $gte: start, $lte: end };
    }

    const pipeline = [
      { $match: match },
      {
        $lookup: {
          from: 'sellers',
          localField: 'seller',
          foreignField: '_id',
          as: '_sellerDoc',
        },
      },
      {
        $addFields: {
          _sellerUserId: { $arrayElemAt: ['$_sellerDoc.user', 0] },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_sellerUserId',
          foreignField: '_id',
          as: '_userDoc',
        },
      },
      {
        $addFields: {
          sellerName: { $arrayElemAt: ['$_userDoc.username', 0] },
          sellerCost: { $multiply: ['$subtotal', COST_FACTOR] },
          sellerMarkupFee: { $multiply: ['$subtotal', MARKUP_FACTOR] },
          sellerIGST: { $multiply: ['$subtotal', IGST_FACTOR] },
        },
      },
      {
        $addFields: {
          profitFake: {
            $subtract: [
              {
                $subtract: [
                  {
                    $subtract: [{ $ifNull: ['$pBalanceINR', 0] }, '$sellerCost'],
                  },
                  '$sellerMarkupFee',
                ],
              },
              '$sellerIGST',
            ],
          },
        },
      },
      {
        $facet: {
          metadata: [
            {
              $group: {
                _id: null,
                totalCount: { $sum: 1 },
                totalProfitFake: { $sum: '$profitFake' },
              },
            },
          ],
          data: [
            { $sort: { dateSold: -1 } },
            { $skip: skip },
            { $limit: limitNum },
            { $project: { _sellerDoc: 0, _sellerUserId: 0, _userDoc: 0 } },
          ],
        },
      },
    ];

    const [result] = await Order.aggregate(pipeline);
    const meta = result?.metadata?.[0] ?? { totalCount: 0, totalProfitFake: 0 };
    const orders = result?.data ?? [];

    return res.json({
      orders,
      totalRecords: meta.totalCount,
      totalPages: Math.ceil(meta.totalCount / limitNum) || 0,
      currentPage: pageNum,
      totalCount: meta.totalCount,
      totalProfitFake: meta.totalProfitFake,
    });
  } catch (err) {
    console.error('[micro-orders] GET error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
