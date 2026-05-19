import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { getPTDayBoundsUTC } from '../utils/pacificDayBounds.js';

const router = express.Router();

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function buildNonCancelledMatch() {
  return {
    $and: [
      {
        $or: [
          { orderPaymentStatus: { $exists: false } },
          { orderPaymentStatus: null },
          { orderPaymentStatus: { $nin: ['FULLY_REFUNDED', 'PARTIALLY_REFUNDED'] } },
        ],
      },
      {
        $or: [
          { cancelState: { $exists: false } },
          { cancelState: null },
          { cancelState: { $nin: ['CANCELED', 'CANCELLED'] } },
        ],
      },
      {
        $or: [
          { 'cancelStatus.cancelState': { $exists: false } },
          { 'cancelStatus.cancelState': null },
          { 'cancelStatus.cancelState': { $nin: ['CANCELED', 'CANCELLED'] } },
        ],
      },
    ],
  };
}

function applyDateSoldFilter(match, query) {
  const dateOnly = String(query.date || '').trim();
  const from = String(query.from || '').trim();
  const to = String(query.to || '').trim();

  let start;
  let end;

  if (dateOnly) {
    ({ start, end } = getPTDayBoundsUTC(dateOnly));
  } else if (from || to) {
    if (from) start = getPTDayBoundsUTC(from).start;
    if (to) end = getPTDayBoundsUTC(to).end;
  } else {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    start = getPTDayBoundsUTC(monthStart).start;
    end = getPTDayBoundsUTC(monthEnd).end;
  }

  if (start || end) {
    match.dateSold = {};
    if (start) match.dateSold.$gte = start;
    if (end) match.dateSold.$lte = end;
  }
}

function applyOptionalFilters(match, query) {
  const sellerId = String(query.sellerId || '').trim();
  if (sellerId) {
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      const err = new Error('Invalid seller id');
      err.status = 400;
      throw err;
    }
    match.seller = new mongoose.Types.ObjectId(sellerId);
  }

  const marketplace = String(query.marketplace || '').trim();
  if (marketplace) {
    match.purchaseMarketplaceId = marketplace === 'EBAY_ENCA' ? 'EBAY_CA' : marketplace;
  }

  if (query.excludeMicro === 'true') {
    match.$and = match.$and || [];
    match.$and.push({
      $or: [{ subtotal: { $gte: 3 } }, { subtotalUSD: { $gte: 3 } }],
    });
  }
}

// GET /api/revenue — gross (orderEarnings) and net (after TDS/TID) totals
router.get('/', requireAuth, requirePageAccess('RevenueGrossNet'), async (req, res) => {
  try {
    const groupBy = String(req.query.groupBy || 'day').trim();
    if (!['day', 'week', 'month', 'none'].includes(groupBy)) {
      return res.status(400).json({ error: 'groupBy must be day, week, month, or none' });
    }

    const match = buildNonCancelledMatch();
    applyDateSoldFilter(match, req.query);
    applyOptionalFilters(match, req.query);

    const [totalsAgg, bySellerAgg, byPeriodAgg] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            orderCount: { $sum: 1 },
            grossRevenue: { $sum: { $ifNull: ['$orderEarnings', 0] } },
            totalTds: { $sum: { $ifNull: ['$tds', 0] } },
            totalTid: { $sum: { $ifNull: ['$tid', 0] } },
            netRevenue: { $sum: { $ifNull: ['$net', 0] } },
            totalPBalanceInr: { $sum: { $ifNull: ['$pBalanceINR', 0] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'sellers',
            localField: 'seller',
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
          $group: {
            _id: '$seller',
            sellerId: { $first: '$seller' },
            sellerLabel: {
              $first: {
                $ifNull: [
                  '$userDoc.username',
                  { $ifNull: ['$sellerDoc.sellerId', 'Unknown'] },
                ],
              },
            },
            orderCount: { $sum: 1 },
            grossRevenue: { $sum: { $ifNull: ['$orderEarnings', 0] } },
            totalTds: { $sum: { $ifNull: ['$tds', 0] } },
            totalTid: { $sum: { $ifNull: ['$tid', 0] } },
            netRevenue: { $sum: { $ifNull: ['$net', 0] } },
          },
        },
        { $sort: { grossRevenue: -1 } },
      ]),
      groupBy === 'none'
        ? Promise.resolve([])
        : Order.aggregate([
            { $match: match },
            {
              $group: {
                _id:
                  groupBy === 'day'
                    ? { $dateToString: { format: '%Y-%m-%d', date: '$dateSold', timezone: 'America/Los_Angeles' } }
                    : groupBy === 'week'
                      ? { $dateToString: { format: '%Y-W%V', date: '$dateSold', timezone: 'America/Los_Angeles' } }
                      : { $dateToString: { format: '%Y-%m', date: '$dateSold', timezone: 'America/Los_Angeles' } },
                orderCount: { $sum: 1 },
                grossRevenue: { $sum: { $ifNull: ['$orderEarnings', 0] } },
                totalTds: { $sum: { $ifNull: ['$tds', 0] } },
                totalTid: { $sum: { $ifNull: ['$tid', 0] } },
                netRevenue: { $sum: { $ifNull: ['$net', 0] } },
              },
            },
            { $sort: { _id: 1 } },
          ]),
    ]);

    const totals = totalsAgg[0] || {
      orderCount: 0,
      grossRevenue: 0,
      totalTds: 0,
      totalTid: 0,
      netRevenue: 0,
      totalPBalanceInr: 0,
    };

    res.json({
      summary: {
        orderCount: totals.orderCount || 0,
        grossRevenue: round2(totals.grossRevenue),
        totalTds: round2(totals.totalTds),
        totalTid: round2(totals.totalTid),
        netRevenue: round2(totals.netRevenue),
        totalPBalanceInr: round2(totals.totalPBalanceInr),
      },
      bySeller: bySellerAgg.map((row) => ({
        sellerId: row.sellerId,
        sellerLabel: row.sellerLabel || 'Unknown',
        orderCount: row.orderCount || 0,
        grossRevenue: round2(row.grossRevenue),
        totalTds: round2(row.totalTds),
        totalTid: round2(row.totalTid),
        netRevenue: round2(row.netRevenue),
      })),
      byPeriod: byPeriodAgg.map((row) => ({
        period: row._id,
        orderCount: row.orderCount || 0,
        grossRevenue: round2(row.grossRevenue),
        totalTds: round2(row.totalTds),
        totalTid: round2(row.totalTid),
        netRevenue: round2(row.netRevenue),
      })),
    });
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || 'Failed to load revenue' });
  }
});

export default router;
