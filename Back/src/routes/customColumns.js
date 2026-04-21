import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createCustomColumnSchema } from '../schemas/index.js';
import CustomColumn from '../models/CustomColumn.js';

const router = express.Router();

// Get all custom columns
router.get('/', requireAuth, async (req, res) => {
  try {
    const columns = await CustomColumn.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(columns);
  } catch (error) {
    console.error('Error fetching custom columns:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create custom column
router.post('/', requireAuth, validate(createCustomColumnSchema), async (req, res) => {
  try {
    const { name, prompt, dataType, description } = req.body;

    if (!name || !prompt) {
      return res.status(400).json({ error: 'Name and prompt are required' });
    }

    const column = new CustomColumn({
      name,
      prompt,
      dataType: dataType || 'text',
      description,
      createdBy: req.user.userId
    });

    await column.save();
    await column.populate('createdBy', 'name email');

    res.status(201).json(column);
  } catch (error) {
    console.error('Error creating custom column:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update custom column
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { name, prompt, dataType, description } = req.body;

    const column = await CustomColumn.findByIdAndUpdate(
      req.params.id,
      { name, prompt, dataType, description, updatedAt: Date.now() },
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!column) {
      return res.status(404).json({ error: 'Column not found' });
    }

    res.json(column);
  } catch (error) {
    console.error('Error updating custom column:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete custom column
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const column = await CustomColumn.findByIdAndDelete(req.params.id);

    if (!column) {
      return res.status(404).json({ error: 'Column not found' });
    }

    res.json({ message: 'Column deleted successfully' });
  } catch (error) {
    console.error('Error deleting custom column:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
