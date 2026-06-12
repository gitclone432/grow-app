import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import AmazonAccount from '../models/AmazonAccount.js';
import AmazonAccountDailyBalance from '../models/AmazonAccountDailyBalance.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { applyAffiliateSupplierLinks } from '../utils/supplierLinkFromListings.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

const PT_TIMEZONE = 'America/Los_Angeles';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const CARRY_OVER_START_DATE = '2026-03-10';
const MAX_CARRY_OVER_DAYS = Math.max(
    7,
    Math.min(120, Number(process.env.AFFILIATE_CARRY_OVER_MAX_DAYS || 45))
);
const MAX_DAILY_ORDERS = Math.max(
    500,
    Math.min(10000, Number(process.env.AFFILIATE_DAILY_MAX_ROWS || 4000))
);
const DEFAULT_AFFILIATE_PAGE_SIZE = Math.max(
    10,
    Math.min(200, Number(process.env.AFFILIATE_DAILY_PAGE_SIZE || 50))
);
const MAX_DAILY_RANGE_DAYS = Math.max(
    1,
    Math.min(90, Number(process.env.AFFILIATE_DAILY_MAX_RANGE_DAYS || 14))
);
const MAX_ORDERS_PER_AMAZON_ACCOUNT = 9;
const AFFILIATE_DAILY_SELECT = [
    'orderId',
    'dateSold',
    'creationDate',
    'itemNumber',
    'productName',
    'affiliateLink',
    'affiliateLinks',
    'affiliatePrice',
    'amazonAccount',
    'arrivingDate',
    'beforeTax',
    'estimatedTax',
    'azOrderId',
    'sourcingStatus',
    'sourcingCompletedAt',
    'purchaser',
    'sourcingMessageStatus',
    'fulfillmentNotes',
    'shippingFullName',
    'buyer',
    'lineItems',
    'seller',
    'subtotal',
    'subtotalUSD',
    'sku',
].join(' ');

function slimLineItems(lineItems) {
    const first = Array.isArray(lineItems) ? lineItems[0] : null;
    if (!first) return [];
    return [{
        title: first.title || '',
        legacyItemId: first.legacyItemId || first.itemId || '',
        sku: first.sku || first.SKU || '',
    }];
}

function slimAffiliateOrderResponse(order) {
    const seller = order?.seller;
    return {
        ...order,
        lineItems: slimLineItems(order?.lineItems),
        buyer: order?.buyer?.username != null ? { username: order.buyer.username } : order?.buyer,
        seller: seller && typeof seller === 'object'
            ? {
                _id: seller._id,
                user: seller.user?.username != null ? { username: seller.user.username } : seller.user,
            }
            : seller,
    };
}

/**
 * Builds UTC day bounds for a given YYYY-MM-DD in Pacific timezone (PST/PDT aware)
 */
function buildDayRange(dateStr) {
    function findMidnightUTC(ds) {
        const pdt = new Date(`${ds}T07:00:00.000Z`);
        const ptStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: PT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(pdt);
        const ptHour = parseInt(new Intl.DateTimeFormat('en-US', {
            timeZone: PT_TIMEZONE, hour: 'numeric', hour12: false, hourCycle: 'h23'
        }).format(pdt), 10);
        if (ptStr === ds && ptHour === 0) return pdt;
        return new Date(`${ds}T08:00:00.000Z`); // PST fallback
    }

    const start = findMidnightUTC(dateStr);
    const tmp = new Date(`${dateStr}T12:00:00.000Z`);
    tmp.setUTCDate(tmp.getUTCDate() + 1);
    const nextDateStr = tmp.toISOString().slice(0, 10);
    const end = new Date(findMidnightUTC(nextDateStr).getTime() - 1);
    return { start, end };
}

function getPlatformDayString(dateValue) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: PT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(dateValue));
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

function resolveDateWindowFromQuery({ date, startDate, endDate }) {
    if (startDate || endDate) {
        const resolvedStart = startDate || endDate;
        const resolvedEnd = endDate || startDate;
        const startUtc = Date.parse(`${resolvedStart}T00:00:00Z`);
        const endUtc = Date.parse(`${resolvedEnd}T00:00:00Z`);
        if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc)) {
            return null;
        }
        const spanDays = Math.round(Math.abs(endUtc - startUtc) / DAY_IN_MS) + 1;
        if (spanDays > MAX_DAILY_RANGE_DAYS) {
            const err = new Error(
                `Date range too large (${spanDays} days). Maximum is ${MAX_DAILY_RANGE_DAYS} days.`
            );
            err.statusCode = 400;
            throw err;
        }
        return { startDate: resolvedStart, endDate: resolvedEnd };
    }
    if (date) {
        return { startDate: date, endDate: date };
    }
    return null;
}

