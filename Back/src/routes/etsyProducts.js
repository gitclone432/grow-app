import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyProduct from '../models/EtsyProduct.js';
import EtsyStore from '../models/EtsyStore.js';
import { normalizeEtsyRegion } from '../utils/etsyAddressZip.js';
import { computeTimeLeftFromListedDate, enrichEtsyProductRow } from '../utils/etsyProductTimeLeft.js';
import { resolveSkuForProductLink } from '../utils/etsyProductSku.js';

const LISTING_STATUS_OPTIONS = ['Listed', 'Ended', 'Renew'];

const router = Router();

export const ETSY_PRODUCT_FIELDS = [
  'listedDate',
  'links',
  'sku',
  'supplierPrice',
  'listedPrice',
  'region',
  'listingStatus',
];

const LISTING_STATUS_VALUES = new Set([...LISTING_STATUS_OPTIONS, '']);

function normalizeListingStatus(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  if (LISTING_STATUS_VALUES.has(raw)) return raw;

  const aliases = {
    Active: 'Listed',
    Draft: 'Listed',
    Expired: 'Ended',
    Inactive: 'Ended',
    'Sold Out': 'Ended',
    Listed: 'Listed',
    Ended: 'Ended',
    Renew: 'Renew',
  };

  return aliases[raw] || raw;
}

function normalizeFieldValue(key, value) {
  const str = value == null ? '' : String(value);
  if (key === 'region') return normalizeEtsyRegion(str);
  if (key === 'listingStatus') return normalizeListingStatus(str);
  if (key === 'supplierPrice' || key === 'listedPrice') {
    const cleaned = str.replace(/[$₹,\s]/g, '');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? String(num) : str;
  }
  return str;
}

function pickAllowedFields(body = {}) {
  const update = {};
  for (const key of ETSY_PRODUCT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      update[key] = normalizeFieldValue(key, body[key]);
    }
  }
  return update;
}

function createEmptyRecord() {
  return Object.fromEntries(ETSY_PRODUCT_FIELDS.map((key) => [key, '']));
}

function normalizeProductRow(product = {}) {
  const storeRef = product.store;
  const storeId = storeRef && typeof storeRef === 'object' ? storeRef._id : storeRef;
  const storeName = storeRef && typeof storeRef === 'object' ? storeRef.name : '';

  return enrichEtsyProductRow({
    ...product,
    store: storeId,
    storeName: storeName || product.storeName || '',
    listingStatus: normalizeListingStatus(product.listingStatus),
  });
}

function isRowEmpty(row = {}) {
  return ETSY_PRODUCT_FIELDS.every((key) => !String(row[key] || '').trim());
}

async function resolveStoreId(storeId) {
  if (!storeId || !mongoose.Types.ObjectId.isValid(storeId)) {
    return null;
  }
  return EtsyStore.findById(storeId).lean();
}

