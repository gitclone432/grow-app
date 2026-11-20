import Order from '../models/Order.js';
import RefundEntry from '../models/RefundEntry.js';
import Case from '../models/Case.js';
import Return from '../models/Return.js';
import ConversationMeta from '../models/ConversationMeta.js';
import { FINAL_CANCELLED_STATES } from '../constants/cancelStates.js';
import { computeOrderEarningsFromComponents } from '../utils/exchangeRateUtils.js';
import axios from 'axios';
import Seller from '../models/Seller.js';
import { ensureValidToken } from '../routes/ebay.js';

// Max orders re-fetched from eBay per sync run, and how many eBay calls run at once.
const EBAY_REFRESH_LIMIT = 400;
const EBAY_REFRESH_CONCURRENCY = 4;

/**
 * Re-fetch refund-related orders from the eBay Fulfillment API and save their latest refunds,
 * payment status and cancel status — the same update as the per-order "fetch cancel status" button.
 * Without this, refunds issued after the order was imported never reach the database.
 *
 * Orders refreshed:
 *   - every order on the Refunds page that is not already fully refunded;
 *   - orders sold on/after `since`, not cancelled and not fully refunded, that have an eBay Return
 *     record, an eBay INR case or Case Category Return/INR (so newly refunded ones get auto-added).
 */
export async function refreshRefundOrdersFromEbay({ since }) {
    const stats = { refreshed: 0, failed: 0 };
    const notFinal = { orderPaymentStatus: { $ne: 'FULLY_REFUNDED' } };

    const [entryOrderIds, returnIds, inrIds, metaIds] = await Promise.all([
        RefundEntry.distinct('order'),
        Return.distinct('orderId'),
        Case.distinct('orderId', { caseType: 'INR' }),
        ConversationMeta.distinct('orderId', { category: { $in: Object.keys(CATEGORY_TO_TYPE) } })
    ]);
    const ebayIds = [...new Set([...returnIds, ...inrIds, ...metaIds].filter(Boolean))];

    const orders = await Order.find({
        ...notFinal,
        $or: [
            { _id: { $in: entryOrderIds } },
            {
                cancelState: { $nin: FINAL_CANCELLED_STATES },
                $and: [
                    { $or: [{ orderId: { $in: ebayIds } }, { legacyOrderId: { $in: ebayIds } }] },
                    { $or: [{ dateSold: { $gte: since } }, { dateSold: null, creationDate: { $gte: since } }] }
                ]
            }
        ]
    })
        .select('_id orderId seller')
        .sort({ dateSold: -1 })
        .limit(EBAY_REFRESH_LIMIT)
        .lean();
    if (!orders.length) return stats;

    // One access token per seller per run.
    const tokenBySeller = new Map();
    const getToken = async (sellerId) => {
        const key = String(sellerId);
        if (!tokenBySeller.has(key)) {
            tokenBySeller.set(key, (async () => {
                const seller = await Seller.findById(sellerId);
                if (!seller?.ebayTokens?.refresh_token) return null;
                return ensureValidToken(seller);
            })().catch(() => null));
        }
        return tokenBySeller.get(key);
    };

    const refreshOne = async (order) => {
        try {
            const token = await getToken(order.seller);
            if (!token) {
                stats.failed += 1;
                return;
            }
            const { data: ebayOrder } = await axios.get(
                `https://api.ebay.com/sell/fulfillment/v1/order/${encodeURIComponent(order.orderId)}`,
                { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, timeout: 30000 }
            );

            const set = {};
            if (ebayOrder.cancelStatus !== undefined) {
                const cs = ebayOrder.cancelStatus;
                set.cancelStatus = cs || null;
                set.cancelState = cs
                    ? (cs.cancelState || cs.state || cs.status || (cs.cancelled ? 'CANCELED' : 'NONE_REQUESTED'))
                    : 'NONE_REQUESTED';
            }
            if (ebayOrder.orderPaymentStatus) set.orderPaymentStatus = ebayOrder.orderPaymentStatus;
            if (ebayOrder.paymentSummary) {
                set.paymentSummary = ebayOrder.paymentSummary;
                set.refunds = ebayOrder.paymentSummary.refunds || [];
            }
            if (ebayOrder.lastModifiedDate) set.lastModifiedDate = ebayOrder.lastModifiedDate;

            if (Object.keys(set).length) await Order.updateOne({ _id: order._id }, { $set: set });
            stats.refreshed += 1;
        } catch (error) {
            stats.failed += 1;
            const msg = error.response?.data?.errors?.[0]?.message || error.message;
            console.error(`[Refunds sync] eBay refresh failed for ${order.orderId}:`, msg);
        }
    };

    for (let i = 0; i < orders.length; i += EBAY_REFRESH_CONCURRENCY) {
        await Promise.all(orders.slice(i, i + EBAY_REFRESH_CONCURRENCY).map(refreshOne));
    }
    return stats;
}

