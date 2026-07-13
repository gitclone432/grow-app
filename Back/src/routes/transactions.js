import express from 'express';
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import Order from '../models/Order.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createTransactionSchema, updateTransactionSchema } from '../schemas/index.js';
import PayoneerRecord from '../models/PayoneerRecord.js';
import BankAccount from '../models/BankAccount.js';
import Seller from '../models/Seller.js';
import { importTransactionsFromGmail } from '../utils/gmailTransactionImporter.js';
import { bankAccountLedgerKey, bankAccountDisplayLabel } from '../utils/bankAccountLedgerKey.js';
import { sellerMatchesBankSellersField } from '../utils/bankAccountSellerMatch.js';

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
    const dateSort =
        sortBy === 'date'
            ? { date: normalizedSortOrder, createdAt: normalizedSortOrder, _id: normalizedSortOrder }
            : { date: -1, createdAt: -1, _id: -1 };

    const groupByBank =
        !bankAccount &&
        (query.groupByBank === '1' || String(query.groupByBank).toLowerCase() === 'true');

    return { mongoQuery, sortQuery: dateSort, groupByBank };
}

/** Restrict to bank-account rows linked to the given eBay store (seller id). */
async function applySellerStoreFilter(mongoQuery, sellerId) {
    if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId))) {
        return mongoQuery;
    }

    const seller = await Seller.findById(sellerId).populate('user', 'username email').lean();
    if (!seller) {
        return { ...mongoQuery, bankAccount: { $in: [] } };
    }

    const banks = await BankAccount.find({ sellers: { $exists: true, $ne: '' } }).lean();
    const matchingIds = banks
        .filter((b) => sellerMatchesBankSellersField(b.sellers, seller))
        .map((b) => b._id);

    if (!matchingIds.length) {
        return { ...mongoQuery, bankAccount: { $in: [] } };
    }

    const next = { ...mongoQuery };
    if (next.bankAccount && !next.bankAccount.$in) {
        const selected = String(next.bankAccount);
        const ok = matchingIds.some((id) => String(id) === selected);
        next.bankAccount = ok ? next.bankAccount : { $in: [] };
    } else {
        next.bankAccount = { $in: matchingIds };
    }
    return next;
}

async function buildTransactionListQuery(reqQuery) {
    const { mongoQuery: rawQuery, sortQuery, groupByBank } = parseTransactionFilters(reqQuery);
    let query = rawQuery;

    if (reqQuery.sellerId) {
        query = await applySellerStoreFilter(query, reqQuery.sellerId);
    } else {
        query = await applyLedgerExpandedQuery(query);
    }

    return { query, sortQuery, groupByBank };
}

const CHRONO_SORT = { date: 1, createdAt: 1, _id: 1 };

const SIGNED_AMOUNT_EXPR = {
    $cond: [
        { $eq: ['$transactionType', 'Credit'] },
        { $toDouble: '$amount' },
        { $multiply: [{ $toDouble: '$amount' }, -1] }
    ]
};

function escapeRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function idsSharingLedgerKey(bank) {
    if (!bank) return [];
    const key = bankAccountLedgerKey(bank);
    const byName = await BankAccount.find({
        name: { $regex: new RegExp(`^${escapeRegex(String(bank.name || '').trim())}$`, 'i') }
    }).lean();
    return byName.filter((b) => bankAccountLedgerKey(b) === key).map((b) => b._id);
}

/** Include sibling rows (same name + account number) so balance is one ledger. */
async function expandScopeBankAccountIds(listQuery, bankObjectIds) {
    const seeds = listQuery.bankAccount
        ? [await BankAccount.findById(listQuery.bankAccount).lean()].filter(Boolean)
        : await BankAccount.find({ _id: { $in: bankObjectIds } }).lean();
    const idSet = new Set();
    for (const bank of seeds) {
        const siblings = await idsSharingLedgerKey(bank);
        for (const id of siblings) idSet.add(String(id));
    }
    return [...idSet].map((id) => new mongoose.Types.ObjectId(id));
}

/** One bank filter in UI includes all rows that share the same ledger (name + account #). */
async function applyLedgerExpandedQuery(mongoQuery) {
    const bankId = mongoQuery.bankAccount;
    if (!bankId || bankId.$in) return mongoQuery;
    const bank = await BankAccount.findById(bankId).lean();
    if (!bank) return mongoQuery;
    const ids = await idsSharingLedgerKey(bank);
    const next = { ...mongoQuery };
    next.bankAccount = { $in: ids };
    return next;
}

