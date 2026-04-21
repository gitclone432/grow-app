import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import Order from '../models/Order.js';
import Case from '../models/Case.js';
import Return from '../models/Return.js';
import MarketMetric from '../models/MarketMetric.js';
import Seller from '../models/Seller.js';

const router = Router();

// SNAD-related return reasons
const SNAD_RETURN_REASONS = [
  'NOT_AS_DESCRIBED',
  'DEFECTIVE_ITEM',
  'WRONG_ITEM',
  'MISSING_PARTS',
  'ARRIVED_DAMAGED',
  'DOESNT_MATCH',
  'NOT_AUTHENTIC',
  'DOES_NOT_FIT'
];

/**
 * GET /account-health/details
 * Returns SNAD details for orders with SNAD cases or returns
 * Supports filters: sellerId, startDate, endDate
 */
router.get('/details', requireAuth, requirePageAccess('AccountHealth'), async (req, res) => {
  try {
    const { sellerId, startDate, endDate } = req.query;

    // Build date range filter
    const dateMatch = {};
    if (startDate || endDate) {
      dateMatch.dateSold = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        dateMatch.dateSold.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        dateMatch.dateSold.$lte = end;
      }
    }

    // Build seller filter
    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};

    // Get all SNAD cases
    const snadCases = await Case.find({
      ...sellerMatch,
      caseType: 'SNAD'
    }).lean();

    // Get all INR cases (for the INR column)
    const inrCases = await Case.find({
      ...sellerMatch,
      caseType: 'INR'
    }).lean();

    // Get SNAD-related returns (by reason code OR manually marked)
    const snadReturns = await Return.find({
      ...sellerMatch,
      $or: [
        { returnReason: { $in: SNAD_RETURN_REASONS } },
        { markedAsSNAD: true }
      ]
    }).lean();

    // Collect unique order IDs from SNAD cases and returns
    const snadOrderIds = new Set();
    const orderSnadCount = new Map();
    const orderInrCount = new Map();

    // Process SNAD cases - check both orderId and legacyOrderId
    snadCases.forEach(c => {
      if (c.orderId) {
        snadOrderIds.add(c.orderId);
        orderSnadCount.set(c.orderId, (orderSnadCount.get(c.orderId) || 0) + 1);
      }
    });

    // Process SNAD returns - check both orderId and legacyOrderId
    snadReturns.forEach(r => {
      if (r.orderId) {
        snadOrderIds.add(r.orderId);
        orderSnadCount.set(r.orderId, (orderSnadCount.get(r.orderId) || 0) + 1);
      }
    });

    // Process INR cases - count them too
    inrCases.forEach(c => {
      if (c.orderId) {
        snadOrderIds.add(c.orderId); // Add to order IDs so we fetch these orders too
        orderInrCount.set(c.orderId, (orderInrCount.get(c.orderId) || 0) + 1);
      }
    });

    if (snadOrderIds.size === 0) {
      return res.json({ details: [], total: 0 });
    }

    // Fetch orders with SNAD/INR issues
    const orderQuery = {
      ...sellerMatch,
      ...dateMatch,
      $or: [
        { orderId: { $in: Array.from(snadOrderIds) } },
        { legacyOrderId: { $in: Array.from(snadOrderIds) } }
      ]
    };

    const orders = await Order.find(orderQuery)
      .populate({
        path: 'seller',
        populate: { path: 'user', select: 'username' }
      })
      .sort({ dateSold: -1 })
      .lean();

    // Build response
    const details = orders.map(order => {
      const orderId = order.orderId || order.legacyOrderId;
      
      // Try to match with orderId first, then legacyOrderId (but not both to avoid double-counting)
      let snadCount = 0;
      if (order.orderId && orderSnadCount.has(order.orderId)) {
        snadCount = orderSnadCount.get(order.orderId);
      } else if (order.legacyOrderId && orderSnadCount.has(order.legacyOrderId)) {
        snadCount = orderSnadCount.get(order.legacyOrderId);
      }
      
      let inrCount = 0;
      if (order.orderId && orderInrCount.has(order.orderId)) {
        inrCount = orderInrCount.get(order.orderId);
      } else if (order.legacyOrderId && orderInrCount.has(order.legacyOrderId)) {
        inrCount = orderInrCount.get(order.legacyOrderId);
      }
      
      // Calculate remark date (3 months from order date)
      let remarkDate = null;
      if (order.dateSold) {
        const d = new Date(order.dateSold);
        d.setMonth(d.getMonth() + 3);
        remarkDate = d.toISOString();
      }

      return {
        _id: order._id,
        orderId: order.orderId,
        legacyOrderId: order.legacyOrderId,
        orderDate: order.dateSold,
        itemId: order.itemNumber || (order.lineItems?.[0]?.legacyItemId) || '',
        itemTitle: order.productName || (order.lineItems?.[0]?.title) || '',
        snadCount,
        sellerFault: order.sellerFault || 'No', // Default to 'No'
        hasInr: inrCount,
        remarkDate,
        seller: {
          _id: order.seller?._id,
          username: order.seller?.user?.username || 'Unknown'
        }
      };
    });

    res.json({ details, total: details.length });
  } catch (error) {
    console.error('Error fetching account health details:', error);
    res.status(500).json({ error: 'Failed to fetch account health details' });
  }
});

