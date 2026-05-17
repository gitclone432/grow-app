import express from 'express';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createTransactionSchema, updateTransactionSchema } from '../schemas/index.js';
import PayoneerRecord from '../models/PayoneerRecord.js';
import { importTransactionsFromGmail } from '../utils/gmailTransactionImporter.js';

const router = express.Router();

async function syncPayoneerTransactions() {
    const payoneerRows = await PayoneerRecord.find({})
        .select('_id paymentDate bankAccount bankDeposit')
        .lean();

    if (!payoneerRows.length) return { synced: 0 };

    const ops = payoneerRows.map((row) => ({
        updateOne: {
            filter: { source: 'PAYONEER', sourceId: row._id },
            update: {
                $set: {
                    date: row.paymentDate,
                    bankAccount: row.bankAccount,
                    transactionType: 'Credit',
                    amount: row.bankDeposit,
                    remark: 'Payoneer',
                    source: 'PAYONEER',
                    sourceId: row._id
                },
                $setOnInsert: {
                    sendEnabled: false
                }
            },
            upsert: true
        }
    }));

    await Transaction.bulkWrite(ops, { ordered: false });
    return { synced: ops.length };
}

function parseTransactionFilters(query) {
    const {
        startDate,
        endDate,
        bankAccount,
        transactionType,
        sortBy = 'date',
        sortOrder = 'desc'
    } = query;

    const mongoQuery = {};
    if (startDate || endDate) {
        mongoQuery.date = {};
        if (startDate) mongoQuery.date.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            mongoQuery.date.$lte = end;
        }
    }
    if (bankAccount) mongoQuery.bankAccount = new mongoose.Types.ObjectId(bankAccount);
    if (transactionType) mongoQuery.transactionType = transactionType;

    const normalizedSortOrder = String(sortOrder).toLowerCase() === 'asc' ? 1 : -1;
    const sortQuery =
        sortBy === 'date'
            ? { date: normalizedSortOrder, createdAt: normalizedSortOrder, _id: normalizedSortOrder }
            : { date: -1, createdAt: -1, _id: -1 };

    return { mongoQuery, sortQuery };
}

const CHRONO_SORT = { date: 1, createdAt: 1, _id: 1 };

const SIGNED_AMOUNT_EXPR = {
    $cond: [
        { $eq: ['$transactionType', 'Credit'] },
        { $toDouble: '$amount' },
        { $multiply: [{ $toDouble: '$amount' }, -1] }
    ]
};

function balanceScopeFromListQuery(listQuery = {}, bankObjectIds) {
    const scope = { bankAccount: listQuery.bankAccount || { $in: bankObjectIds } };
    if (listQuery.date) scope.date = listQuery.date;
    return scope;
}

async function openingBalanceByBankAccount(bankObjectIds, listQuery = {}) {
    const periodStart = listQuery.date?.$gte;
    if (!periodStart || !bankObjectIds.length) return new Map();

    const accountMatch = listQuery.bankAccount
        ? { bankAccount: listQuery.bankAccount }
        : { bankAccount: { $in: bankObjectIds } };

    const rows = await Transaction.aggregate([
        {
            $match: {
                ...accountMatch,
                date: { $lt: periodStart }
            }
        },
        {
            $group: {
                _id: '$bankAccount',
                opening: { $sum: SIGNED_AMOUNT_EXPR }
            }
        }
    ]);

    return new Map(rows.map((r) => [String(r._id), Math.round((r.opening || 0) * 100) / 100]));
}

/** Running balance per bank account after each transaction (respects list bank/date filters). */
async function runningBalanceByTransactionId(transactions, listQuery = {}) {
    if (!transactions?.length) return new Map();

    const txnIds = [];
    const accountIds = new Set();

    for (const t of transactions) {
        const id = t._id || t;
        const bankAccountId = t.bankAccount?._id || t.bankAccount;
        if (!bankAccountId) continue;
        txnIds.push(id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id)));
        accountIds.add(String(bankAccountId));
    }

    if (!txnIds.length || !accountIds.size) return new Map();

    const bankObjectIds = [...accountIds].map((id) => new mongoose.Types.ObjectId(id));
    const scopeMatch = balanceScopeFromListQuery(listQuery, bankObjectIds);
    const openingByAccount = await openingBalanceByBankAccount(bankObjectIds, listQuery);

    const windowRows = await Transaction.aggregate([
        { $match: scopeMatch },
        { $sort: CHRONO_SORT },
        { $addFields: { signedAmount: SIGNED_AMOUNT_EXPR } },
        {
            $setWindowFields: {
                partitionBy: '$bankAccount',
                sortBy: CHRONO_SORT,
                output: {
                    inScopeBalance: {
                        $sum: '$signedAmount',
                        window: { documents: ['unbounded', 'current'] }
                    }
                }
            }
        },
        { $match: { _id: { $in: txnIds } } },
        { $project: { _id: 1, bankAccount: 1, inScopeBalance: 1 } }
    ]);

    return new Map(
        windowRows.map((r) => {
            const opening = openingByAccount.get(String(r.bankAccount)) || 0;
            const balance = (r.inScopeBalance || 0) + opening;
            return [String(r._id), Math.round(balance * 100) / 100];
        })
    );
}

