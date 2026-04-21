import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createPlatformSchema } from '../schemas/index.js';
import Platform from '../models/Platform.js';

const router = Router();

router.post('/', requireAuth, requirePageAccess('ManagePlatforms'), validate(createPlatformSchema), async (req, res) => {
  const { name, type } = req.body || {};
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  try {
    const platform = await Platform.create({ name, type });
    res.json(platform);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const { type } = req.query;
  const query = type ? { type } : {};
  const items = await Platform.find(query).sort({ name: 1 });
  res.json(items);
});

export default router;


