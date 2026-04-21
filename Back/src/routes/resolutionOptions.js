import express from 'express';
import ResolutionOption from '../models/ResolutionOption.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_OPTIONS = ['Replace', 'Reorder'];

async function ensureDefaultOptions() {
    await Promise.all(
        DEFAULT_OPTIONS.map(name =>
            ResolutionOption.findOneAndUpdate(
                { name },
                { $setOnInsert: { name } },
                { upsert: true, new: false }
            )
        )
    );
}

router.get('/', requireAuth, async (req, res) => {
    try {
        await ensureDefaultOptions();
        const options = await ResolutionOption.find().sort({ name: 1 });
        res.json(options);
    } catch (error) {
        console.error('Error fetching resolution options:', error);
        res.status(500).json({ error: 'Failed to fetch resolution options' });
    }
});

router.post('/', requireAuth, requirePageAccess('Disputes'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Resolution option name is required' });
        }

        const option = new ResolutionOption({ name: name.trim() });
        await option.save();
        res.status(201).json(option);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'This resolution option already exists' });
        }
        console.error('Error creating resolution option:', error);
        res.status(500).json({ error: 'Failed to create resolution option' });
    }
});

router.patch('/:id', requireAuth, requirePageAccess('Disputes'), async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'Resolution option name is required' });
        }

        const option = await ResolutionOption.findByIdAndUpdate(
            req.params.id,
            { name: name.trim() },
            { new: true, runValidators: true }
        );

        if (!option) {
            return res.status(404).json({ error: 'Resolution option not found' });
        }

        res.json(option);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'This resolution option already exists' });
        }
        console.error('Error updating resolution option:', error);
        res.status(500).json({ error: 'Failed to update resolution option' });
    }
});

router.delete('/:id', requireAuth, requirePageAccess('Disputes'), async (req, res) => {
    try {
        const option = await ResolutionOption.findByIdAndDelete(req.params.id);
        if (!option) {
            return res.status(404).json({ error: 'Resolution option not found' });
        }

        res.json({ message: 'Resolution option deleted successfully' });
    } catch (error) {
        console.error('Error deleting resolution option:', error);
        res.status(500).json({ error: 'Failed to delete resolution option' });
    }
});

export default router;
