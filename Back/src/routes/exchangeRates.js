import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import ExchangeRate from '../models/ExchangeRate.js';
import Order from '../models/Order.js';
import {
  calculateOrderAmazonFinancials,
  calculateOrderEbayFinancials,
  clearExchangeRateRecordCache,
  getCurrentExchangeRateRecord,
  getExchangeRateDefaultValue,
  getExchangeRateRecordForDate,
  getPacificDayBounds,
  getPurchaseMarketplaceQueryForRateMarketplace,
  isAmazonRateMarketplace
} from '../utils/exchangeRateUtils.js';

const router = express.Router();

// Get current exchange rate
router.get('/current', requireAuth, async (req, res) => {
  try {
    const { marketplace = 'EBAY_US' } = req.query;
    const currentRate = await getCurrentExchangeRateRecord(marketplace);
    
    if (!currentRate) {
      return res.json({
        rate: getExchangeRateDefaultValue(marketplace),
        effectiveDate: new Date(),
        marketplace,
        applicationMode: 'effective'
      });
    }
    
    res.json(currentRate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get rate history
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { marketplace = 'EBAY_US', limit = 50 } = req.query;
    
    const history = await ExchangeRate.find({ marketplace })
      .sort({ effectiveDate: -1 })
      .limit(parseInt(limit));
    
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get rate for a specific date
router.get('/for-date', requireAuth, async (req, res) => {
  try {
    const { date, marketplace = 'EBAY_US' } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }
    
    const rate = await getExchangeRateRecordForDate(date, marketplace);
    
    if (!rate) {
      return res.json({
        rate: getExchangeRateDefaultValue(marketplace),
        effectiveDate: new Date(date),
        marketplace,
        applicationMode: 'effective'
      });
    }
    
    res.json(rate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set new exchange rate
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      rate,
      effectiveDate,
      marketplace = 'EBAY_US',
      notes,
      applicationMode = 'effective',
      updateExistingOrders = true
    } = req.body;
    
    if (!rate || !effectiveDate) {
      return res.status(400).json({ error: 'Rate and effectiveDate are required' });
    }

    if (!['effective', 'specific-date'].includes(applicationMode)) {
      return res.status(400).json({ error: 'applicationMode must be either effective or specific-date' });
    }

    const parsedEffectiveDate = new Date(effectiveDate);
    const normalizedEffectiveDate = applicationMode === 'specific-date'
      ? getPacificDayBounds(parsedEffectiveDate).start
      : parsedEffectiveDate;

    let existing;
    if (applicationMode === 'specific-date') {
      const { start, end } = getPacificDayBounds(normalizedEffectiveDate);
      existing = await ExchangeRate.findOne({
        marketplace,
        applicationMode,
        effectiveDate: { $gte: start, $lte: end }
      });
    } else {
      existing = await ExchangeRate.findOne({
        marketplace,
        applicationMode,
        effectiveDate: parsedEffectiveDate
      });
    }

    const wasExisting = Boolean(existing);
    
    if (existing) {
      existing.rate = rate;
      existing.notes = notes;
      existing.applicationMode = applicationMode;
      existing.effectiveDate = normalizedEffectiveDate;
      existing.createdBy = req.user?.username || 'system';
      await existing.save();
    } else {
      existing = new ExchangeRate({
        rate,
        effectiveDate: normalizedEffectiveDate,
        marketplace,
        applicationMode,
        notes,
        createdBy: req.user?.username || 'system'
      });

      await existing.save();
    }

    clearExchangeRateRecordCache(marketplace);

    const persistedRate = await ExchangeRate.findById(existing._id).lean();
    if (!persistedRate) {
      throw new Error('Exchange rate was not persisted to database');
    }

    let updatedOrders = 0;

    if (updateExistingOrders) {
      const orderDateExpression = { $ifNull: ['$dateSold', '$creationDate'] };
      const orderQuery = {
        purchaseMarketplaceId: getPurchaseMarketplaceQueryForRateMarketplace(marketplace)
      };

      if (applicationMode === 'specific-date') {
        const { start, end } = getPacificDayBounds(normalizedEffectiveDate);
        orderQuery.$expr = {
          $and: [
            { $gte: [orderDateExpression, start] },
            { $lte: [orderDateExpression, end] }
          ]
        };
      } else {
        orderQuery.$expr = {
          $gte: [orderDateExpression, normalizedEffectiveDate]
        };
      }

      const cursor = Order.find(orderQuery).cursor();

      for (let order = await cursor.next(); order != null; order = await cursor.next()) {
        if (isAmazonRateMarketplace(marketplace)) {
          Object.assign(order, await calculateOrderAmazonFinancials(order, rate));
        } else {
          Object.assign(order, await calculateOrderEbayFinancials(order, rate));
        }

        await order.save();
        updatedOrders += 1;
      }
    }

    res.json({
      message: wasExisting ? 'Rate updated' : 'Rate created',
      rate: persistedRate,
      updatedOrders,
      persistedToDatabase: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete exchange rate entry
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const rate = await ExchangeRate.findByIdAndDelete(id);
    
    if (!rate) {
      return res.status(404).json({ error: 'Rate not found' });
    }

    clearExchangeRateRecordCache(rate.marketplace);
    
    res.json({ message: 'Rate deleted', rate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
