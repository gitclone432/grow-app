import express from 'express';
import AffiliateBalance from '../models/AffiliateBalance.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createAffiliateBalanceSchema, updateAffiliateBalanceSchema } from '../schemas/index.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/affiliate-balance - Get all records with optional filters
router.get('/', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const { date, accountName, startDate, endDate, marketplace } = req.query;
        const filter = {};

        // Date filtering
        if (date) {
            filter.date = date;
        } else if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = startDate;
            if (endDate) filter.date.$lte = endDate;
        }

        // Account name filtering
        if (accountName && accountName.trim()) {
            filter.accountName = accountName.trim();
        }

        // Marketplace filtering
        if (marketplace && marketplace.trim()) {
            filter.marketplace = marketplace.trim();
        }

        const records = await AffiliateBalance.find(filter).sort({ date: -1 }).exec();
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/affiliate-balance/accounts - Get unique account names
router.get('/accounts/list', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const accounts = await AffiliateBalance.distinct('accountName').exec();
        res.json(accounts.sort());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/affiliate-balance/cards - Get unique card numbers
router.get('/cards/list', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const cards = await AffiliateBalance.distinct('cardNo').exec();
        const filteredCards = cards.filter(card => card && card.trim() !== '');
        res.json(filteredCards.sort());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/affiliate-balance - Create new record
router.post('/', requirePageAccess('Affiliate'), validate(createAffiliateBalanceSchema), async (req, res) => {
    try {
        const { date, accountName, availableBalance, balanceAdded, totalBalance, cardNo, expenses, marketplace, remarks, notes } = req.body;

        if (!date || !accountName) {
            return res.status(400).json({ error: 'Date and account name are required' });
        }

        // Calculate totalBalance if not provided
        const calculatedTotal = totalBalance || (parseFloat(availableBalance || 0) + parseFloat(balanceAdded || 0));

        const record = new AffiliateBalance({
            date,
            accountName,
            availableBalance: parseFloat(availableBalance || 0),
            balanceAdded: parseFloat(balanceAdded || 0),
            totalBalance: calculatedTotal,
            cardNo: cardNo || '',
            expenses: parseFloat(expenses || 0),
            marketplace: marketplace || 'US',
            remarks: remarks || '',
            notes: notes || '',
        });

        await record.save();
        res.status(201).json(record);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Record for this account on this date already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/affiliate-balance/:id - Update record
router.put('/:id', requirePageAccess('Affiliate'), validate(updateAffiliateBalanceSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const record = await AffiliateBalance.findById(id);

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // Update fields
        if (req.body.date !== undefined) record.date = req.body.date;
        if (req.body.accountName !== undefined) record.accountName = req.body.accountName;
        if (req.body.availableBalance !== undefined) record.availableBalance = parseFloat(req.body.availableBalance || 0);
        if (req.body.balanceAdded !== undefined) record.balanceAdded = parseFloat(req.body.balanceAdded || 0);
        if (req.body.cardNo !== undefined) record.cardNo = req.body.cardNo || '';
        if (req.body.expenses !== undefined) record.expenses = parseFloat(req.body.expenses || 0);
        if (req.body.marketplace !== undefined) record.marketplace = req.body.marketplace || 'US';
        if (req.body.remarks !== undefined) record.remarks = req.body.remarks || '';
        if (req.body.notes !== undefined) record.notes = req.body.notes || '';

        // Recalculate totalBalance
        if (req.body.totalBalance !== undefined) {
            record.totalBalance = parseFloat(req.body.totalBalance || 0);
        } else if (req.body.availableBalance !== undefined || req.body.balanceAdded !== undefined) {
            record.totalBalance = record.availableBalance + record.balanceAdded;
        }

        await record.save();
        res.json(record);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Another record exists for this account on this date' });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/affiliate-balance/:id - Delete record
router.delete('/:id', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const { id } = req.params;
        const record = await AffiliateBalance.findById(id);

        if (!record) {
            return res.status(404).json({ error: 'Record not found' });
        }

        await AffiliateBalance.findByIdAndDelete(id);
        res.json({ message: 'Record deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/affiliate-balance/account/:accountName - Delete all records for an account
router.delete('/account/:accountName', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const { accountName } = req.params;
        const result = await AffiliateBalance.deleteMany({ accountName });
        res.json({ message: `Deleted ${result.deletedCount} records for account: ${accountName}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/affiliate-balance/card/:cardNo - Delete all records with a card number
router.delete('/card/:cardNo', requirePageAccess('Affiliate'), async (req, res) => {
    try {
        const { cardNo } = req.params;
        const result = await AffiliateBalance.deleteMany({ cardNo });
        res.json({ message: `Deleted ${result.deletedCount} records with card: ****${cardNo}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
