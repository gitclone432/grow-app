import express from 'express';
import PaymentAccount from '../models/PaymentAccount.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createPaymentAccountSchema } from '../schemas/index.js';

const router = express.Router();

// GET /api/payment-accounts - List all
router.get('/', requireAuth, requirePageAccess('BankAccounts'), async (req, res) => {
    try {
        const accounts = await PaymentAccount.find()
            .populate('bankAccount', 'name')
            .sort({ name: 1 });
        res.json(accounts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/payment-accounts - Create
router.post('/', requireAuth, requirePageAccess('BankAccounts'), validate(createPaymentAccountSchema), async (req, res) => {
    try {
        const { name, bankAccount } = req.body;
        if (!name || !bankAccount) {
            return res.status(400).json({ error: 'Name and Bank Account are required' });
        }
        const newAccount = new PaymentAccount({ name, bankAccount });
        await newAccount.save();
        await newAccount.populate('bankAccount', 'name');
        res.status(201).json(newAccount);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Account name must be unique' });
        }
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/payment-accounts/:id - Update
router.put('/:id', requireAuth, requirePageAccess('BankAccounts'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, bankAccount } = req.body;
        const account = await PaymentAccount.findByIdAndUpdate(
            id,
            { name, bankAccount },
            { new: true }
        ).populate('bankAccount', 'name');
        res.json(account);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/payment-accounts/:id - Delete
router.delete('/:id', requireAuth, requirePageAccess('BankAccounts'), async (req, res) => {
    try {
        const { id } = req.params;
        await PaymentAccount.findByIdAndDelete(id);
        res.json({ message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