function getEffectiveCarryOverStart(rangeStart) {
    const carryOverStart = buildDayRange(CARRY_OVER_START_DATE).start;
    const cappedStart = new Date(rangeStart.getTime() - MAX_CARRY_OVER_DAYS * DAY_IN_MS);
    return new Date(Math.max(carryOverStart.getTime(), cappedStart.getTime()));
}

async function attachSellersToOrders(orders = []) {
    if (!orders.length) return orders;

    const sellerIds = [
        ...new Set(
            orders
                .map((order) => {
                    const seller = order?.seller;
                    if (seller && typeof seller === 'object' && seller._id) {
                        return String(seller._id);
                    }
                    if (seller) return String(seller);
                    return '';
                })
                .filter(Boolean)
        ),
    ];

    if (!sellerIds.length) return orders;

    const sellers = await Seller.find({ _id: { $in: sellerIds } })
        .select('_id user')
        .populate({ path: 'user', select: 'username' })
        .lean();

    const sellerById = new Map(sellers.map((seller) => [String(seller._id), seller]));

    return orders.map((order) => {
        const sellerId = String(order?.seller?._id || order?.seller || '');
        const seller = sellerById.get(sellerId);
        return seller ? { ...order, seller } : order;
    });
}

// Persist supplier links for old orders by matching seller+SKU with Listings Database (TemplateListing).
router.post('/backfill-supplier-links', async (req, res) => {
    try {
        const { sellerId, limit = 2000 } = req.body || {};
        const filter = {
            $or: [
                { affiliateLink: { $exists: false } },
                { affiliateLink: null },
                { affiliateLink: '' },
            ],
        };
        if (sellerId) filter.seller = sellerId;

        const orders = await Order.find(filter)
            .select('seller lineItems itemNumber affiliateLink sku')
            .sort({ createdAt: -1 })
            .limit(Math.max(1, Math.min(Number(limit) || 2000, 10000)))
            .lean();

        const ordersWithSellers = await attachSellersToOrders(orders);
        const enriched = await applyAffiliateSupplierLinks(ordersWithSellers);
        const updates = enriched
            .filter((row) => String(row.affiliateLink || '').trim())
            .map((row) => ({
                updateOne: {
                    filter: { _id: row._id },
                    update: { $set: { affiliateLink: row.affiliateLink } },
                },
            }));

        if (updates.length > 0) {
            await Order.bulkWrite(updates, { ordered: false });
        }

        return res.json({
            scanned: orders.length,
            updated: updates.length,
            message: `Supplier link backfill complete. Updated ${updates.length} order(s).`,
        });
    } catch (err) {
        console.error('POST /affiliate-orders/backfill-supplier-links error:', err);
        return res.status(500).json({ error: err.message });
    }
});

