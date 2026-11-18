import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import EtsyProductSheetRow from '../models/EtsyProductSheetRow.js';
import EtsyStore from '../models/EtsyStore.js';
import {
  ETSY_PRODUCT_SHEET_FIELDS,
  ETSY_PRODUCT_SHEET_SKU_PREFIX,
  formatSheetSku,
  getNextSheetSkuNumber,
  getProductLinkKey,
  normalizeSheetCellValue,
} from '../utils/etsyProductSheet.js';

const router = Router();

const PAGE_ID = 'EtsyProductSheet';
const MAX_ROWS_PER_SAVE = 2000;
const MAX_ROWS_PER_INSERT = 500;
const MAX_ROWS_PER_DELETE = 10000;
const AUTO_SKU_QUERY = new RegExp(`^${ETSY_PRODUCT_SHEET_SKU_PREFIX}\\d+$`, 'i');

// Writes run one at a time so concurrent saves cannot hand out the same SKU or row position.
let writeChain = Promise.resolve();

function withSheetLock(task) {
  const run = writeChain.then(task);
  writeChain = run.catch(() => {});
  return run;
}

function isValidId(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

function createEmptyFields() {
  return { store: '', ...Object.fromEntries(ETSY_PRODUCT_SHEET_FIELDS.map((field) => [field, ''])) };
}

function pickStoredFields(doc = {}) {
  return {
    store: doc.store ? String(doc.store) : '',
    ...Object.fromEntries(ETSY_PRODUCT_SHEET_FIELDS.map((field) => [field, doc[field] || ''])),
  };
}

function pickIncomingFields(item = {}) {
  const fields = {};
  for (const field of ETSY_PRODUCT_SHEET_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(item, field)) continue;
    const value = item[field];
    fields[field] = normalizeSheetCellValue(field, value !== null && typeof value === 'object' ? '' : value);
  }
  if (Object.prototype.hasOwnProperty.call(item, 'store')) {
    fields.store = typeof item.store === 'string' ? item.store.trim() : '';
  }
  return fields;
}

function toClientRow(doc) {
  return { id: String(doc._id), ...pickStoredFields(doc) };
}

/** Rejects store ids that are malformed or no longer exist; returns an error message or ''. */
async function validateStores(incoming) {
  const storeIds = new Set();
  for (const item of incoming) {
    if (item.store === undefined || item.store === null || item.store === '') continue;
    if (!isValidId(item.store)) return 'Invalid store id';
    storeIds.add(item.store);
  }
  if (storeIds.size === 0) return '';

  const found = await EtsyStore.countDocuments({ _id: { $in: [...storeIds] } });
  return found === storeIds.size ? '' : 'Etsy store not found';
}

async function getMaxRowOrder() {
  const edge = await EtsyProductSheetRow.findOne().sort({ rowOrder: -1 }).select('rowOrder').lean();
  return edge?.rowOrder ?? -1;
}

/** A link is only a duplicate of another row in the same store (rows without a store form their own group). */
async function findDuplicateLinks(touched) {
  if (touched.length === 0) return [];

  const keys = [...new Set(touched.map((entry) => entry.linkKey))];
  const matches = await EtsyProductSheetRow.find({ linkKey: { $in: keys } })
    .select('linkKey sku store')
    .sort({ rowOrder: 1, _id: 1 })
    .lean();

  const groupKey = (linkKey, store) => `${store || ''}|${linkKey}`;
  const byGroup = new Map();
  for (const match of matches) {
    const key = groupKey(match.linkKey, match.store ? String(match.store) : '');
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push({ id: String(match._id), sku: match.sku || '' });
  }

  return touched
    .map((entry) => ({
      id: entry.id,
      matches: (byGroup.get(groupKey(entry.linkKey, entry.store)) || []).filter((match) => match.id !== entry.id),
    }))
    .filter((entry) => entry.matches.length > 0);
}

async function saveRows(incoming) {
  const ids = incoming.filter((item) => item.id).map((item) => item.id);
  const existingDocs = ids.length
    ? await EtsyProductSheetRow.find({ _id: { $in: ids } }).lean()
    : [];
  const existingById = new Map(existingDocs.map((doc) => [String(doc._id), doc]));

  const missingIds = [];
  const prepared = incoming.map((item) => {
    const existing = item.id ? existingById.get(item.id) : null;
    if (item.id && !existing) {
      missingIds.push(item.id);
      return null;
    }

    const fields = pickIncomingFields(item);
    const merged = {
      ...createEmptyFields(),
      ...(existing ? pickStoredFields(existing) : {}),
      ...fields,
    };
    return { item, existing, fields, merged };
  });

  const needsSku = prepared.some((entry) => entry && entry.merged.productLink && !entry.merged.sku);
  let nextSkuNumber = 0;
  if (needsSku) {
    const stored = await EtsyProductSheetRow.find({ sku: AUTO_SKU_QUERY }).select('sku').lean();
    nextSkuNumber = getNextSheetSkuNumber([
      ...stored.map((doc) => doc.sku),
      ...prepared.filter(Boolean).map((entry) => entry.merged.sku),
    ]);
  }

  let nextRowOrder = (await getMaxRowOrder()) + 1;
  const operations = [];
  const touchedLinks = [];

  const rows = prepared.map((entry) => {
    if (!entry) return null;
    const { item, existing, fields, merged } = entry;

    if (merged.productLink && !merged.sku) {
      merged.sku = formatSheetSku(nextSkuNumber);
      fields.sku = merged.sku;
      nextSkuNumber += 1;
    }

    const linkKey = getProductLinkKey(merged.productLink);
    let id;

    if (existing) {
      id = String(existing._id);
      const update = { ...fields };
      if (Object.prototype.hasOwnProperty.call(fields, 'productLink')) update.linkKey = linkKey;
      if (Object.prototype.hasOwnProperty.call(update, 'store')) update.store = update.store || null;
      if (Object.keys(update).length > 0) {
        operations.push({ updateOne: { filter: { _id: existing._id }, update: { $set: update } } });
      }
    } else {
      const _id = new mongoose.Types.ObjectId();
      id = String(_id);
      operations.push({
        insertOne: {
          document: { _id, ...merged, store: merged.store || null, linkKey, rowOrder: nextRowOrder },
        },
      });
      nextRowOrder += 1;
    }

    const previousStore = existing?.store ? String(existing.store) : '';
    if (linkKey && (!existing || existing.productLink !== merged.productLink || previousStore !== merged.store)) {
      touchedLinks.push({ id, linkKey, store: merged.store });
    }

    return {
      id,
      ...(typeof item.key === 'string' ? { key: item.key } : {}),
      ...merged,
    };
  });

  if (operations.length > 0) {
    await EtsyProductSheetRow.bulkWrite(operations, { ordered: true });
  }

  return { rows, missingIds, duplicates: await findDuplicateLinks(touchedLinks) };
}

