import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyOrderFulfilment from '../models/EtsyOrderFulfilment.js';
import { normalizeEtsyRegion } from '../utils/etsyAddressZip.js';
import {
  createEtsyOrderSheetRouter,
  toDateKey,
  ETSY_ORDER_FULFILMENT_FIELDS,
} from './etsyOrderSheetRouter.js';

export { ETSY_ORDER_FULFILMENT_FIELDS };

const router = Router();

function normalizeAnalyticsRegion(value) {
  const region = normalizeEtsyRegion(value);
  return region || 'Unknown';
}

// GET /api/etsy/order-fulfilment/daily-statistics
router.get('/daily-statistics', requireAuth, requirePageAccess('EtsyOrderAnalytics'), async (req, res) => {
  try {
    const { startDate, endDate, storeId, region } = req.query;
    const filter = {};

    if (storeId) {
      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        return res.status(400).json({ error: 'Invalid store id' });
      }
      filter.store = storeId;
    }

    const orders = await EtsyOrderFulfilment.find(filter)
      .populate('store', 'name')
      .lean();

    const bucket = new Map();

    for (const order of orders) {
      const dateKey = toDateKey(order.dateSold);
      if (!dateKey) continue;

      if (startDate && dateKey < startDate) continue;
      if (endDate && dateKey > endDate) continue;

      const orderRegion = normalizeAnalyticsRegion(order.region);
      if (region && orderRegion !== region) continue;

      const storeRef = order.store;
      const storeIdStr = String(storeRef?._id || storeRef || 'unknown');
      const storeName = storeRef?.name || 'Unknown';
      const key = `${storeIdStr}|${dateKey}`;

      if (!bucket.has(key)) {
        bucket.set(key, {
          store: { id: storeIdStr, name: storeName },
          date: dateKey,
          totalOrders: 0,
          regionCounts: { USA: 0, UK: 0, CANADA: 0, AU: 0, Unknown: 0 },
        });
      }

      const entry = bucket.get(key);
      entry.totalOrders += 1;
      if (Object.prototype.hasOwnProperty.call(entry.regionCounts, orderRegion)) {
        entry.regionCounts[orderRegion] += 1;
      } else {
        entry.regionCounts.Unknown += 1;
      }
    }

    const formattedStatistics = Array.from(bucket.values())
      .map((entry) => ({
        store: entry.store,
        date: entry.date,
        totalOrders: entry.totalOrders,
        regionBreakdown: Object.entries(entry.regionCounts)
          .filter(([, count]) => count > 0)
          .map(([regionKey, count]) => ({ region: regionKey, count })),
      }))
      .sort((a, b) => {
        const dateCmp = b.date.localeCompare(a.date);
        if (dateCmp !== 0) return dateCmp;
        return a.store.name.localeCompare(b.store.name);
      });

    res.json(formattedStatistics);
  } catch (err) {
    console.error('[Etsy Order Analytics] daily-statistics failed:', err);
    res.status(500).json({ error: 'Failed to fetch order statistics' });
  }
});

router.use(createEtsyOrderSheetRouter({
  Model: EtsyOrderFulfilment,
  pages: 'EtsyOrderFulfilment',
  logLabel: 'Etsy Order Fulfilment',
}));

export default router;