/**
 * GET /account-health/evaluation-windows
 * Returns evaluation window metrics (84-day rolling windows, calculated weekly)
 * Each window covers an 84-day period, and we generate a new window every week
 * BBE Rate = (SNAD count / Total Sales in that 84-day period) × 100
 */
router.get('/evaluation-windows', requireAuth, requirePageAccess('AccountHealth'), async (req, res) => {
  try {
    const { sellerId } = req.query;
    const sellerMatch = sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {};

    // We'll generate weekly windows, each spanning 84 days
    const windows = [];
    const today = new Date();
    
    // Align to the most recent Sunday (or today if Sunday)
    let currentWindowEnd = new Date(today);
    const dayOfWeek = currentWindowEnd.getDay();
    if (dayOfWeek !== 0) {
      currentWindowEnd.setDate(currentWindowEnd.getDate() - dayOfWeek);
    }
    currentWindowEnd.setHours(23, 59, 59, 999);

    // Generate windows going backwards week by week
    // We'll generate about 12 windows (84 days of weekly windows)
    const maxWindows = 12;

    // Fetch market metrics history:
    // - with seller selected: include that seller's metrics + global fallback metrics
    // - without seller selected: use only global metrics
    const marketMetricQuery = sellerId
      ? {
          type: 'bbe_market_avg',
          $or: [
            { seller: new mongoose.Types.ObjectId(sellerId) },
            { seller: { $exists: false } },
            { seller: null }
          ]
        }
      : {
          type: 'bbe_market_avg',
          $or: [{ seller: { $exists: false } }, { seller: null }]
        };
    // Important: when multiple metrics exist for the same effectiveDate,
    // prefer the most recently created record.
    const marketMetrics = await MarketMetric.find(marketMetricQuery)
      .sort({ effectiveDate: 1, createdAt: 1, _id: 1 })
      .lean();
    const sellerScopedMetrics = sellerId
      ? marketMetrics.filter(m => m.seller && m.seller.toString() === sellerId)
      : [];
    const globalMetrics = marketMetrics.filter(m => !m.seller);
    
    for (let i = 0; i < maxWindows; i++) {
      // Data should cover 84 days ending on the displayed window end date minus 1 day.
      // Example: if display end is 01/25, data should include up to 01/24.
      const calculationEnd = new Date(currentWindowEnd);
      calculationEnd.setDate(calculationEnd.getDate() - 1);
      calculationEnd.setHours(23, 59, 59, 999);

      // 84-day inclusive window: start = end - 83 days
      const windowStart = new Date(calculationEnd);
      windowStart.setDate(windowStart.getDate() - 83);
      windowStart.setHours(0, 0, 0, 0);

      // Get total sales in this 84-day window
      const totalSalesCount = await Order.countDocuments({
        ...sellerMatch,
        dateSold: { $gte: windowStart, $lte: calculationEnd }
      });

      // Get SNAD cases in this 84-day window
      const snadCount = await Case.countDocuments({
        ...sellerMatch,
        caseType: 'SNAD',
        creationDate: { $gte: windowStart, $lte: calculationEnd }
      });

      // Get SNAD returns in this 84-day window (by reason code OR manually marked)
      const snadReturnCount = await Return.countDocuments({
        ...sellerMatch,
        $or: [
          { returnReason: { $in: SNAD_RETURN_REASONS } },
          { markedAsSNAD: true }
        ],
        creationDate: { $gte: windowStart, $lte: calculationEnd }
      });

      const totalSnadCount = snadCount + snadReturnCount;
      const bbeRate = totalSalesCount > 0 ? (totalSnadCount / totalSalesCount) * 100 : 0;

      // Calculate evaluation window start (1 week before end)
      const evaluationWindowStart = new Date(currentWindowEnd);
      evaluationWindowStart.setDate(evaluationWindowStart.getDate() - 7);
      evaluationWindowStart.setHours(0, 0, 0, 0);

      // Determine Market Avg for this window
      // Priority: seller-scoped metric -> global fallback metric
      let marketAvg = 1.1; // Default fallback
      const applicableMetric = (sellerId ? sellerScopedMetrics : globalMetrics)
        .findLast(m => new Date(m.effectiveDate) <= new Date(currentWindowEnd))
        || globalMetrics.findLast(m => new Date(m.effectiveDate) <= new Date(currentWindowEnd));
      if (applicableMetric) {
        marketAvg = applicableMetric.value;
      }

      windows.push({
        windowStart: windowStart.toISOString(),
        windowEnd: currentWindowEnd.toISOString(), // Kept as is for display date
        evaluationWindowStart: evaluationWindowStart.toISOString(),
        evaluationWindowEnd: currentWindowEnd.toISOString(),
        totalSales: totalSalesCount,
        snadCount: totalSnadCount,
        bbeRate: bbeRate.toFixed(2),
        marketAvg, 
        evaluationDate: currentWindowEnd.toISOString()
      });

      // Move to previous week
      currentWindowEnd = new Date(currentWindowEnd);
      currentWindowEnd.setDate(currentWindowEnd.getDate() - 7);
      currentWindowEnd.setHours(23, 59, 59, 999);
    }

    res.json({ windows });
  } catch (error) {
    console.error('Error fetching evaluation windows:', error);
    res.status(500).json({ error: 'Failed to fetch evaluation windows' });
  }
});

