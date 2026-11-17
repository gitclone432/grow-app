import express from 'express';
import IssueReasonOption from '../models/IssueReasonOption.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_OPTIONS = ['Out of Stock', 'Late Delivery', 'Listing Issue'];

// Seed only an empty collection, so a default the team deleted stays deleted.
async function seedDefaultOptions() {
    if (await IssueReasonOption.exists({})) return;
    try {
        await IssueReasonOption.insertMany(DEFAULT_OPTIONS.map((name) => ({ name })), { ordered: false });
    } catch (error) {
        // Two first-time requests can seed at once; the unique index keeps one copy.
        if (error.code !== 11000) throw error;
    }
}

router.get('/', requireAuth, async (req, res) => {
    try {
        await seedDefaultOptions();
        const options = await IssueReasonOption.find().sort({ createdAt: 1, _id: 1 });
        res.json(options);
    } catch (error) {
        console.error('Error fetching issue reason options:', error);
        res.status(500).json({ error: 'Failed to fetch reason options' });
    }
});

router.post('/', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Reason name is required' });
        }

        const option = await IssueReasonOption.create({ name });
        res.status(201).json(option);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'This reason already exists' });
        }
        console.error('Error creating issue reason option:', error);
        res.status(500).json({ error: 'Failed to create reason option' });
    }
});

router.patch('/:id', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        if (!name) {
            return res.status(400).json({ error: 'Reason name is required' });
        }

        const option = await IssueReasonOption.findByIdAndUpdate(
            req.params.id,
            { name },
            { new: true, runValidators: true }
        );

        if (!option) {
            return res.status(404).json({ error: 'Reason option not found' });
        }

        res.json(option);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'This reason already exists' });
        }
        console.error('Error updating issue reason option:', error);
        res.status(500).json({ error: 'Failed to update reason option' });
    }
});

router.delete('/:id', requireAuth, requirePageAccess('Fulfillment'), async (req, res) => {
    try {
        const option = await IssueReasonOption.findByIdAndDelete(req.params.id);
        if (!option) {
            return res.status(404).json({ error: 'Reason option not found' });
        }

        res.json({ message: 'Reason option deleted successfully' });
    } catch (error) {
        console.error('Error deleting issue reason option:', error);
        res.status(500).json({ error: 'Failed to delete reason option' });
    }
});

export default router;
