import express from 'express';
import mongoose from 'mongoose';
import CashCredit from '../models/CashCredit.js';
import CreditHistory from '../models/CreditHistory.js';
import ExtraExpense from '../models/ExtraExpense.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';

const router = express.Router();

// Ensure there's only one CashCredit document
async function getOrCreateCashCredit() {
    let cashCredit = await CashCredit.findOne();
    if (!cashCredit) {
        cashCredit = new CashCredit({
            totalCredit: 0,
            totalUsed: 0,
            remainingCredit: 0,
        });
        await cashCredit.save();
    }
    return cashCredit;
}

// Helper function to get year-month string (e.g., "2026-05")
function getYearMonth(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Helper to get start and end of month
function getMonthBounds(yearMonth) {
    const [year, month] = yearMonth.split('-');
    const start = new Date(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0, 0);
    const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59, 999);
    return { start, end };
}

// Calculate monthly balance: sum of credits - sum of cash expenses for that month
async function calculateMonthlyBalance(yearMonth) {
    const { start, end } = getMonthBounds(yearMonth);

    // Get all CREDIT_ADDED for this month
    const creditAdded = await CreditHistory.aggregate([
        {
            $match: {
                type: 'CREDIT_ADDED',
                date: { $gte: start, $lte: end }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);

    // Get all cash expenses for this month
    const cashExpenses = await ExtraExpense.aggregate([
        {
            $match: {
                paymentMethod: 'Cash',
                date: { $gte: start, $lte: end }
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' }
            }
        }
    ]);

    const totalCreditsAdded = creditAdded[0]?.total || 0;
    const totalCashExpenses = cashExpenses[0]?.total || 0;
    
    return {
        yearMonth,
        creditsAdded: totalCreditsAdded,
        cashExpenses: totalCashExpenses,
        balance: totalCreditsAdded - totalCashExpenses
    };
}

// Get all months with credit/expenses and calculate balances with carryover
async function getMonthlyBalances() {
    // Get all months that have credit history
    const creditMonths = await CreditHistory.aggregate([
        { $match: { type: 'CREDIT_ADDED' } },
        {
            $group: {
                _id: {
                    year: { $year: '$date' },
                    month: { $month: '$date' }
                }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get all months that have ANY expenses (not just cash)
    const expenseMonths = await ExtraExpense.aggregate([
        {
            $group: {
                _id: {
                    year: { $year: '$date' },
                    month: { $month: '$date' }
                }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Merge unique months
    const monthsSet = new Set();
    [...creditMonths, ...expenseMonths].forEach(m => {
        const yearMonth = `${m._id.year}-${String(m._id.month).padStart(2, '0')}`;
        monthsSet.add(yearMonth);
    });

    // Sort months
    const months = Array.from(monthsSet).sort();

    // Calculate balances with carryover
    let carryover = 0;
    const balances = [];

    for (const yearMonth of months) {
        const monthBalance = await calculateMonthlyBalance(yearMonth);
        const netBalance = monthBalance.balance + carryover;
        balances.push({
            ...monthBalance,
            carryoverFromPrevious: carryover,
            netBalance,
        });
        carryover = Math.max(0, netBalance); // Carry forward only positive balance
    }

    return balances;
}

// GET /api/cash-credit - Get current credit information (global + monthly)
router.get('/', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const cashCredit = await getOrCreateCashCredit();
        const monthlyBalances = await getMonthlyBalances();
        
        res.json({
            ...cashCredit.toObject(),
            monthlyBreakdown: monthlyBalances,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/cash-credit/monthly - Get detailed monthly breakdown
router.get('/monthly', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const monthlyBalances = await getMonthlyBalances();
        res.json({ monthlyBreakdown: monthlyBalances });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/cash-credit/add - Add credit amount
router.post('/add', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const { amount, date, creditGivenBy, remarks } = req.body;

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const numAmount = parseFloat(amount);
        const creditDate = date ? new Date(date) : new Date();
        const creditMonth = getYearMonth(creditDate);

        // Get or create cash credit
        let cashCredit = await getOrCreateCashCredit();

        // Update credit amounts
        cashCredit.totalCredit += numAmount;
        cashCredit.lastUpdated = new Date();
        await cashCredit.save();

        // Create credit history record
        const history = new CreditHistory({
            type: 'CREDIT_ADDED',
            amount: numAmount,
            date: creditDate,
            creditGivenBy: creditGivenBy || '',
            remarks: remarks || '',
            balanceAfter: 0, // Will be updated after calculation
        });
        await history.save();

        // Recalculate monthly balances (for the entire system)
        const monthlyBalances = await getMonthlyBalances();
        
        // Update cash credit with current calculations
        // totalUsed = sum of all cash expenses across all months
        // totalCredit already updated above
        // remainingCredit = totalCredit - totalUsed
        const totalExpensesAll = monthlyBalances.reduce((sum, m) => sum + m.cashExpenses, 0);
        
        cashCredit.totalUsed = totalExpensesAll;
        cashCredit.remainingCredit = cashCredit.totalCredit - totalExpensesAll;
        await cashCredit.save();

        // Update the history record with new balance
        history.balanceAfter = cashCredit.remainingCredit;
        await history.save();

        res.status(201).json({
            message: 'Credit added successfully',
            cashCredit,
            history,
            monthlyBreakdown: monthlyBalances,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/cash-credit/deduct - Deduct credit (internal use for expenses)
// This is called when a new cash expense is added
router.put('/deduct', requireAuth, async (req, res) => {
    try {
        const { amount, expenseId, expenseDate, remarks } = req.body;

        if (!amount || parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Invalid amount' });
        }

        const numAmount = parseFloat(amount);
        const expenseMonth = getYearMonth(expenseDate || new Date());
        
        // Get monthly balances to check if credit available
        const monthlyBalances = await getMonthlyBalances();
        
        // Find balance for this month
        let monthBalance = monthlyBalances.find(m => m.yearMonth === expenseMonth);
        
        // If no credit added yet for this month, create it
        if (!monthBalance) {
            monthBalance = await calculateMonthlyBalance(expenseMonth);
        }

        // Check if sufficient credit available in this month (including carryover)
        if (monthBalance.netBalance < numAmount) {
            return res.status(400).json({ 
                error: `Insufficient credit for ${expenseMonth}. Available: ${monthBalance.netBalance}, Required: ${numAmount}` 
            });
        }

        // Get or create cash credit
        let cashCredit = await getOrCreateCashCredit();

        // Update global totals
        cashCredit.totalUsed += numAmount;
        cashCredit.lastUpdated = new Date();
        await cashCredit.save();

        // Create credit history record
        const history = new CreditHistory({
            type: 'CREDIT_USED',
            amount: numAmount,
            date: new Date(expenseDate) || new Date(),
            expenseId: expenseId || null,
            remarks: remarks || '',
            balanceAfter: 0, // Will recalculate
        });
        await history.save();

        // Recalculate global balance from all months
        const allMonths = await getMonthlyBalances();
        const totalExpensesAll = allMonths.reduce((sum, m) => sum + m.cashExpenses, 0);
        
        cashCredit.totalUsed = totalExpensesAll;
        cashCredit.remainingCredit = cashCredit.totalCredit - totalExpensesAll;
        await cashCredit.save();

        // Update history with final balance
        history.balanceAfter = cashCredit.remainingCredit;
        await history.save();

        res.json({
            message: 'Credit deducted successfully',
            cashCredit,
            history,
            monthlyBreakdown: allMonths,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/credit-history - Get credit history with filters
router.get('/history', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const { type, from, to } = req.query;
        const filter = {};

        if (type) {
            filter.type = type;
        }

        if (from || to) {
            filter.date = {};
            if (from) {
                const fromDate = new Date(from);
                fromDate.setHours(0, 0, 0, 0);
                filter.date.$gte = fromDate;
            }
            if (to) {
                const toDate = new Date(to);
                toDate.setHours(23, 59, 59, 999);
                filter.date.$lte = toDate;
            }
        }

        const history = await CreditHistory.find(filter)
            .populate('expenseId', 'date name amount paymentMethod')
            .sort({ date: -1 })
            .lean();

        // Calculate summary
        const summary = {
            totalAdded: 0,
            totalUsed: 0,
            netCredit: 0,
            count: history.length,
        };

        for (const record of history) {
            if (record.type === 'CREDIT_ADDED') {
                summary.totalAdded += record.amount;
            } else {
                summary.totalUsed += record.amount;
            }
        }
        summary.netCredit = summary.totalAdded - summary.totalUsed;

        res.json({
            history,
            summary,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/credit-history/:id - Delete credit history record
router.delete('/history/:id', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const { id } = req.params;
        const record = await CreditHistory.findById(id);

        if (!record) {
            return res.status(404).json({ error: 'Credit history record not found' });
        }

        // If this was a CREDIT_USED, we need to add back the amount
        if (record.type === 'CREDIT_USED') {
            const cashCredit = await getOrCreateCashCredit();
            cashCredit.totalUsed -= record.amount;
            cashCredit.remainingCredit += record.amount;
            cashCredit.lastUpdated = new Date();
            await cashCredit.save();
        } else if (record.type === 'CREDIT_ADDED') {
            // If this was a CREDIT_ADDED, reduce the total
            const cashCredit = await getOrCreateCashCredit();
            cashCredit.totalCredit -= record.amount;
            cashCredit.remainingCredit -= record.amount;
            cashCredit.lastUpdated = new Date();
            await cashCredit.save();
        }

        await CreditHistory.findByIdAndDelete(id);
        res.json({ message: 'Credit history record deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Export helper functions for use in other routes
export {
    getOrCreateCashCredit,
    getYearMonth,
    getMonthBounds,
    calculateMonthlyBalance,
    getMonthlyBalances,
};

export default router;
