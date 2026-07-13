import express from 'express';
import StoreSubscription from '../models/StoreSubscription.js';
import Seller from '../models/Seller.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createStoreSubscriptionSchema, updateStoreSubscriptionSchema } from '../schemas/index.js';

const router = express.Router();

router.use(requireAuth);

function getSellerDisplayName(seller) {
    return (
        seller?.storeName ||
        seller?.user?.username ||
        seller?.user?.email ||
        String(seller?._id || '')
    );
}

function normalizeMonth(month) {
    const value = String(month || '').trim();
    if (!/^\d{4}-\d{2}$/.test(value)) {
        return null;
    }
    return value;
}

function buildLegacyDate(month) {
    return `${month}-01`;
}

function buildLegacyAccountName(sellerId, billingCycle) {
    return `${sellerId}:${billingCycle}`;
}

async function findSellerOrFail(sellerId) {
    const seller = await Seller.findById(sellerId).populate('user', 'username email');
    if (!seller) {
        const error = new Error('Seller not found');
        error.statusCode = 404;
        throw error;
    }
    return seller;
}

function mapRecord(record) {
    const seller = record.sellerId;
    return {
        _id: record._id,
        month: record.month,
        sellerId: seller?._id || record.sellerId,
        sellerName: record.sellerName,
        sellerUsername: seller?.user?.username || '',
        billingCycle: record.billingCycle,
        amount: record.amount,
        notes: record.notes || '',
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

router.get('/', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const { month, startMonth, endMonth, sellerId, billingCycle } = req.query;
        const filter = { month: { $exists: true, $ne: '' } };

        if (month) {
            const normalizedMonth = normalizeMonth(month);
            if (!normalizedMonth) {
                return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
            }
            filter.month = normalizedMonth;
        } else if (startMonth || endMonth) {
            filter.month = {};
            if (startMonth) {
                const normalizedStart = normalizeMonth(startMonth);
                if (!normalizedStart) {
                    return res.status(400).json({ error: 'Start month must be in YYYY-MM format' });
                }
                filter.month.$gte = normalizedStart;
            }
            if (endMonth) {
                const normalizedEnd = normalizeMonth(endMonth);
                if (!normalizedEnd) {
                    return res.status(400).json({ error: 'End month must be in YYYY-MM format' });
                }
                filter.month.$lte = normalizedEnd;
            }
        }

        if (sellerId) {
            filter.sellerId = sellerId;
        }

        if (billingCycle) {
            const cycle = String(billingCycle).toLowerCase();
            if (!['monthly', 'yearly'].includes(cycle)) {
                return res.status(400).json({ error: 'Billing cycle must be monthly or yearly' });
            }
            filter.billingCycle = cycle;
        }

        const records = await StoreSubscription.find(filter)
            .populate({
                path: 'sellerId',
                select: 'user',
                populate: { path: 'user', select: 'username email' },
            })
            .sort({ month: -1, createdAt: -1 })
            .exec();

        res.json(records.map(mapRecord));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', requirePageAccess('Affiliate'), validate(createStoreSubscriptionSchema), async (req, res) => {
    try {
        const month = normalizeMonth(req.body.month);
        if (!month) {
            return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
        }

        const billingCycle = String(req.body.billingCycle || '').toLowerCase();
        const seller = await findSellerOrFail(req.body.sellerId);
        const sellerName = getSellerDisplayName(seller);

        const record = new StoreSubscription({
            month,
            sellerId: seller._id,
            sellerName,
            billingCycle,
            amount: Number(req.body.amount) || 0,
            notes: String(req.body.notes || '').trim(),
            date: buildLegacyDate(month),
            accountName: buildLegacyAccountName(seller._id, billingCycle),
            expenses: Number(req.body.amount) || 0,
            remarks: billingCycle,
        });

        await record.save();
        await record.populate({
            path: 'sellerId',
            select: 'user',
            populate: { path: 'user', select: 'username email' },
        });

        res.status(201).json(mapRecord(record));
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'A subscription record already exists for this seller, month, and billing cycle' });
        }
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

router.put('/:id', requirePageAccess('Affiliate'), validate(updateStoreSubscriptionSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const record = await StoreSubscription.findById(id);

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        let seller = null;
        if (req.body.sellerId) {
            seller = await findSellerOrFail(req.body.sellerId);
            record.sellerId = seller._id;
            record.sellerName = getSellerDisplayName(seller);
        }

        if (req.body.month !== undefined) {
            const normalizedMonth = normalizeMonth(req.body.month);
            if (!normalizedMonth) {
                return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
            }
            record.month = normalizedMonth;
        }

        if (req.body.billingCycle !== undefined) {
            record.billingCycle = String(req.body.billingCycle).toLowerCase();
        }

        if (req.body.amount !== undefined) {
            record.amount = Number(req.body.amount) || 0;
            record.expenses = record.amount;
        }

        if (req.body.notes !== undefined) {
            record.notes = String(req.body.notes || '').trim();
        }

        record.date = buildLegacyDate(record.month);
        record.accountName = buildLegacyAccountName(record.sellerId, record.billingCycle);
        record.remarks = record.billingCycle;

        await record.save();
        await record.populate({
            path: 'sellerId',
            select: 'user',
            populate: { path: 'user', select: 'username email' },
        });

        res.json(mapRecord(record));
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'A subscription record already exists for this seller, month, and billing cycle' });
        }
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

router.delete('/:id', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const { id } = req.params;
        const record = await StoreSubscription.findById(id);

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        await StoreSubscription.findByIdAndDelete(id);
        res.json({ message: 'Subscription record deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
