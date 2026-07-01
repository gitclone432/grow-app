import express from 'express';
import PayoneerRecord from '../models/PayoneerRecord.js';
import Transaction from '../models/Transaction.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { importPayoneerFieldsFromGmail, applyPayoneerFieldsFromGmailUid } from '../utils/gmailPayoneerImporter.js';
import { getPTDayBoundsUTC } from '../utils/pacificDayBounds.js';

const router = express.Router();

/** YYYY-MM-DD → start of that calendar day in PT; else parse as Date. */
function normalizePaymentDateInput(v) {
  if (v == null || v === '') return v;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return getPTDayBoundsUTC(s).start;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? v : d;
}

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
        const { page = 1, limit = 50, startDate, endDate, store, bankAccount, marketplace } = req.query;

        const query = {};

        // Marketplace filter ('ebay', 'etsy', 'walmart') — default to 'ebay' for backward compatibility
        // Match records where marketplace is the specified value OR (for eBay) records with no marketplace field (legacy data)
        if (marketplace && ['ebay', 'etsy', 'walmart'].includes(marketplace)) {
            if (marketplace === 'ebay') {
                // For eBay: match 'ebay' or records with no marketplace field (backward compatibility)
                query.$or = [
                    { marketplace: 'ebay' },
                    { marketplace: { $exists: false } }
                ];
            } else {
                // For Etsy/Walmart: only match specific marketplace
                query.marketplace = marketplace;
            }
        } else if (!marketplace) {
            // Default to eBay if marketplace not specified (backward compatibility)
            query.$or = [
                { marketplace: 'ebay' },
                { marketplace: { $exists: false } }
            ];
        }

        // Bank account filter (links Bank Accounts page → Payoneer sheet)
        if (bankAccount) {
            query.bankAccount = bankAccount;
        }

        // Store Filter
        if (store) {
            query.store = store;
        }

        // Date filter: YYYY-MM-DD is interpreted as Pacific calendar day
        if (startDate || endDate) {
            query.paymentDate = {};
            if (startDate) {
                const s = String(startDate).trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                    query.paymentDate.$gte = getPTDayBoundsUTC(s).start;
                } else {
                    query.paymentDate.$gte = new Date(startDate);
                }
            }
            if (endDate) {
                const s = String(endDate).trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                    query.paymentDate.$lte = getPTDayBoundsUTC(s).end;
                } else {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    query.paymentDate.$lte = end;
                }
            }
        }

        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 2000);
        const skip = (pageNum - 1) * limitNum;

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
                .populate('bankAccount', 'name payoneerId')
                .sort({ paymentDate: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            PayoneerRecord.countDocuments(query)
        ]);

        res.json({
            records,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum) || 0,
            currentPage: pageNum
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/payoneer/import-gmail - match amount + store from Gmail and fill exchange/deposit
router.post('/import-gmail', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, Number(req.body?.limit || 50)));
        const preview = Boolean(req.body?.preview);
        const report = await importPayoneerFieldsFromGmail({ limit, preview });
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/payoneer/apply-gmail-message - apply one Gmail UID to Payoneer sheet (Gmail Tester)
router.post('/apply-gmail-message', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
    try {
        const uid = req.body?.uid;
        const preview = Boolean(req.body?.preview);
        const report = await applyPayoneerFieldsFromGmailUid(uid, { preview });
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/payoneer - Create new record
router.post('/', requireAuth, requirePageAccess('Payoneer'), async (req, res) => {
    try {
        const { bankAccount, paymentDate, amount, exchangeRate, store, periodStart, periodEnd, profit, ebayPayoutId, marketplace } = req.body;

        if (!bankAccount || !paymentDate || !amount || !exchangeRate || !store) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const marketplaceValue = marketplace && ['ebay', 'etsy', 'walmart'].includes(marketplace) ? marketplace : 'ebay';

        // Payout ID is optional, but if provided and duplicate exists, reject
        const payoutIdTrim = typeof ebayPayoutId === 'string' && ebayPayoutId.trim() ? ebayPayoutId.trim() : null;
        if (payoutIdTrim) {
            const dup = await PayoneerRecord.findOne({ ebayPayoutId: payoutIdTrim }).select('_id').lean();
            if (dup) {
                return res.status(409).json({ error: 'A Payoneer row with this eBay payout ID already exists.' });
            }
        }

        const calcs = calculateFields(amount, exchangeRate);

        const newRecord = new PayoneerRecord({
            bankAccount,
            paymentDate: normalizePaymentDateInput(paymentDate),
            store,
            marketplace: marketplaceValue,
            ...calcs,
            ...(payoutIdTrim && { ebayPayoutId: payoutIdTrim }),
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
            { path: 'bankAccount', select: 'name payoneerId' }
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
        const { bankAccount, paymentDate, amount, exchangeRate, store, periodStart, periodEnd, profit, ebayPayoutId, marketplace } = req.body;

        const record = await PayoneerRecord.findById(id);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        // Update basic fields if provided
        if (bankAccount) record.bankAccount = bankAccount;
        if (paymentDate) record.paymentDate = normalizePaymentDateInput(paymentDate);
        if (store) record.store = store;
        if (marketplace && ['ebay', 'etsy', 'walmart'].includes(marketplace)) {
            record.marketplace = marketplace;
        }
        if (ebayPayoutId !== undefined) {
            const payoutIdTrim = typeof ebayPayoutId === 'string' && ebayPayoutId.trim() ? ebayPayoutId.trim() : null;
            if (payoutIdTrim) {
                const dup = await PayoneerRecord.findOne({
                    ebayPayoutId: payoutIdTrim,
                    _id: { $ne: record._id }
                }).select('_id').lean();
                if (dup) {
                    return res.status(409).json({ error: 'Another Payoneer row already uses this eBay payout ID.' });
                }
                record.ebayPayoutId = payoutIdTrim;
            } else {
                record.ebayPayoutId = null;
            }
        }
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
            { path: 'bankAccount', select: 'name payoneerId' }
        ]);

        // --- SYNC UPDATE TRANSACTION ---
        try {
            await Transaction.findOneAndUpdate(
                { source: 'PAYONEER', sourceId: record._id },
                {
                    date: record.paymentDate,
                    bankAccount: record.bankAccount._id, // Direct ID
                    amount: record.bankDeposit,
                    transactionType: 'Credit',
                    source: 'PAYONEER',
                    sourceId: record._id,
                    remark: 'Payoneer'
                },
                { upsert: true, setDefaultsOnInsert: true }
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
