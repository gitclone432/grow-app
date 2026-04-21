import express from 'express';
import Order from '../models/Order.js';
import AmazonAccount from '../models/AmazonAccount.js';
import AmazonAccountDailyBalance from '../models/AmazonAccountDailyBalance.js';
import Seller from '../models/Seller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// PST offset used throughout the platform
const PST_OFFSET_HOURS = 8;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CARRY_OVER_START_DATE = '2026-03-10';
const MAX_ORDERS_PER_AMAZON_ACCOUNT = 9;

/**
 * Builds a UTC date range for a given YYYY-MM-DD string (PST day boundaries)
 */
function buildDayRange(dateStr) {
    const start = new Date(dateStr);
    start.setUTCHours(PST_OFFSET_HOURS, 0, 0, 0);

    const end = new Date(dateStr);
    end.setDate(end.getDate() + 1);
    end.setUTCHours(PST_OFFSET_HOURS - 1, 59, 59, 999);

    return { start, end };
}

function getPlatformDayString(dateValue) {
    const shifted = new Date(new Date(dateValue).getTime() - PST_OFFSET_HOURS * 60 * 60 * 1000);
    return shifted.toISOString().slice(0, 10);
}

function getCarryOverLabel(carryOverDays) {
    if (carryOverDays <= 0) return '';
    if (carryOverDays === 1) return 'Yesterday';
    return `${carryOverDays} days ago`;
}

function getEffectiveSpendAmount(order) {
    const amount = order?.affiliatePrice;
    return Number(amount) || 0;
}

function buildAffiliateQueueQuery(dateStr, excludeLowValue, extraFilters = [], options = {}) {
    const { start, end } = buildDayRange(dateStr);
    const carryOverStart = buildDayRange(CARRY_OVER_START_DATE).start;
    const { includeCompletedCarryOver = false } = options;
    const queueScopes = [{ dateSold: { $gte: start, $lte: end } }];

    if (start.getTime() > carryOverStart.getTime()) {
        queueScopes.push({
            dateSold: { $gte: carryOverStart, $lt: start },
            sourcingStatus: 'Not Yet',
        });

        if (includeCompletedCarryOver) {
            queueScopes.push({
                dateSold: { $gte: carryOverStart, $lt: start },
                sourcingStatus: 'Done',
                sourcingCompletedAt: { $gte: start, $lte: end },
            });
        }
    }

    const filters = [
        { $or: queueScopes },
        ...extraFilters.filter(Boolean),
    ];

    if (excludeLowValue === 'true') {
        filters.push({
            $or: [
                { subtotalUSD: { $gte: 3 } },
                { subtotal: { $gte: 3 } },
            ],
        });
    }

    return {
        start,
        end,
        query: filters.length === 1 ? filters[0] : { $and: filters },
    };
}

function buildAffiliateSpendQuery(dateStr, excludeLowValue, extraFilters = []) {
    const { start, end } = buildDayRange(dateStr);
    const filters = [
        { sourcingStatus: 'Done' },
        {
            $or: [
                { sourcingCompletedAt: { $gte: start, $lte: end } },
                {
                    sourcingCompletedAt: { $exists: false },
                    dateSold: { $gte: start, $lte: end },
                },
                {
                    sourcingCompletedAt: null,
                    dateSold: { $gte: start, $lte: end },
                },
            ],
        },
        ...extraFilters.filter(Boolean),
    ];

    if (excludeLowValue === 'true') {
        filters.push({
            $or: [
                { subtotalUSD: { $gte: 3 } },
                { subtotal: { $gte: 3 } },
            ],
        });
    }

    return {
        start,
        end,
        query: { $and: filters },
    };
}

