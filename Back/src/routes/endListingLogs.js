import express from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth.js';
import EndListingLog from '../models/EndListingLog.js';
import { validate } from '../utils/validate.js';
import { endListingStatsQuerySchema } from '../schemas/index.js';

const router = express.Router();
const PT_TIMEZONE = 'America/Los_Angeles';

function getPTDayBoundsUTC(dateStr) {
  function findMidnightUTC(ds) {
    const pdt = new Date(`${ds}T07:00:00.000Z`);
    const ptStr = new Intl.DateTimeFormat('en-CA', { timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(pdt);
    const ptHour = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: PT_TIMEZONE, hour: 'numeric', hour12: false, hourCycle: 'h23' }).format(pdt), 10);
    if (ptStr === ds && ptHour === 0) return pdt;
    return new Date(`${ds}T08:00:00.000Z`);
  }

  const start = findMidnightUTC(dateStr);
  const tmp = new Date(`${dateStr}T12:00:00.000Z`);
  tmp.setUTCDate(tmp.getUTCDate() + 1);
  const nextDateStr = tmp.toISOString().split('T')[0];
  const end = new Date(findMidnightUTC(nextDateStr).getTime() - 1);
  return { start, end };
}

/**
 * GET /end-listing-logs/stats
 * Returns per-seller end-listing counts grouped by source (duplicate_sku / expiry_listing)
 * and country,
 * optionally filtered by sellerId and date range.
 *
 * Query params:
 *   sellerId   - optional, filter to one seller
 *   startDate  - optional, YYYY-MM-DD (Pacific time)
 *   endDate    - optional, YYYY-MM-DD (Pacific time)
 */
router.get('/stats', requireAuth, validate(endListingStatsQuerySchema, 'query'), async (req, res) => {
  try {
    const { sellerId, startDate, endDate } = req.query;

    // This page reports only the duplicate-SKU / expiry sources; ends logged
    // from the stock-check verify flow are excluded so totals stay consistent.
    const matchCriteria = { source: { $in: ['duplicate_sku', 'expiry_listing'] } };

    if (sellerId) {
      if (!mongoose.Types.ObjectId.isValid(sellerId)) {
        return res.status(400).json({ error: 'Invalid sellerId' });
      }
      matchCriteria.seller = new mongoose.Types.ObjectId(sellerId);
    }

    if (startDate || endDate) {
      matchCriteria.endedAt = {};
      if (startDate) {
        matchCriteria.endedAt.$gte = getPTDayBoundsUTC(startDate).start;
      }
      if (endDate) {
        matchCriteria.endedAt.$lte = getPTDayBoundsUTC(endDate).end;
      }
    }

    const rows = await EndListingLog.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            seller: '$seller',
            source: '$source',
            country: { $ifNull: ['$country', 'Unknown'] },
          },
          count: { $sum: 1 },
        },
      },
      // Pivot sources into separate fields per seller
      {
        $group: {
          _id: '$_id.seller',
          sources: {
            $push: { source: '$_id.source', country: '$_id.country', count: '$count' },
          },
        },
      },
      {
        $lookup: {
          from: 'sellers',
          localField: '_id',
          foreignField: '_id',
          as: 'sellerInfo',
        },
      },
      { $unwind: { path: '$sellerInfo', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'users',
          localField: 'sellerInfo.user',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: { path: '$userInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          sellerId: '$_id',
          sellerName: '$userInfo.username',
          sources: 1,
        },
      },
      { $sort: { sellerName: 1 } },
    ]);

    // Flatten sources array into named fields
    const result = rows.map(row => {
      const duplicateSkuCount = row.sources
        .filter(s => s.source === 'duplicate_sku')
        .reduce((sum, s) => sum + (s.count || 0), 0);
      const expiryListingCount = row.sources
        .filter(s => s.source === 'expiry_listing')
        .reduce((sum, s) => sum + (s.count || 0), 0);
      const countryMap = new Map();

      for (const sourceRow of row.sources) {
        const country = sourceRow.country || 'Unknown';
        const existing = countryMap.get(country) || {
          country,
          duplicateSkuCount: 0,
          expiryListingCount: 0,
          total: 0,
        };
        if (sourceRow.source === 'duplicate_sku') {
          existing.duplicateSkuCount += sourceRow.count || 0;
        } else if (sourceRow.source === 'expiry_listing') {
          existing.expiryListingCount += sourceRow.count || 0;
        }
        existing.total += sourceRow.count || 0;
        countryMap.set(country, existing);
      }

      return {
        sellerId: row.sellerId,
        sellerName: row.sellerName || 'Unknown',
        duplicateSkuCount,
        expiryListingCount,
        total: duplicateSkuCount + expiryListingCount,
        countryBreakdown: Array.from(countryMap.values())
          .sort((a, b) => b.total - a.total || a.country.localeCompare(b.country)),
      };
    });

    res.json(result);
  } catch (error) {
    console.error('[EndListingLogs] Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch end-listing stats' });
  }
});

