import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createSubcategorySchema } from '../schemas/index.js';
import Subcategory from '../models/Subcategory.js';

const router = Router();

router.post('/', requireAuth, requirePageAccess('ManageCategories'), validate(createSubcategorySchema), async (req, res) => {
  const { name, categoryId } = req.body || {};
  if (!name || !categoryId) return res.status(400).json({ error: 'name and categoryId required' });
  try {
    const subcategory = await Subcategory.create({ name, category: categoryId });
    await subcategory.populate('category');
    res.json(subcategory);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const { categoryId } = req.query || {};
  const query = categoryId ? { category: categoryId } : {};
  const items = await Subcategory.find(query).populate('category').sort({ name: 1 });
  res.json(items);
});

export default router;

