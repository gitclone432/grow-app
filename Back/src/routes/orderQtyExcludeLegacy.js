import express from 'express';
import OrderQtyExcludeLegacy from '../models/OrderQtyExcludeLegacy.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { invalidateOrderQtyExcludedLegacyCache, ensureOrderQtyExcludeLegacySeededIfEmpty } from '../utils/orderQtyExcludeLegacyCache.js';

const router = express.Router();
const BULK_MAX_IDS = 2000;

function parseBulkLegacyIds(body) {
  const out = [];
  if (Array.isArray(body?.legacyItemIds)) {
    for (const x of body.legacyItemIds) {
      const s = String(x ?? '').trim();
      if (s) out.push(s);
    }
  }
  if (typeof body?.bulkText === 'string' && body.bulkText.trim()) {
    const chunks = body.bulkText.split(/[\s,;]+/).map((x) => String(x).trim()).filter(Boolean);
    out.push(...chunks);
  }
  const seen = new Set();
  const normalized = [];
  for (const raw of out) {
    const id = String(raw).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

router.get('/', requireAuth, requirePageAccess('ExcludeOrderQtySkips'), async (req, res) => {
  try {
    await ensureOrderQtyExcludeLegacySeededIfEmpty();
    const rows = await OrderQtyExcludeLegacy.find().sort({ legacyItemId: 1 }).lean();
    res.json(rows);
  } catch (err) {
    console.error('[OrderQtyExcludeLegacy] list:', err.message);
    res.status(500).json({ error: 'Failed to list excluded legacy item IDs' });
  }
});

router.post('/', requireAuth, requirePageAccess('ExcludeOrderQtySkips'), async (req, res) => {
  try {
    const raw = req.body?.legacyItemId ?? req.body?.itemId ?? '';
    const legacyItemId = String(raw).trim();
    if (!legacyItemId) {
      return res.status(400).json({ error: 'legacyItemId is required' });
    }
    if (!/^\d+$/.test(legacyItemId)) {
      return res.status(400).json({ error: 'legacyItemId must be numeric' });
    }
    const doc = await OrderQtyExcludeLegacy.create({ legacyItemId });
    invalidateOrderQtyExcludedLegacyCache();
    res.status(201).json(doc);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'This legacy item ID is already excluded' });
    }
    console.error('[OrderQtyExcludeLegacy] create:', err.message);
    res.status(500).json({ error: 'Failed to add legacy item ID' });
  }
});

router.post('/bulk', requireAuth, requirePageAccess('ExcludeOrderQtySkips'), async (req, res) => {
  try {
    await ensureOrderQtyExcludeLegacySeededIfEmpty();
    const candidates = parseBulkLegacyIds(req.body || {});
    const invalid = [];
    const valid = [];
    for (const id of candidates) {
      if (!/^\d+$/.test(id)) {
        invalid.push(id);
        continue;
      }
      valid.push(id);
    }
    if (valid.length === 0 && invalid.length === 0) {
      return res.status(400).json({ error: 'Provide legacyItemIds array and/or bulkText with at least one ID' });
    }
    if (valid.length > BULK_MAX_IDS) {
      return res.status(400).json({ error: `At most ${BULK_MAX_IDS} IDs per bulk request` });
    }

    let upserted = 0;
    if (valid.length) {
      const result = await OrderQtyExcludeLegacy.bulkWrite(
        valid.map((legacyItemId) => ({
          updateOne: {
            filter: { legacyItemId },
            update: { $setOnInsert: { legacyItemId } },
            upsert: true,
          },
        })),
        { ordered: false }
      );
      upserted = result.upsertedCount || 0;
    }
    invalidateOrderQtyExcludedLegacyCache();
    res.status(200).json({
      processed: valid.length,
      inserted: upserted,
      skippedExisting: valid.length - upserted,
      invalid,
      invalidCount: invalid.length,
    });
  } catch (err) {
    console.error('[OrderQtyExcludeLegacy] bulk:', err.message);
    res.status(500).json({ error: 'Failed to bulk add legacy item IDs' });
  }
});

router.delete('/:id', requireAuth, requirePageAccess('ExcludeOrderQtySkips'), async (req, res) => {
  try {
    const doc = await OrderQtyExcludeLegacy.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    invalidateOrderQtyExcludedLegacyCache();
    res.json({ message: 'Removed' });
  } catch (err) {
    console.error('[OrderQtyExcludeLegacy] delete:', err.message);
    res.status(500).json({ error: 'Failed to remove legacy item ID' });
  }
});

export default router;