// Order fields needed to compute the Fulfillment dashboard "Refunds" column value.
const REFUND_AMOUNT_ORDER_FIELDS = 'refunds orderPaymentStatus subtotal conversionRate discount shipping transactionFees '
    + 'adFeeGeneral preRefundAdFeeGeneral preRefundOrderEarnings preRefundTransactionFees totalDueSellerUSD '
    + 'purchaseMarketplaceId paymentSummary.totalDueSeller paymentSummary.payments lineItems.refunds';

/**
 * Same value as the Refunds column on the Fulfillment dashboard (USD):
 *   Full    → sum of eBay refunds × conversionRate
 *   Partial → subtotal × conversionRate − order earnings
 * Returns null when the order has no refund data or the value can't be computed.
 */
export function getRefundsColumnAmount(order = {}) {
    const refunds = Array.isArray(order.refunds) ? order.refunds : [];
    if (!refunds.length) return null;
    const rateNum = parseFloat(order.conversionRate);
    const rate = Number.isFinite(rateNum) && rateNum > 0 ? rateNum : 1;

    if (order.orderPaymentStatus === 'FULLY_REFUNDED') {
        const total = refunds.reduce((sum, refund) => {
            const usd = parseFloat((Number(refund?.amount?.value || refund?.refundAmount?.value || 0) * rate).toFixed(2));
            return sum + (Number.isFinite(usd) ? usd : 0);
        }, 0);
        return parseFloat(total.toFixed(2));
    }

    const subtotal = parseFloat(order.subtotal);
    const earnings = parseFloat(computeOrderEarningsFromComponents(order));
    if (!Number.isFinite(subtotal) || !Number.isFinite(earnings)) return null;
    return parseFloat((subtotal * rate - earnings).toFixed(2));
}

// Status values written by the sync (same names as the default Status dropdown options).
export const STATUS_CASE_OPENED = 'Case Opened';
export const STATUS_CASE_NOT_OPENED = 'Case Not Opened';

/**
 * Keeps Refund Amt and Status on refund entries in sync with order data (always overwrites):
 *   Refund Amt → the order's Refunds column value (left as is when the order has no refund data);
 *   Status     → "Case Opened" when the order has any eBay case (INR / SNAD / other) or eBay Return
 *                request, otherwise "Case Not Opened".
 * Returns how many entries changed.
 */
export async function fillRefundAmounts({ entryIds } = {}) {
    const filter = entryIds ? { _id: { $in: entryIds } } : {};
    const entries = await RefundEntry.find(filter)
        .select('_id refundAmount refundAmountAuto status order')
        .populate({ path: 'order', select: `orderId legacyOrderId ${REFUND_AMOUNT_ORDER_FIELDS}` })
        .lean();
    if (!entries.length) return 0;

    const ebayIds = [...new Set(
        entries.flatMap((e) => [e.order?.orderId, e.order?.legacyOrderId]).filter(Boolean)
    )];
    const [cases, returns] = await Promise.all([
        Case.find({ orderId: { $in: ebayIds } }).select('orderId').lean(),
        Return.find({ $or: [{ orderId: { $in: ebayIds } }, { legacyOrderId: { $in: ebayIds } }] })
            .select('orderId legacyOrderId').lean()
    ]);
    const openedIds = new Set([
        ...cases.map((c) => c.orderId),
        ...returns.flatMap((r) => [r.orderId, r.legacyOrderId])
    ].filter(Boolean));

    const ops = [];
    for (const entry of entries) {
        if (!entry.order) continue;
        const set = {};

        const amount = getRefundsColumnAmount(entry.order);
        if (amount != null && (entry.refundAmount !== amount || !entry.refundAmountAuto)) {
            set.refundAmount = amount;
            set.refundAmountAuto = true;
        }

        const caseOpened = [entry.order.orderId, entry.order.legacyOrderId].some((id) => id && openedIds.has(id));
        const status = caseOpened ? STATUS_CASE_OPENED : STATUS_CASE_NOT_OPENED;
        if (entry.status !== status) set.status = status;

        if (Object.keys(set).length) {
            ops.push({ updateOne: { filter: { _id: entry._id }, update: { $set: set } } });
        }
    }
    if (!ops.length) return 0;
    const res = await RefundEntry.bulkWrite(ops, { ordered: false });
    return res.modifiedCount || 0;
}

