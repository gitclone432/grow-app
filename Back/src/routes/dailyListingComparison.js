import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import FeedUpload from '../models/FeedUpload.js';
import EndListingLog from '../models/EndListingLog.js';
import ManualEndListingAdjustment from '../models/ManualEndListingAdjustment.js';
import { getPTDayBoundsUTC } from '../utils/pacificDayBounds.js';

const router = express.Router();

router.get('/feed/daily-listing-comparison', requireAuth, requirePageAccess('DailyListingComparison'), async (req, res) => {
  try {
    const defaultDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    const startDate = req.query.startDate || req.query.date || defaultDate;
    const endDate = req.query.endDate || req.query.date || startDate;
    const { start } = getPTDayBoundsUTC(startDate);
    const { end } = getPTDayBoundsUTC(endDate);

    const [feedRows, endRows, manualEndRows] = await Promise.all([
      FeedUpload.aggregate([
        {
          $match: {
            status: { $in: ['COMPLETED', 'COMPLETED_WITH_ERROR'] },
            'uploadSummary.successCount': { $gt: 0 },
            creationDate: { $gte: start, $lte: end }
          }
        },
        {
          $group: {
            _id: {
              seller: '$seller',
              country: { $ifNull: ['$country', 'US'] }
            },
            successfulListings: { $sum: '$uploadSummary.successCount' }
          }
        },
        {
          $lookup: {
            from: 'sellers',
            localField: '_id.seller',
            foreignField: '_id',
            as: 'sellerDoc'
          }
        },
        { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'sellerDoc.user',
            foreignField: '_id',
            as: 'userDoc'
          }
        },
        { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            sellerId: '$_id.seller',
            sellerName: { $ifNull: ['$userDoc.username', 'Unknown'] },
            country: '$_id.country',
            successfulListings: 1
          }
        }
      ]),
      EndListingLog.aggregate([
        { $match: { endedAt: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              seller: '$seller',
              country: { $ifNull: ['$country', 'Unknown'] }
            },
            endedListings: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'sellers',
            localField: '_id.seller',
            foreignField: '_id',
            as: 'sellerDoc'
          }
        },
        { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'sellerDoc.user',
            foreignField: '_id',
            as: 'userDoc'
          }
        },
        { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            sellerId: '$_id.seller',
            sellerName: { $ifNull: ['$userDoc.username', 'Unknown'] },
            country: '$_id.country',
            endedListings: 1
          }
        }
      ]),
      ManualEndListingAdjustment.aggregate([
        {
          $match: {
            pdtDate: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              seller: '$seller',
              country: '$country'
            },
            endedListings: { $sum: '$quantity' },
            manualEndedListings: { $sum: '$quantity' }
          }
        },
        {
          $lookup: {
            from: 'sellers',
            localField: '_id.seller',
            foreignField: '_id',
            as: 'sellerDoc'
          }
        },
        { $unwind: { path: '$sellerDoc', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'users',
            localField: 'sellerDoc.user',
            foreignField: '_id',
            as: 'userDoc'
          }
        },
        { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            sellerId: '$_id.seller',
            sellerName: { $ifNull: ['$userDoc.username', 'Unknown'] },
            country: '$_id.country',
            endedListings: 1,
            manualEndedListings: 1
          }
        }
      ])
    ]);

    const bySeller = new Map();
    for (const row of feedRows) {
      const key = String(row.sellerId || row.sellerName);
      const existing = bySeller.get(key) || {
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        successfulListings: 0,
        endedListings: 0,
        manualEndedListings: 0,
        marketplaces: []
      };
      const country = row.country || 'US';
      const successfulListings = row.successfulListings || 0;
      existing.successfulListings += successfulListings;
      const existingMarketplace = existing.marketplaces.find(m => m.country === country);
      if (existingMarketplace) {
        existingMarketplace.successfulListings += successfulListings;
      } else {
        existing.marketplaces.push({ country, successfulListings, endedListings: 0, manualEndedListings: 0 });
      }
      bySeller.set(key, existing);
    }

    for (const row of [...endRows, ...manualEndRows]) {
      const key = String(row.sellerId || row.sellerName);
      const existing = bySeller.get(key) || {
        sellerId: row.sellerId,
        sellerName: row.sellerName,
        successfulListings: 0,
        endedListings: 0,
        manualEndedListings: 0,
        marketplaces: []
      };
      const country = row.country || 'Unknown';
      const endedListings = row.endedListings || 0;
      const manualEndedListings = row.manualEndedListings || 0;
      existing.endedListings += endedListings;
      existing.manualEndedListings = (existing.manualEndedListings || 0) + manualEndedListings;
      const existingMarketplace = existing.marketplaces.find(m => m.country === country);
      if (existingMarketplace) {
        existingMarketplace.endedListings = (existingMarketplace.endedListings || 0) + endedListings;
        existingMarketplace.manualEndedListings = (existingMarketplace.manualEndedListings || 0) + manualEndedListings;
      } else {
        existing.marketplaces.push({ country, successfulListings: 0, endedListings, manualEndedListings });
      }
      bySeller.set(key, existing);
    }

    const result = Array.from(bySeller.values())
      .map(row => ({
        ...row,
        usSuccessfulListings: (row.marketplaces || []).reduce((sum, marketplace) => (
          marketplace.country === 'US'
            ? sum + (marketplace.successfulListings || 0)
            : sum
        ), 0),
        marketplaces: (row.marketplaces || []).map(marketplace => ({
          ...marketplace,
          netListings: (marketplace.successfulListings || 0) - (marketplace.endedListings || 0)
        })),
        netListings: (row.successfulListings || 0) - (row.endedListings || 0)
      }))
      .sort((a, b) => b.successfulListings - a.successfulListings || b.endedListings - a.endedListings);

    res.json(result);
  } catch (err) {
    console.error('[Daily Listing Comparison] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch daily listing comparison' });
  }
});

export default router;
