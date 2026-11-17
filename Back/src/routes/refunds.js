import express from 'express';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import RefundEntry, { REFUND_TYPES } from '../models/RefundEntry.js';
import RefundOption, { REFUND_OPTION_TYPES } from '../models/RefundOption.js';
import { requireAuth, requirePageAccess, requireFeatureAccess } from '../middleware/auth.js';

export const REFUND_ADD_FEATURE_ID = 'refunds.addFromFulfillment';

const router = express.Router();

const DEFAULT_OPTIONS = {
    status: ['Case Opened', 'Case Not Opened']
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function validateOptionType(req, res, next) {
    if (!REFUND_OPTION_TYPES.includes(req.params.type)) {
        return res.status(400).json({ error: 'Invalid option type' });
    }
    next();
}

// Seed only an empty list, so a default the team deleted stays deleted.
async function seedDefaultOptions(type) {
    const defaults = DEFAULT_OPTIONS[type] || [];
    if (!defaults.length || await RefundOption.exists({ type })) return;
    try {
        await RefundOption.insertMany(defaults.map((name) => ({ type, name })), { ordered: false });
    } catch (error) {
        // Two first-time requests can seed at once; the unique index keeps one copy.
        if (error.code !== 11000) throw error;
    }
}

// ---------- Dropdown options (Status / Category) ----------

router.get('/options/:type', requireAuth, validateOptionType, async (req, res) => {
    try {
        const { type } = req.params;
        await seedDefaultOptions(type);
        const options = await RefundOption.find({ type }).sort({ createdAt: 1, _id: 1 });
        res.json(options);
    } catch (error) {
        console.error('Error fetching refund options:', error);
        res.status(500).json({ error: 'Failed to fetch options' });
    }
});

router.post('/options/:type', requireAuth, requirePageAccess('Refunds'), validateOptionType, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Option name is required' });
        }
        const option = await RefundOption.create({ type: req.params.type, name });
        res.status(201).json(option);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'This option already exists' });
        }
        console.error('Error creating refund option:', error);
        res.status(500).json({ error: 'Failed to create option' });
    }
});

router.patch('/options/:type/:id', requireAuth, requirePageAccess('Refunds'), validateOptionType, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Option name is required' });
        }
        const option = await RefundOption.findOneAndUpdate(
            { _id: req.params.id, type: req.params.type },
            { name },
            { new: true, runValidators: true }
        );
        if (!option) {
            return res.status(404).json({ error: 'Option not found' });
        }
        res.json(option);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'This option already exists' });
        }
        console.error('Error updating refund option:', error);
        res.status(500).json({ error: 'Failed to update option' });
    }
});

router.delete('/options/:type/:id', requireAuth, requirePageAccess('Refunds'), validateOptionType, async (req, res) => {
    try {
        const option = await RefundOption.findOneAndDelete({ _id: req.params.id, type: req.params.type });
        if (!option) {
            return res.status(404).json({ error: 'Option not found' });
        }
        res.json({ message: 'Option deleted successfully' });
    } catch (error) {
        console.error('Error deleting refund option:', error);
        res.status(500).json({ error: 'Failed to delete option' });
    }
});

// ---------- Refund entries ----------

function serializeEntry(entry) {
    const order = entry.order && typeof entry.order === 'object' ? entry.order : null;
    return {
        _id: entry._id,
        type: entry.type,
        orderMongoId: order?._id || entry.order,
        orderId: order?.orderId || entry.orderId || '',
        dateSold: order?.dateSold || order?.creationDate || null,
        marketplace: order?.purchaseMarketplaceId || '',
        amazonAccount: order?.amazonAccount || '',
        azOrderId: order?.azOrderId || '',
        // Order data needed to build and send the remark message to the buyer.
        orderInfo: order ? {
            _id: order._id,
            orderId: order.orderId,
            sellerId: order.sellerId || '',
            buyer: order.buyer || null,
            shippingFullName: order.shippingFullName || '',
            lineItems: order.lineItems || [],
            itemNumber: order.itemNumber || '',
            productName: order.productName || '',
            trackingNumber: order.trackingNumber || '',
            shippingCarrier: order.shippingCarrier || '',
            arrivingDate: order.arrivingDate || '',
            issueReason: order.issueReason || ''
        } : null,
        seller: entry.seller || null,
        refundDate: entry.refundDate,
        refundAmount: entry.refundAmount,
        status: entry.status || '',
        // Category is the order's remark; Reason is the order's issue reason.
        category: order?.remark || '',
        reason: order?.issueReason || '',
        notes: entry.notes || '',
        amazonRefundAmount: entry.amazonRefundAmount,
        amazonNotes: entry.amazonNotes || '',
        createdAt: entry.createdAt
    };
}