const BALANCE_PARTITION_EXPR = {
    $let: {
        vars: {
            n: { $toLower: { $trim: { input: { $ifNull: ['$ba.name', ''] } } } },
            acct: { $ifNull: ['$ba.accountNumber', ''] }
        },
        in: {
            $cond: [
                { $gt: [{ $strLenCP: { $toString: '$$acct' } }, 0] },
                {
                    $concat: [
                        '$$n',
                        '::',
                        {
                            $replaceAll: {
                                input: { $toString: '$$acct' },
                                find: ' ',
                                replacement: ''
                            }
                        }
                    ]
                },
                { $concat: ['$$n', '::', { $toString: '$bankAccount' }] }
            ]
        }
    }
};

/** Combined running balance across every bank (for all-accounts list sorted by date). */
async function runningPortfolioBalanceByTransactionId(transactions) {
    if (!transactions?.length) return new Map();

    const txnIds = transactions.map((t) => {
        const id = t._id || t;
        return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
    });

    const windowRows = await Transaction.aggregate([
        { $addFields: { signedAmount: SIGNED_AMOUNT_EXPR } },
        { $sort: CHRONO_SORT },
        {
            $setWindowFields: {
                sortBy: CHRONO_SORT,
                output: {
                    balance: {
                        $sum: '$signedAmount',
                        window: { documents: ['unbounded', 'current'] }
                    }
                }
            }
        },
        { $match: { _id: { $in: txnIds } } },
        { $project: { _id: 1, balance: 1 } }
    ]);

    return new Map(
        windowRows.map((r) => [String(r._id), Math.round((r.balance || 0) * 100) / 100])
    );
}