// GET /api/etsy/product-sheet
router.get('/', requireAuth, requirePageAccess(PAGE_ID), async (_req, res) => {
  try {
    const rows = await EtsyProductSheetRow.find().sort({ rowOrder: 1, _id: 1 }).lean();
    res.json({ rows: rows.map(toClientRow) });
  } catch (err) {
    console.error('[Etsy Product Sheet] list failed:', err);
    res.status(500).json({ error: 'Failed to load product sheet' });
  }
});

/**
 * POST /api/etsy/product-sheet/save
 * Body: { rows: [{ id?, key?, store?, date?, productLink?, sku?, amazonPrice?, etsyPrice? }] }
 * Rows with an id are updated (only the fields sent); rows without one are appended
 * in the order given. A row with a product link and no SKU gets the next UKVLAU SKU.
 * `store` is an EtsyStore id ('' clears it); duplicate links are only reported within one store.
 * Response rows line up with the request rows (null when the id no longer exists).
 */
router.post('/save', requireAuth, requirePageAccess(PAGE_ID), async (req, res) => {
  try {
    const incoming = req.body?.rows;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ error: 'rows array is required' });
    }
    if (incoming.length > MAX_ROWS_PER_SAVE) {
      return res.status(400).json({ error: `At most ${MAX_ROWS_PER_SAVE} rows can be saved per request` });
    }
    for (const item of incoming) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return res.status(400).json({ error: 'Each row must be an object' });
      }
      if (item.id !== undefined && item.id !== null && !isValidId(item.id)) {
        return res.status(400).json({ error: 'Invalid row id' });
      }
    }

    const storeError = await validateStores(incoming);
    if (storeError) {
      return res.status(400).json({ error: storeError });
    }

    res.json(await withSheetLock(() => saveRows(incoming)));
  } catch (err) {
    console.error('[Etsy Product Sheet] save failed:', err);
    res.status(500).json({ error: 'Failed to save product sheet' });
  }
});

// POST /api/etsy/product-sheet/insert  Body: { beforeId, count } — blank rows above an existing row
router.post('/insert', requireAuth, requirePageAccess(PAGE_ID), async (req, res) => {
  try {
    const { beforeId } = req.body || {};
    const count = Number(req.body?.count ?? 1);

    if (!isValidId(beforeId)) {
      return res.status(400).json({ error: 'Valid beforeId is required' });
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_ROWS_PER_INSERT) {
      return res.status(400).json({ error: `count must be between 1 and ${MAX_ROWS_PER_INSERT}` });
    }

    const rows = await withSheetLock(async () => {
      const target = await EtsyProductSheetRow.findById(beforeId).select('rowOrder').lean();
      if (!target) return null;

      await EtsyProductSheetRow.updateMany(
        { rowOrder: { $gte: target.rowOrder } },
        { $inc: { rowOrder: count } }
      );

      const inserted = await EtsyProductSheetRow.insertMany(
        Array.from({ length: count }, (_unused, index) => ({
          ...createEmptyFields(),
          store: null,
          rowOrder: target.rowOrder + index,
        })),
        { ordered: true }
      );
      return inserted.map(toClientRow);
    });

    if (!rows) {
      return res.status(404).json({ error: 'Row not found' });
    }
    res.status(201).json({ rows });
  } catch (err) {
    console.error('[Etsy Product Sheet] insert failed:', err);
    res.status(500).json({ error: 'Failed to insert rows' });
  }
});

// POST /api/etsy/product-sheet/delete  Body: { ids }
router.post('/delete', requireAuth, requirePageAccess(PAGE_ID), async (req, res) => {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (ids.length > MAX_ROWS_PER_DELETE) {
      return res.status(400).json({ error: `At most ${MAX_ROWS_PER_DELETE} rows can be deleted per request` });
    }
    if (!ids.every(isValidId)) {
      return res.status(400).json({ error: 'Invalid row id' });
    }

    const result = await withSheetLock(() => EtsyProductSheetRow.deleteMany({ _id: { $in: ids } }));
    res.json({ deletedCount: result.deletedCount || 0 });
  } catch (err) {
    console.error('[Etsy Product Sheet] delete failed:', err);
    res.status(500).json({ error: 'Failed to delete rows' });
  }
});

export default router;