const ORDER_FIELDS = 'orderId dateSold creationDate purchaseMarketplaceId amazonAccount azOrderId remark issueReason '
    + 'sellerId buyer.username buyer.buyerRegistrationAddress.fullName shippingFullName lineItems.title lineItems.legacyItemId '
    + 'itemNumber productName trackingNumber shippingCarrier arrivingDate';

const SELLER_POPULATE = { path: 'seller', select: 'user', populate: { path: 'user', select: 'username' } };

const ENTRY_POPULATE = [
    { path: 'order', select: ORDER_FIELDS },
    SELLER_POPULATE
];

// Joins each refund entry with its order so filters can use order data (the list is small, so this is cheap).
function orderLookupStages() {
    return [
        {
            $lookup: {
                from: Order.collection.name,
                let: { oid: '$order' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$oid'] } } },
                    { $project: Object.fromEntries(ORDER_FIELDS.split(' ').map((f) => [f, 1])) }
                ],
                as: 'order'
            }
        },
        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
        { $addFields: { soldAt: { $ifNull: ['$order.dateSold', '$order.creationDate'] } } }
    ];
}

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

// Called from the Fulfillment dashboard: add an order to the Return or INR refund list.
router.post('/', requireAuth, requireFeatureAccess(REFUND_ADD_FEATURE_ID), async (req, res) => {
    try {
        const { orderId, ebayOrderId, type } = req.body || {};
        if (!REFUND_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Type must be "return" or "inr"' });
        }

        // The Return API page only knows the eBay order number, not the database id.
        let order;
        if (ebayOrderId) {
            const number = String(ebayOrderId).trim();
            order = await Order.findOne({ $or: [{ orderId: number }, { legacyOrderId: number }] }).select('orderId seller').lean();
        } else {
            if (!mongoose.Types.ObjectId.isValid(orderId)) {
                return res.status(400).json({ error: 'Invalid order' });
            }
            order = await Order.findById(orderId).select('orderId seller').lean();
        }
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const existing = await RefundEntry.findOne({ order: order._id, type }).select('_id').lean();
        if (existing) {
            return res.json({ created: false, entryId: existing._id });
        }

        try {
            const entry = await RefundEntry.create({
                type,
                order: order._id,
                orderId: order.orderId || '',
                seller: order.seller
            });
            return res.status(201).json({ created: true, entryId: entry._id });
        } catch (error) {
            // Double click: the unique index already holds the entry.
            if (error.code === 11000) return res.json({ created: false });
            throw error;
        }
    } catch (error) {
        console.error('Error adding refund entry:', error);
        res.status(500).json({ error: 'Failed to add refund entry' });
    }
});

// Distinct marketplace / category / reason values among a list's orders, to fill the filter dropdowns.
router.get('/filter-values', requireAuth, requirePageAccess('Refunds'), async (req, res) => {
    try {
        const { type } = req.query;
        if (!REFUND_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Type must be "return" or "inr"' });
        }

        const [row] = await RefundEntry.aggregate([
            { $match: { type } },
            ...orderLookupStages(),
            {
                $group: {
                    _id: null,
                    marketplaces: { $addToSet: '$order.purchaseMarketplaceId' },
                    categories: { $addToSet: '$order.remark' },
                    reasons: { $addToSet: '$order.issueReason' }
                }
            }
        ]);

        const clean = (values) => (values || []).filter((v) => typeof v === 'string' && v.trim()).sort((a, b) => a.localeCompare(b));
        res.json({
            marketplaces: clean(row?.marketplaces),
            categories: clean(row?.categories),
            reasons: clean(row?.reasons)
        });
    } catch (error) {
        console.error('Error fetching refund filter values:', error);
        res.status(500).json({ error: 'Failed to fetch filter values' });
    }
});

