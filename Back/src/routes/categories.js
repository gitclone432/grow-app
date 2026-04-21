import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createCategorySchema } from '../schemas/index.js';
import Category from '../models/Category.js';

const router = Router();

router.post('/', requireAuth, requirePageAccess('ManageCategories'), validate(createCategorySchema), async (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const category = await Category.create({ name });
    res.json(category);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const items = await Category.find().sort({ name: 1 });
  res.json(items);
});

export default router;
