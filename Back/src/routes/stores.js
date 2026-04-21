import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { createStoreSchema } from '../schemas/index.js';
import Store from '../models/Store.js';

const router = Router();

router.post('/', requireAuth, requirePageAccess('ManageStores'), validate(createStoreSchema), async (req, res) => {
  const { name, platformId } = req.body || {};
  if (!name || !platformId) return res.status(400).json({ error: 'name and platformId required' });
  try {
    const store = await Store.create({ name, platform: platformId });
    res.json(store);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  const { platformId } = req.query || {};
  const query = platformId ? { platform: platformId } : {};
  const items = await Store.find(query).populate('platform').sort({ name: 1 });
  res.json(items);
});

export default router;


