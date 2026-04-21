import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createRangeSchema } from '../schemas/index.js';
import Range from '../models/Range.js';
import Category from '../models/Category.js';

const router = Router();

router.post('/', requireAuth, requirePageAccess('ManageRanges'), validate(createRangeSchema), async (req, res) => {
  const { name, categoryId } = req.body || {};
  if (!name || !categoryId) return res.status(400).json({ error: 'name and categoryId required' });
  try {
    const range = await Range.create({ name, category: categoryId });
    await range.populate('category');
    res.json(range);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const { categoryId } = req.query || {};
  
  let query = {};
  
  if (categoryId) {
    query.category = categoryId;
  }
  
  const items = await Range.find(query).populate('category').sort({ name: 1 });
  res.json(items);
});

export default router;
