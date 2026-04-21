import express from 'express';
import CreditCard from '../models/CreditCard.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createCreditCardSchema } from '../schemas/index.js';

const router = express.Router();

// Get all credit cards
router.get('/', requireAuth, async (req, res) => {
  try {
    const cards = await CreditCard.find().sort({ name: 1 });
    res.json(cards);
  } catch (error) {
    console.error('Error fetching credit cards:', error);
    res.status(500).json({ error: 'Failed to fetch credit cards' });
  }
});

// Create a new credit card
router.post('/', requireAuth, requirePageAccess('CreditCards'), validate(createCreditCardSchema), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Card name is required' });
    }

    const card = new CreditCard({ name: name.trim() });
    await card.save();
    res.status(201).json(card);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'A credit card with this name already exists' });
    }
    console.error('Error creating credit card:', error);
    res.status(500).json({ error: 'Failed to create credit card' });
  }
});

// Delete a credit card
router.delete('/:id', requireAuth, requirePageAccess('CreditCards'), async (req, res) => {
  try {
    const card = await CreditCard.findByIdAndDelete(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Credit card not found' });
    }
    res.json({ message: 'Credit card deleted successfully' });
  } catch (error) {
    console.error('Error deleting credit card:', error);
    res.status(500).json({ error: 'Failed to delete credit card' });
  }
});

export default router;
