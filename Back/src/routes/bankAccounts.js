import express from 'express';
import BankAccount from '../models/BankAccount.js';
import PayoneerRecord from '../models/PayoneerRecord.js';
import Seller from '../models/Seller.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createBankAccountSchema } from '../schemas/index.js';
import { formatLinkedSellerHint } from '../utils/bankAccountSellerHint.js';

const router = express.Router();

// GET /api/bank-accounts - List all
// Accessible from both BankAccounts page and Transactions page (for dropdown)
router.get('/', requireAuth, requirePageAccess(['BankAccounts', 'Transactions', 'Payoneer', 'ExtraExpenses']), async (req, res) => {
    try {
        const [accounts, sellers, countAgg] = await Promise.all([
            BankAccount.find().sort({ name: 1, createdAt: 1 }).lean(),
            Seller.find().populate('user', 'username email').select('user').lean(),
            PayoneerRecord.aggregate([
                { $group: { _id: '$bankAccount', count: { $sum: 1 } } }
            ]),
        ]);
        const countMap = new Map(countAgg.map((d) => [d._id.toString(), d.count]));
        const withCounts = accounts.map((a) => ({
            ...a,
            payoneerRecordCount: countMap.get(a._id.toString()) || 0,
            linkedSellerHint: formatLinkedSellerHint(a.sellers, sellers),
        }));
        res.json(withCounts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/bank-accounts - Create
router.post('/', requireAuth, requirePageAccess('BankAccounts'), validate(createBankAccountSchema), async (req, res) => {
    try {
        const { name, accountNumber, ifscCode, payoneerId, sellers } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }
        const newAccount = new BankAccount({ name, accountNumber, ifscCode, payoneerId, sellers });
        await newAccount.save();
        res.status(201).json(newAccount);
    } catch (err) {
        if (err?.code === 11000 && String(err.message || '').includes('name')) {
            return res.status(400).json({
                error:
                    'Duplicate bank names are blocked until the old unique index is removed. Restart the API after deploying the latest backend (it syncs indexes on startup), or in MongoDB run: db.bankaccounts.dropIndex("name_1").',
            });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/bank-accounts/:id - Update
router.put('/:id', requireAuth, requirePageAccess('BankAccounts'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, accountNumber, ifscCode, payoneerId, sellers } = req.body;
        const account = await BankAccount.findByIdAndUpdate(
            id,
            { name, accountNumber, ifscCode, payoneerId, sellers },
            { new: true }
        );
        res.json(account);
    } catch (err) {
        if (err?.code === 11000 && String(err.message || '').includes('name')) {
            return res.status(400).json({
                error:
                    'That bank name is still tied to a unique index in the database. Restart the API after deploying the latest backend, or drop index name_1 on bankaccounts.',
            });
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/bank-accounts/:id - Delete
router.delete('/:id', requireAuth, requirePageAccess('BankAccounts'), async (req, res) => {
    try {
        const { id } = req.params;
        await BankAccount.findByIdAndDelete(id);
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