// ---------------------------------------------------------------------------
// TAB 1 — Daily Order Sellers
// GET /api/affiliate-orders/daily/sellers?date=YYYY-MM-DD
// Returns seller options for the current daily queue filters
// ---------------------------------------------------------------------------
router.get('/daily/sellers', async (req, res) => {
    try {
        const { date, excludeLowValue, includeDone } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
        const shouldIncludeDone = includeDone === 'true';

        const extraFilters = [];
        if (!shouldIncludeDone) {
            extraFilters.push({ sourcingStatus: { $ne: 'Done' } });
        }

        const { query } = buildAffiliateQueueQuery(date, excludeLowValue, extraFilters, {
            includeCompletedCarryOver: shouldIncludeDone,
        });

        const groupedSellers = await Order.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$seller',
                    count: { $sum: 1 },
                },
            },
        ]);

        const sellerIds = groupedSellers
            .map((row) => row._id)
            .filter(Boolean);

        const sellers = await Seller.find({ _id: { $in: sellerIds } })
            .populate({ path: 'user', select: 'username' })
            .lean();

        const sellerNameById = new Map(
            sellers.map((seller) => [String(seller._id), seller.user?.username || 'Unknown Seller'])
        );

        const sellerOptions = groupedSellers
            .map((row) => ({
                value: String(row._id),
                label: sellerNameById.get(String(row._id)) || 'Unknown Seller',
                count: row.count || 0,
            }))
            .sort((left, right) => left.label.localeCompare(right.label));

        res.json(sellerOptions);
    } catch (err) {
        console.error('GET /affiliate-orders/daily/sellers error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// TAB 1 — Daily Orders
// GET /api/affiliate-orders/daily?date=YYYY-MM-DD
// Returns daily queue orders, optionally filtered by seller
// ---------------------------------------------------------------------------
router.get('/daily', async (req, res) => {
    try {
        const { date, excludeLowValue, includeDone, sellerId } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });
        const shouldIncludeDone = includeDone === 'true';

        const extraFilters = [];
        if (!shouldIncludeDone) {
            extraFilters.push({ sourcingStatus: { $ne: 'Done' } });
        }
        if (sellerId) {
            extraFilters.push({ seller: sellerId });
        }

        const { query } = buildAffiliateQueueQuery(date, excludeLowValue, extraFilters, {
            includeCompletedCarryOver: shouldIncludeDone,
        });

        const orders = await Order.find(query)
            .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
            .sort({ dateSold: 1 })
            .lean();

        const selectedDayUtc = Date.parse(`${date}T00:00:00Z`);
        const enrichedOrders = orders
            .map((order) => {
                const sourceDay = getPlatformDayString(order.dateSold || order.creationDate || new Date());
                const sourceDayUtc = Date.parse(`${sourceDay}T00:00:00Z`);
                const carryOverDays = Math.max(0, Math.round((selectedDayUtc - sourceDayUtc) / DAY_IN_MS));
                const sellerName = order.seller?.user?.username || order.sellerId || 'Unknown Seller';

                return {
                    ...order,
                    sellerGroupName: sellerName,
                    isCarryOver: carryOverDays > 0 && order.sourcingStatus === 'Not Yet',
                    carryOverDays,
                    sourceDate: sourceDay,
                    carryOverLabel: getCarryOverLabel(carryOverDays),
                };
            })
            .sort((left, right) => {
                if (left.sellerGroupName !== right.sellerGroupName) {
                    return left.sellerGroupName.localeCompare(right.sellerGroupName);
                }

                return new Date(left.dateSold || left.creationDate || 0) - new Date(right.dateSold || right.creationDate || 0);
            });

        res.json(enrichedOrders);
    } catch (err) {
        console.error('GET /affiliate-orders/daily error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// TAB 4 — Actual Spend
// GET /api/affiliate-orders/spend?date=YYYY-MM-DD
// Returns orders whose spend should be recognized on the selected day
// ---------------------------------------------------------------------------
router.get('/spend', async (req, res) => {
    try {
        const { date, excludeLowValue } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

        const { query } = buildAffiliateSpendQuery(date, excludeLowValue);

        const orders = await Order.find(query)
            .populate({ path: 'seller', populate: { path: 'user', select: 'username' } })
            .sort({ sourcingCompletedAt: 1, dateSold: 1 })
            .lean();

        const enrichedOrders = orders
            .map((order) => {
                const sellerName = order.seller?.user?.username || order.sellerId || 'Unknown Seller';

                return {
                    ...order,
                    sellerGroupName: sellerName,
                    sourceDate: getPlatformDayString(order.dateSold || order.creationDate || new Date()),
                    spendDate: getPlatformDayString(order.sourcingCompletedAt || order.dateSold || order.creationDate || new Date()),
                };
            })
            .sort((left, right) => {
                if (left.sellerGroupName !== right.sellerGroupName) {
                    return left.sellerGroupName.localeCompare(right.sellerGroupName);
                }

                return new Date(left.sourcingCompletedAt || left.dateSold || left.creationDate || 0) - new Date(right.sourcingCompletedAt || right.dateSold || right.creationDate || 0);
            });

        res.json(enrichedOrders);
    } catch (err) {
        console.error('GET /affiliate-orders/spend error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// PATCH /api/affiliate-orders/:id/sourcing
// Update the sourcing-specific fields on an order
// ---------------------------------------------------------------------------
router.patch('/:id/sourcing', async (req, res) => {
    try {
        const ALLOWED_FIELDS = [
            'affiliateLink',
            'affiliateLinks',
            'sourcingStatus',
            'purchaser',
            'sourcingMessageStatus',
            'amazonAccount',
            'affiliatePrice',
            'beforeTax',
            'estimatedTax',
            'beforeTaxUSD',
            'fulfillmentNotes',
        ];

        const update = {};
        for (const field of ALLOWED_FIELDS) {
            if (req.body[field] !== undefined) {
                update[field] = req.body[field];
            }
        }

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided' });
        }

        const existingOrder = await Order.findById(req.params.id)
            .select('sourcingStatus amazonAccount')
            .lean();

        if (!existingOrder) return res.status(404).json({ error: 'Order not found' });

        if (update.sourcingStatus !== undefined) {
            const movingToDone = existingOrder.sourcingStatus !== 'Done' && update.sourcingStatus === 'Done';
            const movingAwayFromDone = existingOrder.sourcingStatus === 'Done' && update.sourcingStatus !== 'Done';

            if (movingToDone) {
                update.sourcingCompletedAt = new Date();
            } else if (movingAwayFromDone) {
                update.sourcingCompletedAt = null;
            }
        }

        if (update.amazonAccount !== undefined) {
            if (update.amazonAccount) {
                update.amazonAccountAssignmentSource = 'affiliate';
            } else if (existingOrder.amazonAccount) {
                update.amazonAccountAssignmentSource = null;
            }
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { new: true, runValidators: true }
        ).lean();

        res.json(order);
    } catch (err) {
        console.error('PATCH /affiliate-orders/:id/sourcing error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// TAB 2 — Gift Card Balances
// GET /api/affiliate-orders/balances?date=YYYY-MM-DD
// Returns one row per Amazon account with totalExpense (auto-calculated from orders)
// and the editable balance fields (upserted on first access)
// ---------------------------------------------------------------------------
router.get('/balances', async (req, res) => {
    try {
        const { date, excludeLowValue } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

        // All Amazon accounts
        const accounts = await AmazonAccount.find().sort({ name: 1 }).lean();

        const { query: matchQuery } = buildAffiliateSpendQuery(date, excludeLowValue, [
            { amazonAccount: { $exists: true, $ne: '' } },
        ]);

        // Aggregate expense per account for this day from orders
        const expenseAgg = await Order.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$amazonAccount',
                    totalExpense: { $sum: { $ifNull: ['$affiliatePrice', 0] } },
                    orderCount: { $sum: 1 },
                },
            },
        ]);

        const expenseMap = {};
        for (const row of expenseAgg) {
            if (row._id) expenseMap[row._id] = { totalExpense: row.totalExpense, orderCount: row.orderCount };
        }

        // Fetch existing balance records for this date
        const existingBalances = await AmazonAccountDailyBalance.find({ date }).lean();
        const balanceMap = {};
        for (const b of existingBalances) {
            balanceMap[b.amazonAccountName] = b;
        }

        // Build combined response — one entry per account
        const rows = accounts.map((acc) => {
            const bal = balanceMap[acc.name] || {};
            const exp = expenseMap[acc.name] || { totalExpense: 0, orderCount: 0 };
            const availableBalance = bal.availableBalance ?? 0;
            const addedBalance = bal.addedBalance ?? 0;
            const difference = availableBalance + addedBalance - exp.totalExpense;

            return {
                _id: bal._id || null,
                amazonAccountName: acc.name,
                date,
                totalExpense: exp.totalExpense,
                orderCount: exp.orderCount,
                availableBalance,
                addedBalance,
                giftCardStatus: bal.giftCardStatus ?? false,
                note: bal.note ?? '',
                difference,
            };
        });

        res.json(rows);
    } catch (err) {
        console.error('GET /affiliate-orders/balances error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// PUT /api/affiliate-orders/balances
// Upsert a daily balance record for one Amazon account
// Body: { amazonAccountName, date, availableBalance, addedBalance, giftCardStatus, note }
// ---------------------------------------------------------------------------
router.put('/balances', async (req, res) => {
    try {
        const { amazonAccountName, date, availableBalance, addedBalance, giftCardStatus, note } = req.body;
        if (!amazonAccountName || !date) {
            return res.status(400).json({ error: 'amazonAccountName and date are required' });
        }

        const update = {};
        if (availableBalance !== undefined) update.availableBalance = availableBalance;
        if (addedBalance !== undefined) update.addedBalance = addedBalance;
        if (giftCardStatus !== undefined) update.giftCardStatus = giftCardStatus;
        if (note !== undefined) update.note = note;

        const record = await AmazonAccountDailyBalance.findOneAndUpdate(
            { amazonAccountName, date },
            { $set: update },
            { new: true, upsert: true, runValidators: true }
        ).lean();

        res.json(record);
    } catch (err) {
        console.error('PUT /affiliate-orders/balances error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// TAB 3 — Daily Summary
// GET /api/affiliate-orders/summary?date=YYYY-MM-DD
// Returns per-purchaser counts and overall day totals
// ---------------------------------------------------------------------------
router.get('/summary', async (req, res) => {
    try {
        const { date, excludeLowValue } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

        const { start, end, query: queueQuery } = buildAffiliateQueueQuery(date, excludeLowValue, [], {
            includeCompletedCarryOver: true,
        });
        const { query: spendQuery } = buildAffiliateSpendQuery(date, excludeLowValue);

        // All orders in the active sourcing queue for the selected day
        const [orders, spendOrders, balances] = await Promise.all([
            Order.find(queueQuery)
                .select('purchaser sourcingStatus affiliatePrice beforeTax estimatedTax amazonExchangeRate amazonAccount dateSold creationDate')
                .lean(),
            Order.find(spendQuery)
                .select('affiliatePrice beforeTax estimatedTax amazonExchangeRate')
                .lean(),
            AmazonAccountDailyBalance.find({ date }).lean(),
        ]);

        const totalOrders = orders.length;
        const totalUSD = spendOrders.reduce((sum, order) => sum + getEffectiveSpendAmount(order), 0);
        const ordersDone = orders.filter((o) => o.sourcingStatus === 'Done').length;
        const ordersNotDone = totalOrders - ordersDone;

        // INR: use the most recent amazonExchangeRate stored on any order that day, or 0
        const rateOrder = spendOrders.find((o) => o.amazonExchangeRate) || orders.find((o) => o.amazonExchangeRate);
        const exchangeRate = rateOrder?.amazonExchangeRate || 0;
        const totalINR = totalUSD * exchangeRate;

        // Per-purchaser breakdown
        const purchaserMap = {};
        for (const o of orders) {
            const name = o.purchaser || '(Unassigned)';
            purchaserMap[name] = (purchaserMap[name] || 0) + 1;
        }
        const byPurchaser = Object.entries(purchaserMap).map(([name, count]) => ({ name, count }));

        const amazonAccountMap = {};
        for (const o of orders) {
            const name = o.amazonAccount || '(Unassigned)';
            const orderDate = new Date(o.dateSold || o.creationDate || 0);
            const isSelectedDayOrder = orderDate >= start && orderDate <= end;

            if (!amazonAccountMap[name]) {
                amazonAccountMap[name] = {
                    queueCount: 0,
                    count: 0,
                    carryOverCount: 0,
                };
            }

            amazonAccountMap[name].queueCount += 1;
            if (isSelectedDayOrder) {
                amazonAccountMap[name].count += 1;
            } else {
                amazonAccountMap[name].carryOverCount += 1;
            }
        }
        const byAmazonAccount = Object.entries(amazonAccountMap)
            .map(([name, stats]) => {
                if (name === '(Unassigned)') {
                    return {
                        name,
                        count: stats.count,
                        queueCount: stats.queueCount,
                        carryOverCount: stats.carryOverCount,
                        remaining: null,
                        max: null,
                        isFull: false,
                    };
                }

                return {
                    name,
                    count: stats.count,
                    queueCount: stats.queueCount,
                    carryOverCount: stats.carryOverCount,
                    remaining: Math.max(MAX_ORDERS_PER_AMAZON_ACCOUNT - stats.count, 0),
                    max: MAX_ORDERS_PER_AMAZON_ACCOUNT,
                    isFull: stats.count >= MAX_ORDERS_PER_AMAZON_ACCOUNT,
                };
            })
            .sort((left, right) => left.name.localeCompare(right.name));

        // Total added balance across all accounts that day
        const totalAmountAdded = balances.reduce((s, b) => s + (b.addedBalance || 0), 0);

        res.json({
            totalOrders,
            totalUSD,
            totalINR,
            exchangeRate,
            ordersDone,
            ordersNotDone,
            totalAmountAdded,
            byPurchaser,
            byAmazonAccount,
            maxOrdersPerAmazonAccount: MAX_ORDERS_PER_AMAZON_ACCOUNT,
        });
    } catch (err) {
        console.error('GET /affiliate-orders/summary error:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
