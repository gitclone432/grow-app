import express from 'express';
import ExtraExpense from '../models/ExtraExpense.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createExtraExpenseSchema } from '../schemas/index.js';

const router = express.Router();

// GET /api/extra-expenses - List all
router.get('/', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const expenses = await ExtraExpense.find().sort({ date: -1 });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/extra-expenses - Create
router.post('/', requireAuth, requirePageAccess('ExtraExpenses'), validate(createExtraExpenseSchema), async (req, res) => {
    try {
        const { date, name, amount, paidBy } = req.body;

        if (!date || !name || !amount || !paidBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const expense = new ExtraExpense({ date, name, amount, paidBy });
        await expense.save();
        res.status(201).json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/extra-expenses/:id - Update
router.put('/:id', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const { id } = req.params;
        const { date, name, amount, paidBy } = req.body;

        const expense = await ExtraExpense.findById(id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        if (date) expense.date = date;
        if (name) expense.name = name;
        if (amount !== undefined) expense.amount = amount;
        if (paidBy) expense.paidBy = paidBy;

        await expense.save();
        res.json(expense);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/extra-expenses/:id - Delete
router.delete('/:id', requireAuth, requirePageAccess('ExtraExpenses'), async (req, res) => {
    try {
        const { id } = req.params;
        const expense = await ExtraExpense.findById(id);
        if (!expense) return res.status(404).json({ error: 'Expense not found' });

        await ExtraExpense.findByIdAndDelete(id);
        res.json({ message: 'Expense deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