function attachRunningBalances(transactions, balanceMap) {
    return transactions.map((t) => {
        const plain = typeof t.toObject === 'function' ? t.toObject() : { ...t };
        const key = String(plain._id);
        plain.balance = balanceMap.has(key) ? balanceMap.get(key) : null;
        return plain;
    });
}

function csvEscape(cell) {
    if (cell === null || cell === undefined) return '';
    const s = String(cell);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

// GET /api/transactions/balance-summary - Get balance per bank account
router.get('/balance-summary', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        const summary = await Transaction.aggregate([
            {
                $group: {
                    _id: '$bankAccount',
                    totalCredit: {
                        $sum: {
                            $cond: [{ $eq: ['$transactionType', 'Credit'] }, '$amount', 0]
                        }
                    },
                    totalDebit: {
                        $sum: {
                            $cond: [{ $eq: ['$transactionType', 'Debit'] }, '$amount', 0]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'bankaccounts',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'bankDetails'
                }
            },
            {
                $unwind: '$bankDetails'
            },
            {
                $project: {
                    bankName: '$bankDetails.name',
                    balance: { $subtract: ['$totalCredit', '$totalDebit'] }
                }
            },
            {
                $sort: { bankName: 1 }
            }
        ]);
        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/transactions/credit-card-summary
router.get('/credit-card-summary', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        // Step 1: Get total transferred TO each credit card via transactions
        const transactionSummary = await Transaction.aggregate([
            {
                $match: {
                    creditCardName: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: '$creditCardName',
                    totalTransferred: { $sum: '$amount' }
                }
            },
            {
                $lookup: {
                    from: 'creditcardnames',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'cardDetails'
                }
            },
            {
                $unwind: '$cardDetails'
            },
            {
                $project: {
                    _id: 1,
                    cardName: '$cardDetails.name',
                    totalTransferred: 1
                }
            }
        ]);

        // Step 2: Get total spent FROM each credit card via orders
        const orderSummary = await Order.aggregate([
            {
                $match: {
                    cardName: { $exists: true, $ne: null, $ne: '' }
                }
            },
            {
                $group: {
                    _id: '$cardName',
                    totalSpent: {
                        $sum: {
                            $add: [
                                { $ifNull: ['$amazonTotalINR', 0] },
                                { $ifNull: ['$totalCC', 0] }
                            ]
                        }
                    }
                }
            }
        ]);

        // Step 3: Combine and calculate remaining balance
        const summary = transactionSummary.map(trans => {
            const orderData = orderSummary.find(order => order._id === trans.cardName);
            const totalSpent = orderData ? orderData.totalSpent : 0;
            
            return {
                _id: trans._id,
                cardName: trans.cardName,
                totalTransferred: trans.totalTransferred,
                totalSpent: totalSpent,
                balance: trans.totalTransferred - totalSpent
            };
        });

        res.json(summary);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/transactions/import-gmail - Import unread Gmail credits into transactions
router.post('/import-gmail', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(100, Number(req.body?.limit || 25)));
        const report = await importTransactionsFromGmail({ limit });
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/transactions/:id/send-toggle - Toggle Send for PAYONEER rows
router.patch('/:id/send-toggle', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        const { id } = req.params;
        const enabled = Boolean(req.body?.enabled);

        const tx = await Transaction.findById(id);
        if (!tx) return res.status(404).json({ error: 'Transaction not found' });
        if (tx.source !== 'PAYONEER') {
            return res.status(400).json({ error: 'Send toggle is only available for Payoneer transactions.' });
        }

        tx.sendEnabled = enabled;
        await tx.save();
        return res.json({ success: true, transaction: tx });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// GET /api/transactions - List all
router.get('/', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        try {
            await syncPayoneerTransactions();
        } catch (syncErr) {
            console.error('Failed syncing Payoneer transactions before listing:', syncErr);
        }

        const { page = 1, limit = 50 } = req.query;
        const { mongoQuery: query, sortQuery } = parseTransactionFilters(req.query);

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const [transactions, totalTransactions, aggregateSum] = await Promise.all([
            Transaction.find(query)
                .populate('bankAccount', 'name')
                .populate('creditCardName', 'name')
                .sort(sortQuery)
                .skip(skip)
                .limit(limitNum),
            Transaction.countDocuments(query),
            Transaction.aggregate([
                { $match: query },
                {
                    $group: {
                        _id: null,
                        totalCredit: {
                            $sum: { $cond: [{ $eq: ['$transactionType', 'Credit'] }, '$amount', 0] }
                        },
                        totalDebit: {
                            $sum: { $cond: [{ $eq: ['$transactionType', 'Debit'] }, '$amount', 0] }
                        }
                    }
                }
            ])
        ]);

        const summary = aggregateSum[0] || { totalCredit: 0, totalDebit: 0 };
        const balanceMap = await runningBalanceByTransactionId(transactions, query);

        res.json({
            transactions: attachRunningBalances(transactions, balanceMap),
            totalPages: Math.ceil(totalTransactions / limitNum),
            currentPage: parseInt(page),
            totalTransactions,
            summary
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/transactions/export-csv — all rows matching list filters (no pagination)
router.get('/export-csv', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        try {
            await syncPayoneerTransactions();
        } catch (syncErr) {
            console.error('Failed syncing Payoneer transactions before CSV export:', syncErr);
        }

        const { mongoQuery, sortQuery } = parseTransactionFilters(req.query);
        const rows = await Transaction.find(mongoQuery)
            .populate('bankAccount', 'name')
            .populate('creditCardName', 'name')
            .sort(sortQuery)
            .lean();

        const balanceMap = await runningBalanceByTransactionId(rows, mongoQuery);

        const header = [
            'Date',
            'Bank Account',
            'Type',
            'Amount (INR)',
            'Balance (INR)',
            'Remark',
            'Source',
            'Bank Account/Name'
        ];
        const lines = [header.map(csvEscape).join(',')];

        for (const t of rows) {
            const dateStr = t.date ? new Date(t.date).toISOString().slice(0, 10) : '';
            const bank = t.bankAccount?.name || '';
            const type = t.transactionType || '';
            const amount =
                typeof t.amount === 'number' ? t.amount.toFixed(2) : String(t.amount ?? '');
            const balanceVal = balanceMap.get(String(t._id));
            const balance =
                typeof balanceVal === 'number' ? balanceVal.toFixed(2) : '';
            const remark = (t.remark || '').replace(/\r?\n/g, ' ');
            const source =
                t.source === 'PAYONEER' ? 'payoneer' : t.source === 'MANUAL' ? 'manual' : t.source || '';
            const card = t.creditCardName?.name || '';
            lines.push([dateStr, bank, type, amount, balance, remark, source, card].map(csvEscape).join(','));
        }

        const csv = `\uFEFF${lines.join('\r\n')}`;
        const filename = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/transactions - Create Manual Transaction
router.post('/', requireAuth, requirePageAccess('Transactions'), validate(createTransactionSchema), async (req, res) => {
    try {
        const { date, bankAccount, transactionType, amount, remark, creditCardName } = req.body;

        if (!date || !bankAccount || !transactionType || !amount) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const newTransaction = new Transaction({
            date,
            bankAccount,
            transactionType,
            amount,
            remark,
            source: 'MANUAL',
            creditCardName: transactionType === 'Debit' && creditCardName ? creditCardName : undefined
        });

        await newTransaction.save();
        await newTransaction.populate('bankAccount', 'name');
        await newTransaction.populate('creditCardName', 'name');

        res.status(201).json(newTransaction);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/transactions/:id - Update Manual Transaction
router.put('/:id', requireAuth, requirePageAccess('Transactions'), validate(updateTransactionSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const { date, bankAccount, transactionType, amount, remark, creditCardName } = req.body;

        const transaction = await Transaction.findById(id);
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

        if (transaction.source === 'PAYONEER') {
            if (!date && remark === undefined) {
                return res.status(400).json({ error: 'Only date and remark can be edited for Payoneer transactions.' });
            }

            if (date) transaction.date = date;
            if (remark !== undefined) transaction.remark = remark;
            await transaction.save();

            if (transaction.sourceId) {
                await PayoneerRecord.findByIdAndUpdate(transaction.sourceId, { paymentDate: date });
            }

            await transaction.populate('bankAccount', 'name');
            await transaction.populate('creditCardName', 'name');
            return res.json(transaction);
        }

        if (transaction.source !== 'MANUAL') {
            return res.status(403).json({ error: 'Cannot edit this auto-generated transaction manually.' });
        }

        if (date) transaction.date = date;
        if (bankAccount) transaction.bankAccount = bankAccount;
        if (transactionType) transaction.transactionType = transactionType;
        if (amount) transaction.amount = amount;
        if (remark !== undefined) transaction.remark = remark;
        if (creditCardName !== undefined) transaction.creditCardName = transactionType === 'Debit' && creditCardName ? creditCardName : undefined;

        await transaction.save();
        await transaction.populate('bankAccount', 'name');
        await transaction.populate('creditCardName', 'name');

        res.json(transaction);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/transactions/:id - Delete Manual Transaction
router.delete('/:id', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await Transaction.findById(id);

        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

        if (transaction.source !== 'MANUAL') {
            return res.status(403).json({ error: 'Cannot delete auto-generated transactions manually.' });
        }

        await Transaction.findByIdAndDelete(id);
        res.json({ message: 'Transaction deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