/**
 * GET /end-listing-logs/by-date
 * Amazon Stock Check end-listing activity grouped by day, then by seller and
 * who performed the action — answers "on which date, how many item IDs were
 * ended, for which sellers, and by whom".
 *
 * Query params:
 *   sellerId   - optional, filter to one seller
 *   startDate  - optional, YYYY-MM-DD (Pacific time)
 *   endDate    - optional, YYYY-MM-DD (Pacific time)
 */
router.get('/by-date', requireAuth, validate(endListingStatsQuerySchema, 'query'), async (req, res) => {
  try {
    const { sellerId, startDate, endDate, country } = req.query;

    const matchCriteria = { source: 'amazon_stock_check' };

    if (sellerId) {
      if (!mongoose.Types.ObjectId.isValid(sellerId)) {
        return res.status(400).json({ error: 'Invalid sellerId' });
      }
      matchCriteria.seller = new mongoose.Types.ObjectId(sellerId);
    }

    if (country) {
      matchCriteria.country = country;
    }

    if (startDate || endDate) {
      matchCriteria.endedAt = {};
      if (startDate) matchCriteria.endedAt.$gte = getPTDayBoundsUTC(startDate).start;
      if (endDate) matchCriteria.endedAt.$lte = getPTDayBoundsUTC(endDate).end;
    }

    const rows = await EndListingLog.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$endedAt', timezone: PT_TIMEZONE } },
            seller: '$seller',
            endedBy: '$endedBy',
            country: { $ifNull: ['$country', 'Unknown'] }
          },
          count: { $sum: 1 },
          itemIds: { $push: '$itemId' },
          lastEndedAt: { $max: '$endedAt' }
        }
      },
      {
        $lookup: { from: 'sellers', localField: '_id.seller', foreignField: '_id', as: 'sellerDoc' }
      },
      { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: 'users', localField: 'sellerDoc.user', foreignField: '_id', as: 'sellerUserDoc' }
      },
      { $unwind: { path: '$sellerUserDoc', preserveNullAndEmptyArrays: true } },
      {
        $lookup: { from: 'users', localField: '_id.endedBy', foreignField: '_id', as: 'endedByDoc' }
      },
      { $unwind: { path: '$endedByDoc', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          day: '$_id.day',
          sellerId: '$_id.seller',
          sellerName: { $ifNull: ['$sellerUserDoc.username', { $ifNull: ['$sellerUserDoc.email', { $toString: '$_id.seller' }] }] },
          endedById: '$_id.endedBy',
          endedByName: { $ifNull: ['$endedByDoc.username', { $ifNull: ['$endedByDoc.email', 'Unknown'] }] },
          country: '$_id.country',
          count: 1,
          itemIds: 1,
          lastEndedAt: 1
        }
      },
      { $sort: { lastEndedAt: -1 } }
    ]);

    const dayMap = new Map();
    for (const row of rows) {
      if (!dayMap.has(row.day)) {
        dayMap.set(row.day, { day: row.day, totalItemsEnded: 0, breakdown: [] });
      }
      const dayEntry = dayMap.get(row.day);
      dayEntry.totalItemsEnded += row.count;
      dayEntry.breakdown.push({
        sellerId: row.sellerId,
        sellerName: row.sellerName || 'Unknown',
        endedById: row.endedById,
        endedByName: row.endedByName || 'Unknown',
        country: row.country || 'Unknown',
        count: row.count,
        itemIds: row.itemIds
      });
    }

    for (const entry of dayMap.values()) {
      entry.breakdown.sort((a, b) => a.sellerName.localeCompare(b.sellerName) || a.endedByName.localeCompare(b.endedByName));
    }

    const days = Array.from(dayMap.values()).sort((a, b) => b.day.localeCompare(a.day));

    res.json({ days });
  } catch (error) {
    console.error('[EndListingLogs] Error fetching by-date stats:', error);
    res.status(500).json({ error: 'Failed to fetch end-listing breakdown' });
  }
});

export default router;
