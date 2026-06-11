import express from 'express';
import mongoose from 'mongoose';
import ExtraExpense from '../models/ExtraExpense.js';
import CashCredit from '../models/CashCredit.js';
import CreditHistory from '../models/CreditHistory.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createExtraExpenseSchema, updateExtraExpenseSchema } from '../schemas/index.js';
import { 
    getOrCreateCashCredit, 
    getYearMonth, 
    getMonthBounds, 
    calculateMonthlyBalance, 
    getMonthlyBalances 
} from './cashCredit.js';

const router = express.Router();

// Category mapping: old individual names → new group names
const CATEGORY_MAP = {
    'Salaries': 'Fixed Expenses',
    'Office & Supplies': 'Fixed Expenses',
    'Office Expense': 'Fixed Expenses',
    'Utilities': 'Variable Expenses',
    'Pantry & Refreshments': 'Variable Expenses',
    'Puja Expense': 'Other Expenses',
    'Uncategorized': 'Other Expenses',
    '__uncategorized__': 'Other Expenses'
};

// Get all old category names that map to a new category group
function getOldCategoriesForNewCategory(newCat) {
    if (!newCat) return [];
    return Object.keys(CATEGORY_MAP).filter(old => CATEGORY_MAP[old] === newCat);
}

function escapeCsvCell(value) {
    const s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function startOfMonth(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfYear(d = new Date()) {
    return new Date(d.getFullYear(), 0, 1);
}

function endOfMonth(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function endOfYear(d = new Date()) {
    return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function sameCalendarMonth(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function sameCalendarYear(a, b) {
    return a.getFullYear() === b.getFullYear();
}

function summaryFromExpenses(expenses, rangeStart, rangeEnd) {
    let total = 0;
    let count = 0;
    for (const e of expenses) {
        const d = e.date ? new Date(e.date) : null;
        if (!d || Number.isNaN(d.getTime())) continue;
        if (rangeStart && d < rangeStart) continue;
        if (rangeEnd && d > rangeEnd) continue;
        total += Number(e.amount) || 0;
        count += 1;
    }
    return {
        total: Math.round(total * 100) / 100,
        count,
    };
}

function getFilterDateBounds(filter) {
    const date = filter?.date;
    if (!date) return null;
    return {
        start: date.$gte instanceof Date ? date.$gte : null,
        end: date.$lte instanceof Date ? date.$lte : null,
    };
}

function buildListFilter(query) {
    const filter = {};
    const dateBounds = {};

    const dateOnly = String(query.date || '').trim();
    if (dateOnly) {
        const day = new Date(dateOnly);
        if (!Number.isNaN(day.getTime())) {
            const dayStart = new Date(day);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(day);
            dayEnd.setHours(23, 59, 59, 999);
            dateBounds.$gte = dayStart;
            dateBounds.$lte = dayEnd;
        }
    }

    const from = String(query.from || '').trim();
    const to = String(query.to || '').trim();
    if (from) {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
            fromDate.setHours(0, 0, 0, 0);
            dateBounds.$gte = dateBounds.$gte
                ? new Date(Math.max(dateBounds.$gte.getTime(), fromDate.getTime()))
                : fromDate;
        }
    }
    if (to) {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
            toDate.setHours(23, 59, 59, 999);
            dateBounds.$lte = dateBounds.$lte
                ? new Date(Math.min(dateBounds.$lte.getTime(), toDate.getTime()))
                : toDate;
        }
    }

    if (dateBounds.$gte || dateBounds.$lte) {
        filter.date = {};
        if (dateBounds.$gte) filter.date.$gte = dateBounds.$gte;
        if (dateBounds.$lte) filter.date.$lte = dateBounds.$lte;
    }

    const paidBy = String(query.paidBy || '').trim();
    if (paidBy) filter.paidBy = paidBy;

    // Handle category filtering
    // Support: categories array (old names), category (new name), or groupCategory (new name)
    const rawCategories = query.categories || query['categories[]'] || null;
    let categories = [];
    if (Array.isArray(rawCategories)) {
        categories = rawCategories.slice();
    } else if (typeof rawCategories === 'string' && rawCategories.trim()) {
        categories = rawCategories.split(',').map(s => s.trim()).filter(Boolean);
    }

    let category = String(query.category || '').trim();
    const groupCategory = String(query.groupCategory || '').trim();

    // If a group category (new name) is specified, convert to old names and add the new name too
    if (groupCategory && !categories.length && !category) {
        const oldCats = getOldCategoriesForNewCategory(groupCategory);
        // Match both the new name (in case DB stores it) and old names
        categories = [groupCategory, ...oldCats];
    }

    if (categories.length > 0) {
        // Filter by multiple category names (match any)
        filter.category = { $in: categories };
    } else if (category) {
        // Single category: match the new name OR old names that map to it
        if (category === '__uncategorized__') {
            filter.$or = [{ category: { $exists: false } }, { category: null }, { category: '' }];
        } else {
            const oldCats = getOldCategoriesForNewCategory(category);
            const allMatches = [category, ...oldCats];  // Match both new and old names
            filter.category = { $in: allMatches };
        }
    }

    const search = String(query.search || '').trim();
    if (search) {
        filter.name = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    return filter;
}

function aggregateByMonth(expenses) {
    const map = new Map();
    for (const row of expenses) {
        const d = row.date ? new Date(row.date) : null;
        if (!d || Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const prev = map.get(key) || { month: key, amount: 0, count: 0 };
        prev.amount += Number(row.amount) || 0;
        prev.count += 1;
        map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

function aggregateByCategory(expenses) {
    const map = new Map();
    for (const row of expenses) {
        const key = String(row.category || '').trim() || 'Uncategorized';
        const prev = map.get(key) || { category: key, amount: 0, count: 0 };
        prev.amount += Number(row.amount) || 0;
        prev.count += 1;
        map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
}

function normalizeExpensePayload(body) {
    const bankAccountRaw = body.bankAccount;
    let bankAccount = null;
    if (bankAccountRaw && String(bankAccountRaw).trim() && mongoose.Types.ObjectId.isValid(bankAccountRaw)) {
        bankAccount = bankAccountRaw;
    }
    return {
        date: body.date,
        name: body.name,
        amount: body.amount,
        paidBy: body.paidBy,
        category: String(body.category || '').trim(),
        remark: String(body.remark || '').trim(),
        paymentMethod: String(body.paymentMethod || '').trim(),
        bankAccount,
    };
}

// GET /api/extra-expenses — list with filters, summary, charts
router.get('/', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const filter = buildListFilter(req.query);
        const expenses = await ExtraExpense.find(filter)
            .populate('bankAccount', 'name accountNumber')
            .sort({ date: -1 })
            .lean();

        const filteredTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

        const now = new Date();
        let monthSummary = summaryFromExpenses(expenses, startOfMonth(now), endOfMonth(now));
        let yearSummary = summaryFromExpenses(expenses, startOfYear(now), endOfYear(now));

        const dateBounds = getFilterDateBounds(filter);
        if (dateBounds?.start && dateBounds?.end) {
            if (sameCalendarMonth(dateBounds.start, dateBounds.end)) {
                monthSummary = summaryFromExpenses(expenses, dateBounds.start, dateBounds.end);
            }
            if (sameCalendarYear(dateBounds.start, dateBounds.end)) {
                yearSummary = summaryFromExpenses(expenses, dateBounds.start, dateBounds.end);
            }
        }

        const paidByOptions = await ExtraExpense.distinct('paidBy');
        const categoryOptions = await ExtraExpense.distinct('category');

        // Get current credit information
        const cashCredit = await getOrCreateCashCredit();

        res.json({
            expenses,
            summary: {
                filteredTotal: Math.round(filteredTotal * 100) / 100,
                filteredCount: expenses.length,
                monthTotal: monthSummary.total,
                monthCount: monthSummary.count,
                yearTotal: yearSummary.total,
                yearCount: yearSummary.count,
            },
            charts: {
                byMonth: aggregateByMonth(expenses),
                byCategory: aggregateByCategory(expenses),
            },
            filters: {
                paidByOptions: paidByOptions.filter(Boolean).sort(),
                categoryOptions: categoryOptions.filter(Boolean).sort(),
            },
            credit: cashCredit,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/extra-expenses/export-csv
router.get('/export-csv', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const filter = buildListFilter(req.query);
        const expenses = await ExtraExpense.find(filter)
            .populate('bankAccount', 'name accountNumber')
            .sort({ date: -1 })
            .lean();

        const header = [
            'Date',
            'Name of Expenditure',
            'Category',
            'Amount (INR)',
            'Paid By',
            'Payment Method',
            'Remark',
        ];
        const lines = [header.join(',')];
        for (const e of expenses) {
            lines.push([
                e.date ? new Date(e.date).toISOString().slice(0, 10) : '',
                e.name,
                e.category || '',
                Number(e.amount || 0).toFixed(2),
                e.paidBy,
                e.paymentMethod || '',
                e.remark || '',
            ].map(escapeCsvCell).join(','));
        }

        const filename = `extra-expenses-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(`\uFEFF${lines.join('\n')}`);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/extra-expenses - Create
router.post('/', requireAuth, requirePageAccess('ExtraExpenses'), validate(createExtraExpenseSchema), async (req, res) => {
    try {
        const payload = normalizeExpensePayload(req.body);
        if (!payload.date || !payload.name || payload.amount == null || !payload.paidBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const expense = new ExtraExpense(payload);
        await expense.save();
        await expense.populate('bankAccount', 'name accountNumber');

        // If payment method is 'Cash', deduct from credit
        if (payload.paymentMethod && payload.paymentMethod.toLowerCase() === 'cash') {
            const expenseMonth = getYearMonth(payload.date);
            const monthlyBalances = await getMonthlyBalances();
            
            // Find balance for this month
            let monthBalance = monthlyBalances.find(m => m.yearMonth === expenseMonth);
            
            // If no credit added yet for this month, create it
            if (!monthBalance) {
                monthBalance = await calculateMonthlyBalance(expenseMonth);
            }

            // Check if sufficient credit available in this month
            if (monthBalance.netBalance < payload.amount) {
                // Delete the expense since there's insufficient credit
                await ExtraExpense.findByIdAndDelete(expense._id);
                return res.status(400).json({ 
                    error: `Insufficient credit for ${expenseMonth}. Available: ${monthBalance.netBalance}, Required: ${payload.amount}` 
                });
            }

            // Update global cash credit
            const cashCredit = await getOrCreateCashCredit();
            cashCredit.totalUsed += payload.amount;
            cashCredit.lastUpdated = new Date();
            await cashCredit.save();

            // Create credit history record
            const history = new CreditHistory({
                type: 'CREDIT_USED',
                amount: payload.amount,
                date: new Date(payload.date),
                expenseId: expense._id,
                remarks: `Cash expense: ${payload.name}`,
                balanceAfter: 0, // Will recalculate
            });
            await history.save();

            // Recalculate remaining balance from all months
            const allMonths = await getMonthlyBalances();
            const totalExpensesAll = allMonths.reduce((sum, m) => sum + m.cashExpenses, 0);
            
            cashCredit.remainingCredit = cashCredit.totalCredit - totalExpensesAll;
            await cashCredit.save();

            // Update history with final balance
            history.balanceAfter = cashCredit.remainingCredit;
            await history.save();
        }

        res.status(201).json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/extra-expenses/:id - Update
router.put('/:id', requireAuth, requirePageAccess('ExtraExpenses'), validate(updateExtraExpenseSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const expense = await ExtraExpense.findById(id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        const oldPaymentMethod = expense.paymentMethod;
        const oldAmount = expense.amount;
        const newPaymentMethod = req.body.paymentMethod !== undefined ? String(req.body.paymentMethod || '').trim() : oldPaymentMethod;
        const newAmount = req.body.amount !== undefined ? Number(req.body.amount) : oldAmount;

        if (req.body.date !== undefined) expense.date = req.body.date;
        if (req.body.name !== undefined) expense.name = req.body.name;
        if (req.body.amount !== undefined) expense.amount = req.body.amount;
        if (req.body.paidBy !== undefined) expense.paidBy = req.body.paidBy;
        if (req.body.category !== undefined) expense.category = String(req.body.category || '').trim();
        if (req.body.remark !== undefined) expense.remark = String(req.body.remark || '').trim();
        if (req.body.paymentMethod !== undefined) expense.paymentMethod = String(req.body.paymentMethod || '').trim();
        if (req.body.bankAccount !== undefined) {
            const raw = req.body.bankAccount;
            expense.bankAccount =
                raw && String(raw).trim() && mongoose.Types.ObjectId.isValid(raw) ? raw : null;
        }

        // Handle credit adjustments
        const wasCardExpense = oldPaymentMethod && oldPaymentMethod.toLowerCase() === 'cash';
        const isNowCashExpense = newPaymentMethod && newPaymentMethod.toLowerCase() === 'cash';
        const amountChanged = oldAmount !== newAmount;

        if (wasCardExpense || isNowCashExpense || amountChanged) {
            const expenseDate = req.body.date || expense.date;
            const expenseMonth = getYearMonth(expenseDate);

            // If it was a cash expense before, remove the old deduction
            if (wasCardExpense) {
                await CreditHistory.findOneAndDelete({
                    expenseId: id,
                    type: 'CREDIT_USED',
                });
            }

            // If it's now a cash expense, check and deduct the new amount
            if (isNowCashExpense) {
                const monthlyBalances = await getMonthlyBalances();
                
                // Find balance for this month
                let monthBalance = monthlyBalances.find(m => m.yearMonth === expenseMonth);
                
                // If no credit added yet for this month, create it
                if (!monthBalance) {
                    monthBalance = await calculateMonthlyBalance(expenseMonth);
                }

                // Check if sufficient credit available in this month
                if (monthBalance.netBalance < newAmount) {
                    return res.status(400).json({ 
                        error: `Insufficient credit for ${expenseMonth}. Available: ${monthBalance.netBalance}, Required: ${newAmount}` 
                    });
                }

                // Create new credit history for the updated expense
                const history = new CreditHistory({
                    type: 'CREDIT_USED',
                    amount: newAmount,
                    date: new Date(expenseDate),
                    expenseId: id,
                    remarks: `Cash expense: ${expense.name}`,
                    balanceAfter: 0, // Will recalculate
                });
                await history.save();
            }

            // Recalculate global totals
            const cashCredit = await getOrCreateCashCredit();
            
            // Recalculate totalUsed = sum of all cash expenses across all months
            const allMonths = await getMonthlyBalances();
            const totalExpensesAll = allMonths.reduce((sum, m) => sum + m.cashExpenses, 0);
            
            cashCredit.totalUsed = totalExpensesAll;
            cashCredit.remainingCredit = cashCredit.totalCredit - totalExpensesAll;
            
            cashCredit.lastUpdated = new Date();
            await cashCredit.save();
        }

        await expense.save();
        await expense.populate('bankAccount', 'name accountNumber');
        res.json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/extra-expenses/:id - Delete
router.delete('/:id', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const { id } = req.params;
        const expense = await ExtraExpense.findById(id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        // Delete the expense first so monthly aggregations exclude it
        await ExtraExpense.findByIdAndDelete(id);

        // If this was a cash expense, remove the credit history record and recalculate totals
        if (expense.paymentMethod && expense.paymentMethod.toLowerCase() === 'cash') {
            await CreditHistory.findOneAndDelete({
                expenseId: id,
                type: 'CREDIT_USED',
            });

            // Recalculate global totals from remaining records
            const cashCredit = await getOrCreateCashCredit();
            // Recalculate totalUsed = sum of all cash expenses across all months
            const allMonths = await getMonthlyBalances();
            const totalExpensesAll = allMonths.reduce((sum, m) => sum + m.cashExpenses, 0);

            cashCredit.totalUsed = totalExpensesAll;
            cashCredit.remainingCredit = cashCredit.totalCredit - totalExpensesAll;

            cashCredit.lastUpdated = new Date();
            await cashCredit.save();
        }
        res.json({ message: 'Expense deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