/**
 * POST /account-health/evaluation-windows/market-avg
 * Update market average (creates a new historical record)
 */
router.post('/evaluation-windows/market-avg', requireAuth, requirePageAccess('AccountHealth'), async (req, res) => {
  try {
    const { value, effectiveDate, sellerId } = req.body;
    
    if (!value || isNaN(value)) {
      return res.status(400).json({ error: 'Valid value is required' });
    }
    if (!effectiveDate) {
      return res.status(400).json({ error: 'Effective date is required' });
    }
    if (sellerId && !mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ error: 'Invalid sellerId' });
    }

    const metric = new MarketMetric({
      value,
      effectiveDate: new Date(effectiveDate),
      ...(sellerId ? { seller: new mongoose.Types.ObjectId(sellerId) } : {}),
      createdBy: req.user._id
    });

    await metric.save();

    res.json({ success: true, metric });
  } catch (error) {
    console.error('Error saving market average:', error);
    res.status(500).json({ error: 'Failed to save market average' });
  }
});

/**
 * PATCH /account-health/details/:orderId
 * Update sellerFault field for an order
 */
router.patch('/details/:orderId', requireAuth, requirePageAccess('AccountHealth'), async (req, res) => {
  try {
    const { orderId } = req.params;
    const { sellerFault } = req.body;

    if (!['Yes', 'No'].includes(sellerFault)) {
      return res.status(400).json({ error: 'sellerFault must be "Yes" or "No"' });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      { sellerFault },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (error) {
    console.error('Error updating order seller fault:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

/**
 * GET /account-health/overview
 * Returns overview data for all sellers across 4 weeks
 * Week 1 & 2: Actual BBE rate (past data)
 * Week 3 & 4: Additional sales needed to meet market avg (prediction)
 */
router.get('/overview', requireAuth, requirePageAccess('AccountHealth'), async (req, res) => {
  try {
    // Fetch all sellers with user data
    const sellers = await Seller.find().populate('user', 'username email').lean();

    // Get current market avg
    const latestMarketMetric = await MarketMetric.findOne({
      type: 'bbe_market_avg',
      $or: [{ seller: { $exists: false } }, { seller: null }]
    }).sort({ effectiveDate: -1 }).lean();
    const marketAvg = latestMarketMetric?.value || 1.1;

    // Calculate window end dates for 4 weeks
    const today = new Date();
    let currentWindowEnd = new Date(today);
    const dayOfWeek = currentWindowEnd.getDay();
    if (dayOfWeek !== 0) {
      currentWindowEnd.setDate(currentWindowEnd.getDate() - dayOfWeek);
    }
    currentWindowEnd.setHours(23, 59, 59, 999);

    // Week ends: Week 2 = currentWindowEnd, Week 1 = currentWindowEnd - 7 days
    // Week 3 = currentWindowEnd + 7 days, Week 4 = currentWindowEnd + 14 days
    const weekEnds = [
      new Date(currentWindowEnd.getTime() - 7 * 24 * 60 * 60 * 1000),  // Week 1 (past)
      new Date(currentWindowEnd.getTime()),                             // Week 2 (current)
      new Date(currentWindowEnd.getTime() + 7 * 24 * 60 * 60 * 1000),  // Week 3 (future)
      new Date(currentWindowEnd.getTime() + 14 * 24 * 60 * 60 * 1000)  // Week 4 (future)
    ];

    const overviewData = [];

    for (const seller of sellers) {
      const sellerMatch = { seller: seller._id };
      const weeks = [];

      for (let weekIdx = 0; weekIdx < 4; weekIdx++) {
        const windowEnd = weekEnds[weekIdx];
        
        // Apply the same row shift logic: data window is 1 week before display window
        const dataWindowEnd = new Date(windowEnd);
        dataWindowEnd.setDate(dataWindowEnd.getDate() - 7);
        
        // Apply 7-day buffer
        const calculationEnd = new Date(dataWindowEnd);
        calculationEnd.setDate(calculationEnd.getDate() - 7);
        calculationEnd.setHours(23, 59, 59, 999);

        // Calculate start date (84 days before)
        const windowStart = new Date(calculationEnd);
        windowStart.setDate(windowStart.getDate() - 84);
        windowStart.setHours(0, 0, 0, 0);

        // Get total sales
        const totalSales = await Order.countDocuments({
          ...sellerMatch,
          dateSold: { $gte: windowStart, $lte: calculationEnd }
        });

        // Get SNAD cases
        const snadCaseCount = await Case.countDocuments({
          ...sellerMatch,
          caseType: 'SNAD',
          creationDate: { $gte: windowStart, $lte: calculationEnd }
        });

        // Get SNAD returns (by reason code OR manually marked)
        const snadReturnCount = await Return.countDocuments({
          ...sellerMatch,
          $or: [
            { returnReason: { $in: SNAD_RETURN_REASONS } },
            { markedAsSNAD: true }
          ],
          creationDate: { $gte: windowStart, $lte: calculationEnd }
        });

        const totalSnad = snadCaseCount + snadReturnCount;
        const bbeRate = totalSales > 0 ? (totalSnad / totalSales) * 100 : 0;

        if (weekIdx < 2) {
          // Week 1 & 2: Show actual BBE rate
          weeks.push({
            week: weekIdx + 1,
            type: 'actual',
            bbeRate: parseFloat(bbeRate.toFixed(2)),
            totalSales,
            totalSnad
          });
        } else {
          // Week 3 & 4: Show sales needed to meet market avg
          // Formula: salesNeeded = (totalSnad * 100 / marketAvg) - totalSales
          let salesNeeded = 0;
          if (totalSnad > 0) {
            const requiredSales = (totalSnad * 100) / marketAvg;
            salesNeeded = Math.ceil(requiredSales - totalSales);
          }
          weeks.push({
            week: weekIdx + 1,
            type: 'prediction',
            salesNeeded,
            bbeRate: parseFloat(bbeRate.toFixed(2)),
            totalSales,
            totalSnad
          });
        }
      }

      overviewData.push({
        sellerId: seller._id,
        sellerName: seller.user?.username || seller._id.toString(),
        weeks,
        marketAvg
      });
    }

    res.json({ overview: overviewData, marketAvg });
  } catch (error) {
    console.error('Error fetching account health overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview' });
  }
});

export default router;
