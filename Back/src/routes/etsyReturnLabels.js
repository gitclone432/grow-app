import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyOrderFulfilment from '../models/EtsyOrderFulfilment.js';
import EtsyReturnLabel from '../models/EtsyReturnLabel.js';
import {
  createEtsyOrderSheetRouter,
  normalizeOrderRow,
  ETSY_ORDER_FULFILMENT_FIELDS,
} from './etsyOrderSheetRouter.js';

const router = Router();
const fulfilmentAccess = requirePageAccess(['EtsyReturnLabels', 'EtsyOrderFulfilment']);

// GET /api/etsy/return-labels/source-ids — fulfilment rows that already have a return label
router.get('/source-ids', requireAuth, fulfilmentAccess, async (req, res) => {
  try {
    const ids = await EtsyReturnLabel.distinct('sourceOrder', { sourceOrder: { $ne: null } });
    res.json({ sourceOrderIds: ids.map(String) });
  } catch (err) {
    console.error('[Etsy Return Labels] source-ids failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/etsy/return-labels/from-fulfilment/:orderId — copy a fulfilment row into Return Labels
router.post('/from-fulfilment/:orderId', requireAuth, fulfilmentAccess, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const source = await EtsyOrderFulfilment.findById(orderId).lean();
    if (!source) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const existing = await EtsyReturnLabel.findOne({ sourceOrder: source._id }).select('_id').lean();
    if (existing) {
      return res.status(409).json({ error: 'Return label already exists for this order' });
    }

    const edge = await EtsyReturnLabel.findOne({ store: source.store })
      .sort({ rowOrder: -1 })
      .select('rowOrder')
      .lean();

    const payload = {
      ...Object.fromEntries(ETSY_ORDER_FULFILMENT_FIELDS.map((key) => [key, source[key] ?? ''])),
      store: source.store,
      sourceOrder: source._id,
      rowOrder: (edge?.rowOrder ?? -1) + 1,
      ambiguousDatesSwapped: source.ambiguousDatesSwapped ?? true,
    };

    const created = await EtsyReturnLabel.create(payload);
    const order = await EtsyReturnLabel.findById(created._id).populate('store', 'name').lean();
    res.status(201).json({ order: normalizeOrderRow(order) });
  } catch (err) {
    console.error('[Etsy Return Labels] create from fulfilment failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.use(createEtsyOrderSheetRouter({
  Model: EtsyReturnLabel,
  pages: 'EtsyReturnLabels',
  logLabel: 'Etsy Return Labels',
  onRowUpdated: async (order, update) => {
    if (!order.sourceOrder) return;
    await EtsyOrderFulfilment.updateOne({ _id: order.sourceOrder }, { $set: update });
  },
}));

export default router;
