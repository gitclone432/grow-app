import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyOrderFulfilment from '../models/EtsyOrderFulfilment.js';
import EtsyStore from '../models/EtsyStore.js';
import { normalizeIdentifierString } from '../utils/normalizeIdentifierString.js';
import { applyAmazonPricingToUpdate, enrichOrderRow, formatExRate, formatEtsyRupeeInputFields, formatRupeeField, ETSY_RUPEE_INPUT_FIELDS } from '../utils/etsyOrderPricing.js';
import { normalizeEtsyRegion } from '../utils/etsyAddressZip.js';
const router = Router();

export const ETSY_ORDER_FULFILMENT_FIELDS = [
  'dateSold',
  'etsyOrdersReceivedTime',
  'shipBy',
  'estimateEtsyDelivery',
  'productName',
  'sku',
  'address',
  'zipCode',
  'region',
  'qty',
  'note',
  'messageUpdate',
  'soldFor',
  'tax',
  'total',
  'etsyFee',
  'processingFee',
  'regulatoryOperatingFee',
  'tds',
  'tcs',
  'offsiteAds',
  'coupons',
  'relistFee',
  'tId',
  'net',
  'estimateAmazonDelivery',
  'amazonAccount',
  'cardNo',
  'itemCost',
  'shipCost',
  'amazonTax',
  'totalInUsd',
  'totalInRs',
  'markUpFee',
  'igst',
  'amazonTotal',
  'exRate',
  'inHand',
  'issuesIfAny',
  'trackingId',
  'remark',
  'trackingIdUploaded',
  'amazonOrderNumber',
  'orderStatus',
  'refund',
];

const IDENTIFIER_FIELDS = new Set(['trackingId', 'amazonOrderNumber']);

function normalizeFieldValue(key, value) {
  const str = value == null ? '' : String(value);
  if (ETSY_RUPEE_INPUT_FIELDS.has(key)) {
    return formatRupeeField(str);
  }
  if (key === 'exRate') {
    return formatExRate(str);
  }
  if (key === 'region') {
    return normalizeEtsyRegion(str);
  }
  if (IDENTIFIER_FIELDS.has(key)) {
    return normalizeIdentifierString(str);
  }
  return str;
}

function pickAllowedFields(body = {}) {
  const update = {};
  for (const key of ETSY_ORDER_FULFILMENT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      update[key] = normalizeFieldValue(key, body[key]);
    }
  }
  return update;
}

function createEmptyRecord() {
  return Object.fromEntries(ETSY_ORDER_FULFILMENT_FIELDS.map((key) => [key, '']));
}

function enrichOrderRowFromDb(order = {}) {
  const storeRef = order.store;
  const storeId = storeRef && typeof storeRef === 'object' ? storeRef._id : storeRef;
  const storeName = storeRef && typeof storeRef === 'object' ? storeRef.name : '';

  return enrichOrderRow({
    ...order,
    store: storeId,
    storeName: storeName || order.storeName || '',
    sku: order.sku ?? order.itemNumber ?? '',
    trackingId: normalizeIdentifierString(order.trackingId),
    amazonOrderNumber: normalizeIdentifierString(order.amazonOrderNumber),
    itemCost: order.itemCost || order.amazonPrice || '',
  });
}
function normalizeOrderRow(order = {}) {
  return enrichOrderRowFromDb(order);
}

function isRowEmpty(row = {}) {
  return ETSY_ORDER_FULFILMENT_FIELDS.every((key) => !String(row[key] || '').trim());
}

async function resolveStoreId(storeId) {
  if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
    return null;
  }
  return EtsyStore.findById(storeId).lean();
}

async function getMaxRowOrder(storeId) {
  const edge = await EtsyOrderFulfilment.findOne({ store: storeId })
    .sort({ rowOrder: -1 })
    .select('rowOrder')
    .lean();
  return edge?.rowOrder ?? -1;
}

async function getNextRowOrderForStore(storeId) {
  return (await getMaxRowOrder(storeId)) + 1;
}

