import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createColumnPresetSchema } from '../schemas/index.js';
import ColumnPreset from '../models/ColumnPreset.js';

const router = Router();

// GET all presets (shared across all users), optionally filtered by page
router.get('/', requireAuth, async (req, res) => {
  try {
    const { page } = req.query;
    const query = {};
    if (page) query.page = page;
    
    const presets = await ColumnPreset.find(query).sort({ name: 1 });
    res.json(presets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CREATE a new preset
router.post('/', requireAuth, validate(createColumnPresetSchema), async (req, res) => {
  const { name, columns, page = 'dashboard' } = req.body || {};
  if (!name || !columns) {
    return res.status(400).json({ error: 'name and columns required' });
  }
  try {
    const preset = await ColumnPreset.create({
      name,
      columns,
      page,
      createdBy: req.user._id
    });
    res.json(preset);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// DELETE a preset
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await ColumnPreset.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
