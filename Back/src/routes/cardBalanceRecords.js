import express from 'express';
import mongoose from 'mongoose';
import CardBalanceRecord from '../models/CardBalanceRecord.js';
import CreditCard from '../models/CreditCard.js';
import AmazonAccount from '../models/AmazonAccount.js';
import ExchangeRateSetting from '../models/ExchangeRateSetting.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

// Constants for calculations
const MARKUP_FEE_PERCENTAGE = 3.5; // 3.5%
const GST_PERCENTAGE = 18; // 18%

// Helper function to calculate fees
function calculateFees(balanceAmountUSD, exchangeRate) {
  const markupFeeUSD = (balanceAmountUSD * MARKUP_FEE_PERCENTAGE) / 100;
  const gstOnMarkupUSD = (markupFeeUSD * GST_PERCENTAGE) / 100;
  const totalAmountUSD = balanceAmountUSD + markupFeeUSD + gstOnMarkupUSD;
  const totalAmountINR = totalAmountUSD * exchangeRate;
  
  return {
    markupFeeUSD: parseFloat(markupFeeUSD.toFixed(4)),
    gstOnMarkupUSD: parseFloat(gstOnMarkupUSD.toFixed(4)),
    totalAmountUSD: parseFloat(totalAmountUSD.toFixed(4)),
    totalAmountINR: parseFloat(totalAmountINR.toFixed(2))
  };
}

// GET /api/card-balance-records - Get all balance records (with filtering)
router.get('/', requireAuth, async (req, res) => {
  try {
    const { cardId, amazonAccountId, dateFrom, dateTo } = req.query;
    const filter = {};
    
    if (cardId && mongoose.Types.ObjectId.isValid(cardId)) {
      filter.card = cardId;
    }
    
    if (amazonAccountId && mongoose.Types.ObjectId.isValid(amazonAccountId)) {
      filter.amazonAccount = amazonAccountId;
    }
    
    if (dateFrom || dateTo) {
      filter.date = {};
      if (dateFrom) {
        filter.date.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.date.$lte = endDate;
      }
    }
    
    const records = await CardBalanceRecord.find(filter)
      .populate('card', 'name last4digits balance')
      .populate('amazonAccount', 'name')
      .populate('createdBy', 'username')
      .sort({ date: -1 })
      .lean();
    
    res.json(records);
  } catch (error) {
    console.error('Error fetching card balance records:', error);
    res.status(500).json({ error: 'Failed to fetch balance records' });
  }
});

// GET /api/card-balance-records/calculate - Calculate fees for a given amount
router.get('/calculate', requireAuth, async (req, res) => {
  try {
    const { amountUSD } = req.query;
    
    if (!amountUSD) {
      return res.status(400).json({ error: 'Amount in USD is required' });
    }
    
    const amount = parseFloat(amountUSD);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    
    // Get current exchange rate
    let exchangeRateSetting = await ExchangeRateSetting.findOne();
    if (!exchangeRateSetting) {
      exchangeRateSetting = new ExchangeRateSetting({ rate: 83.5 });
      await exchangeRateSetting.save();
    }
    
    const calculations = calculateFees(amount, exchangeRateSetting.rate);
    
    res.json({
      balanceAmountUSD: amount,
      exchangeRate: exchangeRateSetting.rate,
      ...calculations,
      breakdown: {
        baseAmount: `$${amount.toFixed(2)}`,
        markupFee: `$${calculations.markupFeeUSD.toFixed(2)} (${MARKUP_FEE_PERCENTAGE}% of base)`,
        gstOnMarkup: `$${calculations.gstOnMarkupUSD.toFixed(2)} (${GST_PERCENTAGE}% of markup)`,
        totalUSD: `$${calculations.totalAmountUSD.toFixed(2)}`,
        exchangeRate: `1 USD = ₹${exchangeRateSetting.rate}`,
        totalINR: `₹${calculations.totalAmountINR.toFixed(2)}`
      }
    });
  } catch (error) {
    console.error('Error calculating fees:', error);
    res.status(500).json({ error: 'Failed to calculate fees' });
  }
});

