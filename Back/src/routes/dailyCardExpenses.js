import express from 'express';
import mongoose from 'mongoose';
import DailyCardExpense from '../models/DailyCardExpense.js';
import CreditCard from '../models/CreditCard.js';
import Order from '../models/Order.js';
import AmazonAccount from '../models/AmazonAccount.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

// Helper function to format currency
const formatCurrency = (val) => {
  if (val === undefined || val === null || val === '') return '$0.00';
  const num = parseFloat(val);
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

// Helper function to get start and end of day
function getDateBounds(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  return { start, end };
}

// Helper function to calculate available balance for a given card and date (from previous day)
async function calculateCarryoverForDate(cardId, targetDate) {
  const { start, end } = getDateBounds(targetDate);
  const previousDay = new Date(start);
  previousDay.setDate(previousDay.getDate() - 1);
  const { start: prevStart, end: prevEnd } = getDateBounds(previousDay);

  const previousDayRecord = await DailyCardExpense.findOne({
    card: cardId,
    date: { $gte: prevStart, $lte: prevEnd }
  });

  return previousDayRecord?.availableBalance || 0;
}

// GET /api/daily-card-expenses - List with filtering
router.get('/', requireAuth, requirePageAccess('FinanceCashflow'), async (req, res) => {
  try {
    const { dateMode = 'None', date = '', from = '', to = '', cardId = '' } = req.query;

    const filter = {};
    const dateBounds = {};

    // Handle date filtering
    if (dateMode === 'Single Day' && date) {
      const d = new Date(date);
      if (!Number.isNaN(d.getTime())) {
        const { start, end } = getDateBounds(d);
        dateBounds.$gte = start;
        dateBounds.$lte = end;
      }
    } else if (dateMode === 'Date Range') {
      if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          dateBounds.$gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          dateBounds.$lte = toDate;
        }
      }
    }
    // If dateMode is 'None', don't apply date filter

    if (Object.keys(dateBounds).length > 0) {
      filter.date = dateBounds;
    }

    if (cardId && mongoose.Types.ObjectId.isValid(cardId)) {
      filter.card = cardId;
    }

    // Get all records matching the filter
    const records = await DailyCardExpense.find(filter)
      .populate('card', 'name last4digits')
      .populate('amazonAccount', 'name')
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username')
      .sort({ date: -1 })
      .lean();

    // Get all cards for dropdown
    const allCards = await CreditCard.find().sort({ name: 1 }).lean();

    // Calculate summary
    const totalBalance = records.reduce((sum, r) => sum + (r.balanceAdded || 0), 0);
    const totalExpense = records.reduce((sum, r) => sum + (r.expense || 0), 0);
    const endBalance = records.length > 0 ? records[0].availableBalance || 0 : 0;

    // Get unique dates for date range in results
    const uniqueDates = [...new Set(records.map(r => r.date.toISOString().split('T')[0]))];

    res.json({
      records,
      allCards,
      summary: {
        totalRecords: records.length,
        totalBalance,
        totalExpense,
        endBalance,
        dateRange: {
          from: uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1] : null,
          to: uniqueDates.length > 0 ? uniqueDates[0] : null,
        }
      }
    });
  } catch (err) {
    console.error('Error fetching daily card expenses:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/daily-card-expenses/calc-expenses/:date/:amazonAccountId - Calculate expenses from previous day orders
// NOTE: This route must come BEFORE the /:id route to be matched correctly
router.get('/calc-expenses/:date/:amazonAccountId', requireAuth, requirePageAccess('FinanceCashflow'), async (req, res) => {
  try {
    const { date, amazonAccountId } = req.params;

    if (!date || !amazonAccountId) {
      return res.status(400).json({ error: 'Date and Amazon account ID are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(amazonAccountId)) {
      return res.status(400).json({ error: 'Invalid Amazon account ID' });
    }

    // Get Amazon account name
    const amazonAccount = await AmazonAccount.findById(amazonAccountId);
    if (!amazonAccount) {
      return res.status(404).json({ error: 'Amazon account not found' });
    }

    // Calculate previous day
    const selectedDate = new Date(date);
    const previousDay = new Date(selectedDate);
    previousDay.setDate(previousDay.getDate() - 1);
    const { start: prevStart, end: prevEnd } = getDateBounds(previousDay);

    // Query orders for previous day with matching amazon account name
    const orders = await Order.find({
      amazonAccount: amazonAccount.name, // Match by account name string
      $or: [
        { createdAt: { $gte: prevStart, $lte: prevEnd } },
        { dateSold: { $gte: prevStart, $lte: prevEnd } },
        { lastModifiedDate: { $gte: prevStart, $lte: prevEnd } },
      ]
    });

    // Calculate total expenses (shipping + transaction fees)
    let totalExpense = 0;
    orders.forEach((order) => {
      const shipping = parseFloat(order.shipping) || 0;
      const transactionFees = parseFloat(order.transactionFees) || 0;
      totalExpense += shipping + transactionFees;
    });

    res.json({
      date: date,
      previousDate: previousDay.toISOString().split('T')[0],
      amazonAccountId,
      ordersCount: orders.length,
      totalExpense: parseFloat(totalExpense.toFixed(2)),
      orders: orders.map(o => ({
        _id: o._id,
        orderId: o.orderId,
        shipping: o.shipping || 0,
        transactionFees: o.transactionFees || 0,
      }))
    });
  } catch (err) {
    console.error('Error calculating expenses:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/daily-card-expenses/:id - Get single record
router.get('/:id', requireAuth, requirePageAccess('FinanceCashflow'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid record ID' });
    }

    const record = await DailyCardExpense.findById(req.params.id)
      .populate('card', 'name last4digits')
      .populate('amazonAccount', 'name')
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username');

    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(record);
  } catch (err) {
    console.error('Error fetching record:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/daily-card-expenses - Create
router.post('/', requireAuth, requirePageAccess('FinanceCashflow'), async (req, res) => {
  try {
    const { card, date, balanceAdded, availableBalance, expense, notes, amazonAccount } = req.body;

    if (!card || !date) {
      return res.status(400).json({ error: 'Card and date are required' });
    }

    if (!mongoose.Types.ObjectId.isValid(card)) {
      return res.status(400).json({ error: 'Invalid card ID' });
    }

    // Get card details
    const cardObj = await CreditCard.findById(card);
    if (!cardObj) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Get last 4 digits from card object
    const cardLast4 = cardObj.last4digits || 'N/A';

    // Calculate available balance from previous day as default
    const calculatedAvailableBalance = await calculateCarryoverForDate(card, date);
    const availableBalanceNum = availableBalance !== undefined ? parseFloat(availableBalance) : calculatedAvailableBalance;

    // Check if record already exists for this card and date
    const { start, end } = getDateBounds(date);
    const existingRecord = await DailyCardExpense.findOne({
      card,
      date: { $gte: start, $lte: end }
    });

    if (existingRecord) {
      return res.status(400).json({ error: 'Record already exists for this card on this date' });
    }

    const balanceAddedNum = parseFloat(balanceAdded) || 0;
    const expenseNum = parseFloat(expense) || 0;

    const newRecord = new DailyCardExpense({
      card,
      cardLast4,
      date: new Date(date),
      balanceAdded: balanceAddedNum,
      availableBalance: availableBalanceNum,
      expense: expenseNum,
      notes: notes || '',
      amazonAccount: amazonAccount || null,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    await newRecord.save();
    await newRecord.populate('card', 'name');

    res.status(201).json(newRecord);
  } catch (err) {
    console.error('Error creating record:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/daily-card-expenses/:id - Update
router.put('/:id', requireAuth, requirePageAccess('FinanceCashflow'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid record ID' });
    }

    const record = await DailyCardExpense.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    const { card, date, balanceAdded, availableBalance, expense, notes, amazonAccount } = req.body;

    // If card changed, validate and recalculate
    if (card && card !== record.card.toString()) {
      if (!mongoose.Types.ObjectId.isValid(card)) {
        return res.status(400).json({ error: 'Invalid card ID' });
      }
      const cardObj = await CreditCard.findById(card);
      if (!cardObj) {
        return res.status(404).json({ error: 'Card not found' });
      }
      record.card = card;
      record.cardLast4 = cardObj.last4digits || 'N/A';
    }

    if (date) {
      record.date = new Date(date);
    }

    if (balanceAdded !== undefined) {
      record.balanceAdded = parseFloat(balanceAdded) || 0;
    }

    if (availableBalance !== undefined) {
      record.availableBalance = parseFloat(availableBalance) || 0;
    }

    if (expense !== undefined) {
      record.expense = parseFloat(expense) || 0;
    }

    if (notes !== undefined) {
      record.notes = notes || '';
    }

    if (amazonAccount !== undefined) {
      record.amazonAccount = amazonAccount || null;
    }

    record.updatedBy = req.user._id;

    await record.save();
    await record.populate('card', 'name last4digits');
    await record.populate('amazonAccount', 'name');

    res.json(record);
  } catch (err) {
    console.error('Error updating record:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/daily-card-expenses/:id - Delete
router.delete('/:id', requireAuth, requirePageAccess('FinanceCashflow'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid record ID' });
    }

    const record = await DailyCardExpense.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ message: 'Record deleted successfully' });
  } catch (err) {
    console.error('Error deleting record:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

