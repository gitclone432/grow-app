import express from 'express';
import ReturnIssueOption, { RETURN_ISSUE_OPTION_TYPES } from '../models/ReturnIssueOption.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_OPTIONS = {
    accountable: ['Buyer', 'Lister', 'Compliance', 'Bot', 'Affiliate', 'Amazon'],
    product: []
};

function validateType(req, res, next) {
    if (!RETURN_ISSUE_OPTION_TYPES.includes(req.params.type)) {
        return res.status(400).json({ error: 'Invalid option type' });
    }
    next();
}

// Seed only an empty list, so a default the team deleted stays deleted.
async function seedDefaultOptions(type) {
    const defaults = DEFAULT_OPTIONS[type] || [];
    if (!defaults.length || await ReturnIssueOption.exists({ type })) return;
    try {
        await ReturnIssueOption.insertMany(defaults.map((name) => ({ type, name })), { ordered: false });
    } catch (error) {
        // Two first-time requests can seed at once; the unique index keeps one copy.
        if (error.code !== 11000) throw error;
    }
}

router.get('/:type', requireAuth, validateType, async (req, res) => {
    try {
        const { type } = req.params;
        await seedDefaultOptions(type);
        const options = await ReturnIssueOption.find({ type }).sort({ createdAt: 1, _id: 1 });
        res.json(options);
    } catch (error) {
        console.error('Error fetching return issue options:', error);
        res.status(500).json({ error: 'Failed to fetch options' });
    }
});

router.post('/:type', requireAuth, requirePageAccess('Disputes'), validateType, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Option name is required' });
        }

        const option = await ReturnIssueOption.create({ type: req.params.type, name });
        res.status(201).json(option);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'This option already exists' });
        }
        console.error('Error creating return issue option:', error);
        res.status(500).json({ error: 'Failed to create option' });
    }
});

router.patch('/:type/:id', requireAuth, requirePageAccess('Disputes'), validateType, async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Option name is required' });
        }

        const option = await ReturnIssueOption.findOneAndUpdate(
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
        console.error('Error updating return issue option:', error);
        res.status(500).json({ error: 'Failed to update option' });
    }
});

router.delete('/:type/:id', requireAuth, requirePageAccess('Disputes'), validateType, async (req, res) => {
    try {
        const option = await ReturnIssueOption.findOneAndDelete({ _id: req.params.id, type: req.params.type });
        if (!option) {
            return res.status(404).json({ error: 'Option not found' });
        }

        res.json({ message: 'Option deleted successfully' });
    } catch (error) {
        console.error('Error deleting return issue option:', error);
        res.status(500).json({ error: 'Failed to delete option' });
    }
});

export default router;
