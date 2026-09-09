import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyStore from '../models/EtsyStore.js';
import { normalizeIdentifierString } from '../utils/normalizeIdentifierString.js';
import { applyAmazonPricingToUpdate, enrichOrderRow, formatExRate, formatRupeeField, ETSY_RUPEE_INPUT_FIELDS } from '../utils/etsyOrderPricing.js';
import { normalizeEtsyRegion } from '../utils/etsyAddressZip.js';

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
  'additionalFees',
  'relistFee',
  'tId',
  'net',
  'estimateAmazonDelivery',
  'customerName',
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

export function normalizeOrderRow(order = {}) {
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

function isRowEmpty(row = {}) {
  return ETSY_ORDER_FULFILMENT_FIELDS.every((key) => !String(row[key] || '').trim());
}

async function resolveStoreId(storeId) {
  if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
    return null;
  }
  return EtsyStore.findById(storeId).lean();
}

export function parseSortableDate(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function toDateKey(value) {
  const timestamp = parseSortableDate(value);
  if (!timestamp) return '';
  return new Date(timestamp).toISOString().slice(0, 10);
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

/**
 * Builds the CRUD + import router for one Etsy order sheet.
 * Order Fulfilment and Profit Sheet each own a separate collection.
 */
export function createEtsyOrderSheetRouter({ Model, pages, logLabel }) {
  const router = Router();
  const access = requirePageAccess(pages);

  async function getMaxRowOrder(storeId) {
    const edge = await Model.findOne({ store: storeId })
      .sort({ rowOrder: -1 })
      .select('rowOrder')
      .lean();
    return edge?.rowOrder ?? -1;
  }

  router.get('/', requireAuth, access, async (req, res) => {
    try {
      const { storeId } = req.query;
      const filter = {};

      if (storeId) {
        if (!mongoose.Types.ObjectId.isValid(storeId)) {
          return res.status(400).json({ error: 'Invalid store id' });
        }
        filter.store = storeId;
      }

      const orders = await Model.find(filter)
        .populate('store', 'name')
        .lean();
      res.json({ orders: sortOrdersForDisplay(orders).map(normalizeOrderRow) });
    } catch (err) {
      console.error(`[${logLabel}] list failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', requireAuth, access, async (req, res) => {
    try {
      const store = await resolveStoreId(req.body.storeId);
      if (!store) {
        return res.status(400).json({ error: 'Valid storeId is required' });
      }

      const payload = {
        ...createEmptyRecord(),
        ...pickAllowedFields(req.body),
        store: store._id,
        rowOrder: (await getMaxRowOrder(store._id)) + 1,
      };
      const order = await Model.create(enrichOrderRow(payload));
      res.status(201).json({
        order: normalizeOrderRow({
          ...order.toObject(),
          store: { _id: store._id, name: store.name },
        }),
      });
    } catch (err) {
      console.error(`[${logLabel}] create failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/bulk-import', requireAuth, access, async (req, res) => {
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
        const deleteResult = await Model.deleteMany({ store: store._id });
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
        const inserted = await Model.insertMany(chunk, { ordered: false });
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
      console.error(`[${logLabel}] bulk import failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id', requireAuth, access, async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }

      const existing = await Model.findById(id).lean();
      if (!existing) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const update = applyAmazonPricingToUpdate(existing, pickAllowedFields(req.body));
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const order = await Model.findByIdAndUpdate(
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
      console.error(`[${logLabel}] update failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', requireAuth, access, async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid order id' });
      }

      const order = await Model.findByIdAndDelete(id);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(`[${logLabel}] delete failed:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