// Only orders sold on/after this date are auto-assigned (earlier ones stay manual).
export const REFUND_AUTO_ASSIGN_SINCE = new Date('2026-11-01T00:00:00.000Z');

// Case Category (ConversationMeta.category) → refund list type.
const CATEGORY_TO_TYPE = { Return: 'return', INR: 'inr' };

let running = false;

/**
 * Adds refunded orders to the Refunds page (Return / INR) automatically.
 *
 * An order qualifies when it has eBay refund data, was sold on/after REFUND_AUTO_ASSIGN_SINCE
 * and is not cancelled. Its list is picked from:
 *   1. an eBay Return record → Return, else an eBay INR case → INR;
 *   2. otherwise the order's Case Category ("Return" or "INR").
 * Orders with no match, orders already on either list, and lists a user removed the order from are skipped.
 */
export async function autoAssignRefundedOrders({ since = REFUND_AUTO_ASSIGN_SINCE, refreshFromEbay = true } = {}) {
    if (running) return { skipped: true };
    running = true;
    try {
        // 1. Pull the latest refunds / payment / cancel status from eBay so nothing is stale.
        const ebay = refreshFromEbay
            ? await refreshRefundOrdersFromEbay({ since })
            : { refreshed: 0, failed: 0 };

        const orders = await Order.find({
            'refunds.0': { $exists: true },
            cancelState: { $nin: FINAL_CANCELLED_STATES },
            $or: [
                { dateSold: { $gte: since } },
                { dateSold: null, creationDate: { $gte: since } }
            ]
        }).select('_id orderId legacyOrderId seller refundAutoDismissed').lean();

        const result = {
            checked: orders.length, created: 0, return: 0, inr: 0, unmatched: 0, alreadyListed: 0, amountsFilled: 0,
            ebayRefreshed: ebay.refreshed, ebayFailed: ebay.failed
        };
        if (!orders.length) {
            result.amountsFilled = await fillRefundAmounts();
            return result;
        }

        const ebayIds = [...new Set(orders.flatMap((o) => [o.orderId, o.legacyOrderId]).filter(Boolean))];
        const [returns, inrCases, metas, existing] = await Promise.all([
            Return.find({ $or: [{ orderId: { $in: ebayIds } }, { legacyOrderId: { $in: ebayIds } }] })
                .select('orderId legacyOrderId').lean(),
            Case.find({ orderId: { $in: ebayIds }, caseType: 'INR' }).select('orderId').lean(),
            ConversationMeta.find({ orderId: { $in: ebayIds }, category: { $in: Object.keys(CATEGORY_TO_TYPE) } })
                .select('orderId category categoryAssignedAt updatedAt').lean(),
            RefundEntry.find({ order: { $in: orders.map((o) => o._id) } }).select('order').lean()
        ]);

        const returnIds = new Set(returns.flatMap((r) => [r.orderId, r.legacyOrderId]).filter(Boolean));
        const inrIds = new Set(inrCases.map((c) => c.orderId));
        const listedOrders = new Set(existing.map((e) => String(e.order)));

        // Latest Case Category per order (an order can have one conversation per item).
        const categoryByOrder = new Map();
        for (const meta of metas) {
            const at = new Date(meta.categoryAssignedAt || meta.updatedAt || 0).getTime();
            const prev = categoryByOrder.get(meta.orderId);
            if (!prev || at > prev.at) categoryByOrder.set(meta.orderId, { type: CATEGORY_TO_TYPE[meta.category], at });
        }

        for (const order of orders) {
            if (listedOrders.has(String(order._id))) {
                result.alreadyListed += 1;
                continue;
            }
            const ids = [order.orderId, order.legacyOrderId].filter(Boolean);
            let type = null;
            if (ids.some((id) => returnIds.has(id))) type = 'return';
            else if (ids.some((id) => inrIds.has(id))) type = 'inr';
            else type = ids.map((id) => categoryByOrder.get(id)?.type).find(Boolean) || null;

            if (!type || (order.refundAutoDismissed || []).includes(type)) {
                result.unmatched += 1;
                continue;
            }

            try {
                await RefundEntry.create({
                    type,
                    order: order._id,
                    orderId: order.orderId || '',
                    seller: order.seller,
                    source: 'auto'
                });
                result.created += 1;
                result[type] += 1;
            } catch (error) {
                // Added by someone else in the meantime; the unique index keeps one copy.
                if (error.code !== 11000) throw error;
            }
        }
        // Sync Refund Amt + Status on every list entry (new and existing, auto or manual).
        result.amountsFilled = await fillRefundAmounts();
        return result;
    } finally {
        running = false;
    }
}
