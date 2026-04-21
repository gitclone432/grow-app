import express from 'express';
import PayoneerRecord from '../models/PayoneerRecord.js';
import Transaction from '../models/Transaction.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

// Helper to calculate fields
const calculateFields = (amount, exchangeRate) => {
    const amountNum = parseFloat(amount);
    const rateNum = parseFloat(exchangeRate);

    // Actual Exchange Rate = Rate + (Rate * 0.02)
    const actualExchangeRate = rateNum + (rateNum * 0.02);

    // Bank Deposit = Amount * Exchange Rate (NOT Actual Rate)
    const bankDeposit = amountNum * rateNum;

    return {
        amount: amountNum,
        exchangeRate: rateNum,
        actualExchangeRate: parseFloat(actualExchangeRate.toFixed(4)), // Keep decent precision
        bankDeposit: parseFloat(bankDeposit.toFixed(2)) // Currency usually 2 decimals
    };
};

// GET /api/payoneer - List all records with pagination and filtering
router.get('/', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
    try {
        const { page = 1, limit = 50, startDate, endDate, store } = req.query;

        const query = {};

        // Store Filter
        if (store) {
            query.store = store;
        }

        // Date Filter
        if (startDate || endDate) {
            query.paymentDate = {};
            if (startDate) {
                // Assuming startDate is YYYY-MM-DD
                query.paymentDate.$gte = new Date(startDate);
            }
            if (endDate) {
                // Assuming endDate is YYYY-MM-DD, set to end of day
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                query.paymentDate.$lte = end;
            }
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [records, totalRecords] = await Promise.all([
            PayoneerRecord.find(query)
                .populate({
                    path: 'store',
                    select: 'user',
                    populate: {
                        path: 'user',
                        select: 'username'
                    }
                })
                .populate('bankAccount', 'name')
                .sort({ paymentDate: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            PayoneerRecord.countDocuments(query)
        ]);

        res.json({
            records,
            totalRecords,
            totalPages: Math.ceil(totalRecords / parseInt(limit)),
            currentPage: parseInt(page)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/payoneer - Create new record
router.post('/', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
    try {
        const { bankAccount, paymentDate, amount, exchangeRate, store, periodStart, periodEnd, profit } = req.body;

        if (!bankAccount || !paymentDate || !amount || !exchangeRate || !store) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const calcs = calculateFields(amount, exchangeRate);

        const newRecord = new PayoneerRecord({
            bankAccount,
            paymentDate,
            store,
            ...calcs,
            ...(periodStart && { periodStart }),
            ...(periodEnd && { periodEnd }),
            ...(profit !== undefined && profit !== '' && { profit: parseFloat(profit) })
        });

        await newRecord.save();

        // Populate return data
        await newRecord.populate([
            {
                path: 'store',
                select: 'user',
                populate: {
                    path: 'user',
                    select: 'username'
                }
            },
            { path: 'bankAccount', select: 'name' }
        ]);

        // --- SYNC WITH TRANSACTION ---
        try {
            await Transaction.create({
                date: newRecord.paymentDate,
                bankAccount: newRecord.bankAccount._id, // Direct ID
                transactionType: 'Credit',
                amount: newRecord.bankDeposit,
                remark: 'Payoneer',
                source: 'PAYONEER',
                sourceId: newRecord._id
            });
        } catch (syncErr) {
            console.error('Failed to sync Payoneer to Transaction:', syncErr);
        }

        res.status(201).json(newRecord);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/payoneer/:id - Update record
router.put('/:id', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
    try {
        const { id } = req.params;
        const { bankAccount, paymentDate, amount, exchangeRate, store, periodStart, periodEnd, profit } = req.body;

        const record = await PayoneerRecord.findById(id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        // Update basic fields if provided
        if (bankAccount) record.bankAccount = bankAccount;
        if (paymentDate) record.paymentDate = paymentDate;
        if (store) record.store = store;
        if (periodStart !== undefined) record.periodStart = periodStart || null;
        if (periodEnd !== undefined) record.periodEnd = periodEnd || null;
        if (profit !== undefined) record.profit = profit !== '' ? parseFloat(profit) : null;

        // Recalculate if amount or rate changes
        const newAmount = amount !== undefined ? amount : record.amount;
        const newRate = exchangeRate !== undefined ? exchangeRate : record.exchangeRate;

        const calcs = calculateFields(newAmount, newRate);

        record.amount = calcs.amount;
        record.exchangeRate = calcs.exchangeRate;
        record.actualExchangeRate = calcs.actualExchangeRate;
        record.bankDeposit = calcs.bankDeposit;

        await record.save();

        await record.populate([
            {
                path: 'store',
                select: 'user',
                populate: {
                    path: 'user',
                    select: 'username'
                }
            },
            { path: 'bankAccount', select: 'name' }
        ]);

        // --- SYNC UPDATE TRANSACTION ---
        try {
            await Transaction.findOneAndUpdate(
                { source: 'PAYONEER', sourceId: record._id },
                {
                    date: record.paymentDate,
                    bankAccount: record.bankAccount._id, // Direct ID
                    amount: record.bankDeposit
                },
                { upsert: true }
            );
        } catch (syncErr) {
            console.error('Failed to sync update to Transaction:', syncErr);
        }

        res.json(record);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/payoneer/:id - Delete record
router.delete('/:id', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
    try {
        const { id } = req.params;
        await PayoneerRecord.findByIdAndDelete(id);

        // --- SYNC DELETE TRANSACTION ---
        await Transaction.findOneAndDelete({ source: 'PAYONEER', sourceId: id });

        res.json({ message: 'Record deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