router.get('/', requireAuth, requirePageAccess('Refunds'), async (req, res) => {
    try {
        const { type, sellerId, search, status, marketplace, category, reason, dateFrom, dateTo } = req.query;
        if (!REFUND_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Type must be "return" or "inr"' });
        }

        const entryMatch = { type };
        if (sellerId) {
            if (!mongoose.Types.ObjectId.isValid(sellerId)) {
                return res.status(400).json({ error: 'Invalid seller' });
            }
            entryMatch.seller = new mongoose.Types.ObjectId(sellerId);
        }
        const term = String(search || '').trim();
        if (term) {
            entryMatch.orderId = new RegExp(escapeRegex(term), 'i');
        }
        if (status) entryMatch.status = String(status);

        const orderMatch = {};
        if (marketplace) orderMatch['order.purchaseMarketplaceId'] = String(marketplace);
        if (category) orderMatch['order.remark'] = String(category);
        if (reason) orderMatch['order.issueReason'] = String(reason);

        if (dateFrom || dateTo) {
            if ((dateFrom && !DATE_PARAM.test(dateFrom)) || (dateTo && !DATE_PARAM.test(dateTo))) {
                return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });
            }
            orderMatch.soldAt = {};
            if (dateFrom) orderMatch.soldAt.$gte = new Date(`${dateFrom}T00:00:00.000Z`);
            if (dateTo) orderMatch.soldAt.$lte = new Date(`${dateTo}T23:59:59.999Z`);
        }

        const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

        const [result] = await RefundEntry.aggregate([
            { $match: entryMatch },
            ...orderLookupStages(),
            ...(Object.keys(orderMatch).length ? [{ $match: orderMatch }] : []),
            {
                $facet: {
                    rows: [
                        { $sort: { createdAt: -1, _id: -1 } },
                        { $skip: (pageNum - 1) * limitNum },
                        { $limit: limitNum }
                    ],
                    total: [{ $count: 'count' }]
                }
            }
        ]);

        const total = result?.total?.[0]?.count || 0;
        const entries = await RefundEntry.populate(result?.rows || [], [SELLER_POPULATE]);

        res.json({
            entries: entries.map(serializeEntry),
            pagination: {
                currentPage: pageNum,
                totalPages: Math.ceil(total / limitNum),
                totalEntries: total,
                limit: limitNum
            }
        });
    } catch (error) {
        console.error('Error fetching refund entries:', error);
        res.status(500).json({ error: 'Failed to fetch refund entries' });
    }
});

const TEXT_FIELDS = ['status', 'notes', 'amazonNotes'];
const AMOUNT_FIELDS = ['refundAmount', 'amazonRefundAmount'];

router.patch('/:id', requireAuth, requirePageAccess('Refunds'), async (req, res) => {
    try {
        const body = req.body || {};
        const update = {};

        for (const field of TEXT_FIELDS) {
            if (body[field] !== undefined) update[field] = String(body[field] ?? '').trim();
        }

        for (const field of AMOUNT_FIELDS) {
            if (body[field] === undefined) continue;
            if (body[field] === null || body[field] === '') {
                update[field] = null;
                continue;
            }
            const amount = Number(body[field]);
            if (!Number.isFinite(amount) || amount < 0) {
                return res.status(400).json({ error: 'Amount must be a non-negative number' });
            }
            update[field] = amount;
        }

        if (body.refundDate !== undefined) {
            if (body.refundDate === null || body.refundDate === '') {
                update.refundDate = null;
            } else {
                const date = new Date(body.refundDate);
                if (Number.isNaN(date.getTime())) {
                    return res.status(400).json({ error: 'Invalid refund date' });
                }
                update.refundDate = date;
            }
        }

        if (!Object.keys(update).length) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const entry = await RefundEntry.findByIdAndUpdate(req.params.id, { $set: update }, { new: true })
            .populate(ENTRY_POPULATE)
            .lean();
        if (!entry) {
            return res.status(404).json({ error: 'Refund entry not found' });
        }
        res.json(serializeEntry(entry));
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid refund entry' });
        }
        console.error('Error updating refund entry:', error);
        res.status(500).json({ error: 'Failed to update refund entry' });
    }
});

router.delete('/:id', requireAuth, requirePageAccess('Refunds'), async (req, res) => {
    try {
        const entry = await RefundEntry.findByIdAndDelete(req.params.id);
        if (!entry) {
            return res.status(404).json({ error: 'Refund entry not found' });
        }
        res.json({ message: 'Refund entry removed' });
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(400).json({ error: 'Invalid refund entry' });
        }
        console.error('Error deleting refund entry:', error);
        res.status(500).json({ error: 'Failed to delete refund entry' });
    }
});

export default router;