function buildAffiliateQueueQuery(dateStr, excludeLowValue, extraFilters = [], options = {}) {
    const { start, end } = buildDayRange(dateStr);
    const effectiveCarryOverStart = getEffectiveCarryOverStart(start);
    const { includeCompletedCarryOver = false } = options;
    const queueScopes = [{ dateSold: { $gte: start, $lte: end } }];

    if (start.getTime() > effectiveCarryOverStart.getTime()) {
        queueScopes.push({
            dateSold: { $gte: effectiveCarryOverStart, $lt: start },
            sourcingStatus: 'Not Yet',
        });

        if (includeCompletedCarryOver) {
            queueScopes.push({
                dateSold: { $gte: effectiveCarryOverStart, $lt: start },
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

function buildAffiliateQueueQueryForRange(startDateStr, endDateStr, excludeLowValue, extraFilters = [], options = {}) {
    const { start, end } = {
        start: buildDayRange(startDateStr).start,
        end: buildDayRange(endDateStr).end,
    };
    const effectiveCarryOverStart = getEffectiveCarryOverStart(start);
    const { includeCompletedCarryOver = false, excludeCarryForwards = false } = options;
    const queueScopes = [{ dateSold: { $gte: start, $lte: end } }];

    if (start.getTime() > effectiveCarryOverStart.getTime() && !excludeCarryForwards) {
        queueScopes.push({
            dateSold: { $gte: effectiveCarryOverStart, $lt: start },
            sourcingStatus: 'Not Yet',
        });

        if (includeCompletedCarryOver) {
            queueScopes.push({
                dateSold: { $gte: effectiveCarryOverStart, $lt: start },
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

function marketplaceToRegex(marketplace) {
    if (!marketplace) return null;
    const code = String(marketplace || '').toLowerCase();
    const map = {
        us: ['US'],
        aus: ['AUS', 'AU'],
        uk: ['UK', 'GB'],
        ca: ['CANADA', 'CA'],
    };
    const candidates = map[code] || [marketplace];
    const pattern = candidates.map((s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    return new RegExp(pattern, 'i');
}

// ---------------------------------------------------------------------------
// TAB 1 — Daily Order Sellers
// GET /api/affiliate-orders/daily/sellers?date=YYYY-MM-DD
// Returns seller options for the current daily queue filters
// ---------------------------------------------------------------------------
router.get('/daily/sellers', async (req, res) => {
    try {
        const { date, startDate, endDate, excludeLowValue, includeDone, excludeCarryForwards, marketplace } = req.query;
        const resolvedWindow = resolveDateWindowFromQuery({ date, startDate, endDate });
        if (!resolvedWindow) {
            return res.status(400).json({ error: 'date or startDate/endDate query params required (YYYY-MM-DD)' });
        }
        const shouldIncludeDone = includeDone === 'true';
        const shouldExcludeCarryForwards = excludeCarryForwards === 'true';

        const extraFilters = [];
        if (!shouldIncludeDone) {
            extraFilters.push({ sourcingStatus: { $ne: 'Done' } });
        }
        if (marketplace) {
            const re = marketplaceToRegex(marketplace);
            if (re) extraFilters.push({ purchaseMarketplaceId: { $regex: re } });
        }

        const { query } = buildAffiliateQueueQueryForRange(
            resolvedWindow.startDate,
            resolvedWindow.endDate,
            excludeLowValue,
            extraFilters,
            {
            includeCompletedCarryOver: shouldIncludeDone,
            excludeCarryForwards: shouldExcludeCarryForwards,
            }
        );

        const groupedSellers = await Order.aggregate([
            { $match: query },
            {
                $group: {
                    _id: '$seller',
                    count: { $sum: 1 },
                },
            },
        ]).option({ maxTimeMS: 60000 });

        const activeUserIds = await User.find({ active: true }).distinct('_id');
        const sellers = await Seller.find({
            user: { $in: activeUserIds },
            isStoreActive: { $ne: false },
        })
            .populate({ path: 'user', select: 'username' })
            .lean();

        const countBySellerId = new Map(
            groupedSellers
                .filter((row) => row?._id)
                .map((row) => [String(row._id), row.count || 0])
        );

        const sellerOptions = sellers
            .map((seller) => ({
                value: String(seller._id),
                label: seller.user?.username || 'Unknown Seller',
                count: countBySellerId.get(String(seller._id)) || 0,
            }))
            .sort((left, right) => left.label.localeCompare(right.label));

        res.json(sellerOptions);
    } catch (err) {
        console.error('GET /affiliate-orders/daily/sellers error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// TAB 1 — Daily Orders
// GET /api/affiliate-orders/daily?date=YYYY-MM-DD
// Returns daily queue orders, optionally filtered by seller
// ---------------------------------------------------------------------------
router.get('/daily', async (req, res) => {
    try {
        const { date, startDate, endDate, excludeLowValue, includeDone, sellerId, excludeCarryForwards, marketplace } = req.query;
        const resolvedWindow = resolveDateWindowFromQuery({ date, startDate, endDate });
        if (!resolvedWindow) {
            return res.status(400).json({ error: 'date or startDate/endDate query params required (YYYY-MM-DD)' });
        }
        const shouldIncludeDone = includeDone === 'true';
        const shouldExcludeCarryForwards = excludeCarryForwards === 'true';

        const extraFilters = [];
        if (!shouldIncludeDone) {
            extraFilters.push({ sourcingStatus: { $ne: 'Done' } });
        }
        if (sellerId) {
            extraFilters.push({ seller: sellerId });
        }
        if (marketplace) {
            const re = marketplaceToRegex(marketplace);
            if (re) extraFilters.push({ purchaseMarketplaceId: { $regex: re } });
        }

        const { query } = buildAffiliateQueueQueryForRange(
            resolvedWindow.startDate,
            resolvedWindow.endDate,
            excludeLowValue,
            extraFilters,
            {
            includeCompletedCarryOver: shouldIncludeDone,
            excludeCarryForwards: shouldExcludeCarryForwards,
            }
        );

        const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limitNum = Math.min(
            200,
            Math.max(10, parseInt(req.query.limit, 10) || DEFAULT_AFFILIATE_PAGE_SIZE)
        );
        const skip = (pageNum - 1) * limitNum;

        const [totalOrders, orders] = await Promise.all([
            Order.countDocuments(query).maxTimeMS(60000),
            Order.find(query)
                .select(`${AFFILIATE_DAILY_SELECT} seller`)
                .sort({ dateSold: 1, _id: 1 })
                .skip(skip)
                .limit(limitNum)
                .maxTimeMS(90000)
                .lean(),
        ]);

        const totalPages = Math.max(1, Math.ceil(totalOrders / limitNum) || 1);

        const ordersWithSellers = await attachSellersToOrders(orders);
        const ordersWithSupplierLink = await applyAffiliateSupplierLinks(ordersWithSellers);

        const selectedDayUtc = Date.parse(`${resolvedWindow.endDate}T00:00:00Z`);
        const enrichedOrders = ordersWithSupplierLink
            .map((order) => {
                const sourceDay = getPlatformDayString(order.dateSold || order.creationDate || new Date());
                const sourceDayUtc = Date.parse(`${sourceDay}T00:00:00Z`);
                const carryOverDays = Math.max(0, Math.round((selectedDayUtc - sourceDayUtc) / DAY_IN_MS));
                const sellerName = order.seller?.user?.username || order.sellerId || 'Unknown Seller';

                return slimAffiliateOrderResponse({
                    ...order,
                    sellerGroupName: sellerName,
                    isCarryOver: carryOverDays > 0 && order.sourcingStatus === 'Not Yet',
                    carryOverDays,
                    sourceDate: sourceDay,
                    carryOverLabel: getCarryOverLabel(carryOverDays),
                });
            })
            .sort((left, right) => {
                if (left.sellerGroupName !== right.sellerGroupName) {
                    return left.sellerGroupName.localeCompare(right.sellerGroupName);
                }

                return new Date(left.dateSold || left.creationDate || 0) - new Date(right.dateSold || right.creationDate || 0);
            });

        res.json({
            orders: enrichedOrders,
            pagination: {
                page: pageNum,
                limit: limitNum,
                totalOrders,
                totalPages,
            },
        });
    } catch (err) {
        console.error('GET /affiliate-orders/daily error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// TAB 4 — Actual Spend
// GET /api/affiliate-orders/spend?date=YYYY-MM-DD
// Returns orders whose spend should be recognized on the selected day
// ---------------------------------------------------------------------------
router.get('/spend', async (req, res) => {
    try {
        const { date, excludeLowValue, marketplace } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

        const extraFilters = [];
        if (marketplace) {
            const re = marketplaceToRegex(marketplace);
            if (re) extraFilters.push({ purchaseMarketplaceId: { $regex: re } });
        }

        const { query } = buildAffiliateSpendQuery(date, excludeLowValue, extraFilters);

        const orders = await Order.find(query)
            .select(AFFILIATE_DAILY_SELECT)
            .sort({ sourcingCompletedAt: 1, dateSold: 1 })
            .lean();

        const ordersWithSellers = await attachSellersToOrders(orders);
        const ordersWithSupplierLink = await applyAffiliateSupplierLinks(ordersWithSellers);

        const enrichedOrders = ordersWithSupplierLink
            .map((order) => {
                const sellerName = order.seller?.user?.username || order.sellerId || 'Unknown Seller';

                return slimAffiliateOrderResponse({
                    ...order,
                    sellerGroupName: sellerName,
                    sourceDate: getPlatformDayString(order.dateSold || order.creationDate || new Date()),
                    spendDate: getPlatformDayString(order.sourcingCompletedAt || order.dateSold || order.creationDate || new Date()),
                });
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
        const { date, excludeLowValue, marketplace } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

        // All Amazon accounts
        const accounts = await AmazonAccount.find().sort({ name: 1 }).lean();

        const extraMatch = [{ amazonAccount: { $exists: true, $ne: '' } }];
        if (marketplace) {
            const re = marketplaceToRegex(marketplace);
            if (re) extraMatch.push({ purchaseMarketplaceId: { $regex: re } });
        }
        const { query: matchQuery } = buildAffiliateSpendQuery(date, excludeLowValue, extraMatch);

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
        const { date, excludeLowValue, marketplace } = req.query;
        if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

        const extra = [];
        const extraSpend = [];
        if (marketplace) {
            const re = marketplaceToRegex(marketplace);
            if (re) {
                extra.push({ purchaseMarketplaceId: { $regex: re } });
                extraSpend.push({ purchaseMarketplaceId: { $regex: re } });
            }
        }

        const { start, end, query: queueQuery } = buildAffiliateQueueQuery(date, excludeLowValue, extra, {
            includeCompletedCarryOver: true,
        });
        const { query: spendQuery } = buildAffiliateSpendQuery(date, excludeLowValue, extraSpend);

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
