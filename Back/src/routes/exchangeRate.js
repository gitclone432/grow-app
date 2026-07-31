import express from 'express';
import ExchangeRateSetting from '../models/ExchangeRateSetting.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

// GET /api/exchange-rate - Get current exchange rate
router.get('/', requireAuth, async (req, res) => {
  try {
    let exchangeRateSetting = await ExchangeRateSetting.findOne()
      .populate('lastUpdatedBy', 'username')
      .lean();
    
    if (!exchangeRateSetting) {
      exchangeRateSetting = new ExchangeRateSetting({ rate: 83.5 });
      await exchangeRateSetting.save();
    }
    
    res.json(exchangeRateSetting);
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

// PUT /api/exchange-rate - Update exchange rate (SuperAdmin only)
router.put('/', requireAuth, requirePageAccess('SuperAdmin'), async (req, res) => {
  try {
    const { rate } = req.body;
    
    if (!rate) {
      return res.status(400).json({ error: 'Exchange rate is required' });
    }
    
    const rateValue = parseFloat(rate);
    if (isNaN(rateValue) || rateValue <= 0) {
      return res.status(400).json({ error: 'Exchange rate must be a positive number' });
    }
    
    let exchangeRateSetting = await ExchangeRateSetting.findOne();
    
    if (!exchangeRateSetting) {
      exchangeRateSetting = new ExchangeRateSetting({
        rate: rateValue,
        lastUpdatedBy: req.user.userId,
        lastUpdatedAt: new Date()
      });
    } else {
      exchangeRateSetting.rate = rateValue;
      exchangeRateSetting.lastUpdatedBy = req.user.userId;
      exchangeRateSetting.lastUpdatedAt = new Date();
    }
    
    await exchangeRateSetting.save();
    await exchangeRateSetting.populate('lastUpdatedBy', 'username');
    
    res.json({
      message: 'Exchange rate updated successfully',
      exchangeRate: exchangeRateSetting
    });
  } catch (error) {
    console.error('Error updating exchange rate:', error);
    res.status(500).json({ error: 'Failed to update exchange rate' });
  }
});

export default router;