async function getMaxRowOrder(storeId) {
  const edge = await EtsyProduct.findOne({ store: storeId })
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

function sortProductsForDisplay(products = []) {
  return [...products].sort((a, b) => {
    if (b.rowOrder !== a.rowOrder) return b.rowOrder - a.rowOrder;

    const dateDiff = parseSortableDate(b.listedDate) - parseSortableDate(a.listedDate);
    if (dateDiff !== 0) return dateDiff;

    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

async function applyAutoSku(update, existing = {}) {
  const links = Object.prototype.hasOwnProperty.call(update, 'links')
    ? update.links
    : existing.links;

  const currentSku = Object.prototype.hasOwnProperty.call(update, 'sku')
    ? update.sku
    : existing.sku;

  const sku = await resolveSkuForProductLink(links, {
    productId: existing._id,
    currentSku,
  });

  if (sku) {
    update.sku = sku;
  }
}

async function backfillMissingSkus(products = []) {
  let changed = false;

  for (const product of products) {
    if (String(product.sku || '').trim()) continue;

    const sku = await resolveSkuForProductLink(product.links, {
      productId: product._id,
      currentSku: product.sku,
    });

    if (!sku) continue;

    await EtsyProduct.findByIdAndUpdate(product._id, { $set: { sku } });
    product.sku = sku;
    changed = true;
  }

  return changed;
}

function assignImportRowOrders(rows, { mode, maxRowOrder = -1 }) {
  return rows.map((row, index) => ({
    ...row,
    rowOrder: mode === 'replace' ? index : maxRowOrder + index + 1,
  }));
}

// GET /api/etsy/products?storeId=
router.get('/', requireAuth, requirePageAccess('EtsyProducts'), async (req, res) => {
  try {
    const { storeId } = req.query;
    const filter = {};

    if (storeId) {
      if (!mongoose.Types.ObjectId.isValid(storeId)) {
        return res.status(400).json({ error: 'Invalid store id' });
      }
      filter.store = storeId;
    }

    const products = await EtsyProduct.find(filter)
      .populate('store', 'name')
      .lean();

    await backfillMissingSkus(products);

    res.json({ products: sortProductsForDisplay(products).map(normalizeProductRow) });
  } catch (err) {
    console.error('[Etsy Products] list failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/etsy/products
router.post('/', requireAuth, requirePageAccess('EtsyProducts'), async (req, res) => {
  try {
    const store = await resolveStoreId(req.body.storeId);
    if (!store) {
      return res.status(400).json({ error: 'Valid storeId is required' });
    }

    const fields = pickAllowedFields(req.body);
    const product = await EtsyProduct.create({
      ...createEmptyRecord(),
      ...fields,
      timeLeft: computeTimeLeftFromListedDate(fields.listedDate),
      store: store._id,
      rowOrder: await getNextRowOrderForStore(store._id),
    });

    const skuUpdate = {};
    await applyAutoSku(skuUpdate, product.toObject());
    if (skuUpdate.sku) {
      product.sku = skuUpdate.sku;
      await product.save();
    }

    res.status(201).json({
      product: normalizeProductRow({
        ...product.toObject(),
        store: { _id: store._id, name: store.name },
      }),
    });
  } catch (err) {
    console.error('[Etsy Products] create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/etsy/products/bulk-import
router.post('/bulk-import', requireAuth, requirePageAccess('EtsyProducts'), async (req, res) => {
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

    const prepared = [];
    for (const row of rows) {
      const fields = pickAllowedFields(row);
      if (isRowEmpty(fields)) continue;

      const doc = {
        ...createEmptyRecord(),
        ...fields,
        timeLeft: computeTimeLeftFromListedDate(fields.listedDate),
        store: store._id,
      };

      await applyAutoSku(doc, doc);
      prepared.push(doc);
    }

    if (prepared.length === 0) {
      return res.status(400).json({ error: 'No data rows found in upload' });
    }

    let deletedCount = 0;
    if (mode === 'replace') {
      const deleteResult = await EtsyProduct.deleteMany({ store: store._id });
      deletedCount = deleteResult.deletedCount || 0;
    }

    const maxRowOrder = mode === 'replace' ? -1 : await getMaxRowOrder(store._id);
    const docs = assignImportRowOrders(prepared, { mode, maxRowOrder });

    const chunkSize = 500;
    let insertedCount = 0;

    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      const inserted = await EtsyProduct.insertMany(chunk, { ordered: false });
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
    console.error('[Etsy Products] bulk import failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/etsy/products/:id
router.patch('/:id', requireAuth, requirePageAccess('EtsyProducts'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const existing = await EtsyProduct.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const update = pickAllowedFields(req.body);

    if (Object.prototype.hasOwnProperty.call(req.body, 'store')) {
      const store = await resolveStoreId(req.body.store);
      if (!store) {
        return res.status(400).json({ error: 'Valid store is required' });
      }
      update.store = store._id;
    }

    if (Object.prototype.hasOwnProperty.call(update, 'listedDate')) {
      update.timeLeft = computeTimeLeftFromListedDate(update.listedDate);
    }

    if (
      Object.prototype.hasOwnProperty.call(update, 'links')
      || (Object.prototype.hasOwnProperty.call(update, 'sku') && !String(update.sku || '').trim())
    ) {
      await applyAutoSku(update, existing);
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const product = await EtsyProduct.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    )
      .populate('store', 'name')
      .lean();

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product: normalizeProductRow(product) });
  } catch (err) {
    console.error('[Etsy Products] update failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/etsy/products/:id
router.delete('/:id', requireAuth, requirePageAccess('EtsyProducts'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }

    const product = await EtsyProduct.findByIdAndDelete(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Etsy Products] delete failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