// GET /api/card-balance-records/:id - Get single balance record
router.get('/:id', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid record ID' });
    }
    
    const record = await CardBalanceRecord.findById(req.params.id)
      .populate('card', 'name last4digits balance')
      .populate('amazonAccount', 'name')
      .populate('createdBy', 'username')
      .lean();
    
    if (!record) {
      return res.status(404).json({ error: 'Balance record not found' });
    }
    
    res.json(record);
  } catch (error) {
    console.error('Error fetching balance record:', error);
    res.status(500).json({ error: 'Failed to fetch balance record' });
  }
});

// POST /api/card-balance-records - Create new balance record
router.post('/', requireAuth, requirePageAccess('CardBalanceRecords'), async (req, res) => {
  try {
    const { card, amazonAccount, balanceAmountUSD, date, notes } = req.body;
    
    if (!card || !amazonAccount || !balanceAmountUSD) {
      return res.status(400).json({ error: 'Card, Amazon account, and balance amount are required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(card)) {
      return res.status(400).json({ error: 'Invalid card ID' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(amazonAccount)) {
      return res.status(400).json({ error: 'Invalid Amazon account ID' });
    }
    
    const amount = parseFloat(balanceAmountUSD);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Balance amount must be a positive number' });
    }
    
    // Verify card exists and has sufficient balance
    const cardObj = await CreditCard.findById(card);
    if (!cardObj) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    // Verify Amazon account exists
    const amazonAccountObj = await AmazonAccount.findById(amazonAccount);
    if (!amazonAccountObj) {
      return res.status(404).json({ error: 'Amazon account not found' });
    }
    
    // Get current exchange rate
    let exchangeRateSetting = await ExchangeRateSetting.findOne();
    if (!exchangeRateSetting) {
      exchangeRateSetting = new ExchangeRateSetting({ rate: 83.5 });
      await exchangeRateSetting.save();
    }
    
    // Calculate fees
    const calculations = calculateFees(amount, exchangeRateSetting.rate);
    
    // Check if card has sufficient balance
    const currentBalance = cardObj.balance || 0;
    if (currentBalance < calculations.totalAmountINR) {
      return res.status(400).json({ 
        error: 'Insufficient card balance',
        required: calculations.totalAmountINR,
        available: currentBalance,
        shortfall: calculations.totalAmountINR - currentBalance
      });
    }
    
    // Create balance record
    const balanceRecord = new CardBalanceRecord({
      card,
      amazonAccount,
      balanceAmountUSD: amount,
      markupFeeUSD: calculations.markupFeeUSD,
      gstOnMarkupUSD: calculations.gstOnMarkupUSD,
      totalAmountUSD: calculations.totalAmountUSD,
      exchangeRate: exchangeRateSetting.rate,
      totalAmountINR: calculations.totalAmountINR,
      date: date ? new Date(date) : new Date(),
      notes: notes || '',
      createdBy: req.user.userId,
      cardBalanceBefore: currentBalance,
      cardBalanceAfter: currentBalance - calculations.totalAmountINR
    });
    
    // Deduct from card balance
    cardObj.balance = currentBalance - calculations.totalAmountINR;
    
    // Save both documents
    await balanceRecord.save();
    await cardObj.save();
    
    await balanceRecord.populate('card', 'name last4digits balance');
    await balanceRecord.populate('amazonAccount', 'name');
    await balanceRecord.populate('createdBy', 'username');
    
    res.status(201).json({
      message: 'Balance record created successfully',
      record: balanceRecord,
      newCardBalance: cardObj.balance
    });
  } catch (error) {
    console.error('Error creating balance record:', error);
    res.status(500).json({ error: 'Failed to create balance record' });
  }
});

// DELETE /api/card-balance-records/:id - Delete balance record and restore card balance
router.delete('/:id', requireAuth, requirePageAccess('SuperAdmin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid record ID' });
    }
    
    const record = await CardBalanceRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Balance record not found' });
    }
    
    // Restore card balance
    const card = await CreditCard.findById(record.card);
    if (card) {
      card.balance = (card.balance || 0) + record.totalAmountINR;
      await card.save();
    }
    
    await CardBalanceRecord.findByIdAndDelete(req.params.id);
    
    res.json({ 
      message: 'Balance record deleted and card balance restored',
      restoredAmount: record.totalAmountINR,
      newCardBalance: card ? card.balance : null
    });
  } catch (error) {
    console.error('Error deleting balance record:', error);
    res.status(500).json({ error: 'Failed to delete balance record' });
  }
});

export default router;