/** Running balance per ledger (merged same name + account #); full history. */
async function runningBalanceByTransactionId(transactions, listQuery = {}, options = {}) {
    const { groupByBank = false } = options;

    if (!listQuery.bankAccount && !groupByBank) {
        return runningPortfolioBalanceByTransactionId(transactions);
    }

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
    const expandedIds = await expandScopeBankAccountIds(listQuery, bankObjectIds);
    const scopeMatch = { bankAccount: { $in: expandedIds } };

    const windowRows = await Transaction.aggregate([
        { $match: scopeMatch },
        {
            $lookup: {
                from: 'bankaccounts',
                localField: 'bankAccount',
                foreignField: '_id',
                as: 'ba'
            }
        },
        { $unwind: { path: '$ba', preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                signedAmount: SIGNED_AMOUNT_EXPR,
                balancePartition: BALANCE_PARTITION_EXPR
            }
        },
        { $sort: CHRONO_SORT },
        {
            $setWindowFields: {
                partitionBy: '$balancePartition',
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
        { $project: { _id: 1, inScopeBalance: 1 } }
    ]);

    return new Map(
        windowRows.map((r) => [String(r._id), Math.round((r.inScopeBalance || 0) * 100) / 100])
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

function mapAggregateRowToTransaction(row) {
    const doc = {
        _id: row._id,
        date: row.date,
        transactionType: row.transactionType,
        amount: row.amount,
        remark: row.remark,
        source: row.source,
        sendEnabled: row.sendEnabled,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        bankAccount: row.ba
            ? {
                  _id: row.ba._id,
                  name: row.ba.name,
                  accountNumber: row.ba.accountNumber,
                  ifscCode: row.ba.ifscCode,
                  sellers: row.ba.sellers
              }
            : row.bankAccount,
        creditCardName: row.cc ? { _id: row.cc._id, name: row.cc.name } : row.creditCardName
    };
    doc.toObject = () => ({ ...doc });
    return doc;
}

async function findTransactionsPage(query, { sortQuery, skip, limitNum, groupByBank }) {
    if (!groupByBank) {
        return Transaction.find(query)
            .populate('bankAccount', 'name accountNumber ifscCode sellers')
            .populate('creditCardName', 'name')
            .sort(sortQuery)
            .skip(skip)
            .limit(limitNum);
    }

    const rows = await Transaction.aggregate([
        { $match: query },
        {
            $lookup: {
                from: 'bankaccounts',
                localField: 'bankAccount',
                foreignField: '_id',
                as: 'ba'
            }
        },
        { $unwind: { path: '$ba', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'creditcardnames',
                localField: 'creditCardName',
                foreignField: '_id',
                as: 'cc'
            }
        },
        { $unwind: { path: '$cc', preserveNullAndEmptyArrays: true } },
        { $addFields: { ledgerKey: BALANCE_PARTITION_EXPR } },
        { $sort: { ledgerKey: 1, date: 1, createdAt: 1, _id: 1 } },
        { $skip: skip },
        { $limit: limitNum }
    ]);

    return rows.map(mapAggregateRowToTransaction);
}

/** Sort export rows by date (default) or by bank then date asc (readable balance). */
function sortRowsForCsvExport(rows, sortQuery = { date: -1, createdAt: -1, _id: -1 }, groupByBank = false) {
    if (groupByBank) {
        return [...rows].sort((a, b) => {
            const bankCmp = bankAccountLedgerKey(a.bankAccount).localeCompare(
                bankAccountLedgerKey(b.bankAccount)
            );
            if (bankCmp !== 0) return bankCmp;
            const dateA = a.date ? new Date(a.date).getTime() : 0;
            const dateB = b.date ? new Date(b.date).getTime() : 0;
            if (dateA !== dateB) return dateA - dateB;
            const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            if (createdA !== createdB) return createdA - createdB;
            return String(a._id).localeCompare(String(b._id));
        });
    }

    const dateDir = sortQuery.date === 1 ? 1 : -1;
    const createdDir = sortQuery.createdAt === 1 ? 1 : -1;
    const idDir = sortQuery._id === 1 ? 1 : -1;

    return [...rows].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        if (dateA !== dateB) return (dateA - dateB) * dateDir;

        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (createdA !== createdB) return (createdA - createdB) * createdDir;

        return String(a._id).localeCompare(String(b._id)) * idDir;
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

// GET /api/transactions/balance-summary - Balance per ledger (merged same name + account #)
router.get('/balance-summary', requireAuth, requirePageAccess('Transactions'), async (req, res) => {
    try {
        const perAccount = await Transaction.aggregate([
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
            { $unwind: '$bankDetails' }
        ]);

        const groups = new Map();
        for (const row of perAccount) {
            const bank = row.bankDetails;
            const ledgerKey = bankAccountLedgerKey(bank);
            const balance = (row.totalCredit || 0) - (row.totalDebit || 0);
            const existing = groups.get(ledgerKey) || {
                _id: ledgerKey,
                ledgerKey,
                label: bankAccountDisplayLabel(bank),
                bankName: bankAccountDisplayLabel(bank),
                balance: 0,
                bankAccountIds: [],
                sellers: []
            };
            existing.balance += balance;
            existing.bankAccountIds.push(String(row._id));
            if (bank.sellers?.trim()) {
                existing.sellers.push(bank.sellers.trim());
            }
            groups.set(ledgerKey, existing);
        }

        const summary = [...groups.values()]
            .map((g) => ({
                ...g,
                balance: Math.round(g.balance * 100) / 100,
                sellers: [...new Set(g.sellers)].join('; ')
            }))
            .sort((a, b) => a.label.localeCompare(b.label));

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
        const { query, sortQuery, groupByBank } = await buildTransactionListQuery(req.query);

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const [transactions, totalTransactions, aggregateSum] = await Promise.all([
            findTransactionsPage(query, { sortQuery, skip, limitNum, groupByBank }),
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
        const balanceMap = await runningBalanceByTransactionId(transactions, query, { groupByBank });
        const balanceMode = !query.bankAccount && !groupByBank ? 'portfolio' : 'ledger';

        res.json({
            transactions: attachRunningBalances(transactions, balanceMap),
            totalPages: Math.ceil(totalTransactions / limitNum),
            currentPage: parseInt(page),
            totalTransactions,
            summary,
            listGroupByBank: Boolean(groupByBank),
            balanceMode
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

        const { query, sortQuery, groupByBank } = await buildTransactionListQuery(req.query);
        const rows = sortRowsForCsvExport(
            await Transaction.find(query)
                .populate('bankAccount', 'name accountNumber ifscCode sellers')
                .populate('creditCardName', 'name')
                .lean(),
            sortQuery,
            groupByBank
        );

        const balanceMap = await runningBalanceByTransactionId(rows, query, { groupByBank });

        const header = [
            'Date',
            'Bank Account',
            'Stores',
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
            const bank = bankAccountDisplayLabel(t.bankAccount) || t.bankAccount?.name || '';
            const stores = (t.bankAccount?.sellers || '').replace(/\r?\n/g, ' ');
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
            lines.push([dateStr, bank, stores, type, amount, balance, remark, source, card].map(csvEscape).join(','));
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
