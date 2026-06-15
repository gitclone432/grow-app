import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyStore from '../models/EtsyStore.js';

const router = Router();

// GET /api/etsy/stores
router.get('/', requireAuth, requirePageAccess(['EtsyStoresPage', 'EtsyOrderFulfilment']), async (req, res) => {
  try {
    const stores = await EtsyStore.find({}).sort({ name: 1 }).lean();
    res.json({ stores });
  } catch (err) {
    console.error('[Etsy Stores] list failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/etsy/stores
router.post('/', requireAuth, requirePageAccess('EtsyStoresPage'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Store name is required' });
    }

    const existing = await EtsyStore.findOne({ name }).lean();
    if (existing) {
      return res.json({ store: existing, created: false });
    }

    const store = await EtsyStore.create({ name });
    res.status(201).json({ store: store.toObject(), created: true });
  } catch (err) {
    if (err.code === 11000) {
      const store = await EtsyStore.findOne({ name: String(req.body.name || '').trim() }).lean();
      return res.json({ store, created: false });
    }
    console.error('[Etsy Stores] create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