function parseSortableDate(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortOrdersForDisplay(orders = []) {
  return [...orders].sort((a, b) => {
    if (b.rowOrder !== a.rowOrder) return b.rowOrder - a.rowOrder;

    const dateDiff = parseSortableDate(b.dateSold) - parseSortableDate(a.dateSold);
    if (dateDiff !== 0) return dateDiff;

    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function assignImportRowOrders(rows, { mode, maxRowOrder = -1 }) {
  return rows.map((row, index) => ({
    ...row,
    rowOrder: mode === 'replace' ? index : maxRowOrder + index + 1,
  }));
}

// GET /api/etsy/order-fulfilment?storeId=
router.get('/', requireAuth, requirePageAccess('EtsyOrderFulfilment'), async (req, res) => {
  try {
    const { storeId } = req.query;
    const filter = {};

    if (storeId) {
      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        return res.status(400).json({ error: 'Invalid store id' });
      }
      filter.store = storeId;
    }

    const orders = await EtsyOrderFulfilment.find(filter)
      .populate('store', 'name')
      .lean();
    res.json({ orders: sortOrdersForDisplay(orders).map(normalizeOrderRow) });
  } catch (err) {
    console.error('[Etsy Order Fulfilment] list failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/etsy/order-fulfilment
router.post('/', requireAuth, requirePageAccess('EtsyOrderFulfilment'), async (req, res) => {
  try {
    const store = await resolveStoreId(req.body.storeId);
    if (!store) {
      return res.status(400).json({ error: 'Valid storeId is required' });
    }

    const payload = {
      ...createEmptyRecord(),
      ...pickAllowedFields(req.body),
      store: store._id,
      rowOrder: await getNextRowOrderForStore(store._id),
    };
    const pricedPayload = enrichOrderRow(payload);
    const order = await EtsyOrderFulfilment.create(pricedPayload);
    res.status(201).json({
      order: normalizeOrderRow({
        ...order.toObject(),
        store: { _id: store._id, name: store.name },
      }),
    });
  } catch (err) {
    console.error('[Etsy Order Fulfilment] create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/etsy/order-fulfilment/bulk-import
router.post('/bulk-import', requireAuth, requirePageAccess('EtsyOrderFulfilment'), async (req, res) => {
  try {
    const { storeId, rows, mode = 'append' } = req.body;
    const store = await resolveStoreId(storeId);

    if (!store) {
      return res.status(400).json({ error: 'Valid storeId is required' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }
    if (!['append', 'replace'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be append or replace' });
    }

    const prepared = rows
      .map((row) => enrichOrderRow({ ...createEmptyRecord(), ...pickAllowedFields(row) }))
      .filter((row) => !isRowEmpty(row));

    if (prepared.length === 0) {
      return res.status(400).json({ error: 'No data rows found in upload' });
    }

    let deletedCount = 0;
    if (mode === 'replace') {
      const deleteResult = await EtsyOrderFulfilment.deleteMany({ store: store._id });
      deletedCount = deleteResult.deletedCount || 0;
    }

    const maxRowOrder = mode === 'replace' ? -1 : await getMaxRowOrder(store._id);

    const docs = assignImportRowOrders(
      prepared.map((row) => ({ ...row, store: store._id })),
      { mode, maxRowOrder }
    );
    const chunkSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const inserted = await EtsyOrderFulfilment.insertMany(chunk, { ordered: false });
      insertedCount += inserted.length;
    }

    res.json({
      success: true,
      storeId: store._id,
      mode,
      deletedCount,
      insertedCount,
      skippedEmptyRows: rows.length - prepared.length,
    });
  } catch (err) {
    console.error('[Etsy Order Fulfilment] bulk import failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/etsy/order-fulfilment/:id
router.patch('/:id', requireAuth, requirePageAccess('EtsyOrderFulfilment'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const existing = await EtsyOrderFulfilment.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const update = applyAmazonPricingToUpdate(existing, pickAllowedFields(req.body));
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const order = await EtsyOrderFulfilment.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate('store', 'name')
      .lean();

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order: normalizeOrderRow(order) });
  } catch (err) {
    console.error('[Etsy Order Fulfilment] update failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/etsy/order-fulfilment/:id
router.delete('/:id', requireAuth, requirePageAccess('EtsyOrderFulfilment'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const order = await EtsyOrderFulfilment.findByIdAndDelete(id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Etsy Order Fulfilment] delete failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
