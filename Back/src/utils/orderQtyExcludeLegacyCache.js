import OrderQtyExcludeLegacy from '../models/OrderQtyExcludeLegacy.js';
import { ORDER_QTY_SKIP_LEGACY_DEFAULTS } from '../constants/orderQtySkipDefaults.js';

let cachedSet = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000;
let seeded = false;

/** Run once before admin list/count; migrates bundled defaults if collection empty. */
export async function ensureOrderQtyExcludeLegacySeededIfEmpty() {
  await ensureDefaultsSeeded();
}

async function ensureDefaultsSeeded() {
  if (seeded) return;
  seeded = true;
  const count = await OrderQtyExcludeLegacy.countDocuments();
  if (count > 0) return;
  const ops = ORDER_QTY_SKIP_LEGACY_DEFAULTS.map((id) => ({
    updateOne: {
      filter: { legacyItemId: id },
      update: { $setOnInsert: { legacyItemId: id } },
      upsert: true,
    },
  }));
  if (ops.length) {
    await OrderQtyExcludeLegacy.bulkWrite(ops, { ordered: false });
  }
}

/** In-memory cache of legacy item IDs that skip post-order qty = 1 updates. */
export async function getOrderQtyExcludedLegacyIdSet() {
  const now = Date.now();
  if (cachedSet && now - cacheLoadedAt < CACHE_TTL_MS) {
    return cachedSet;
  }
  await ensureDefaultsSeeded();
  const docs = await OrderQtyExcludeLegacy.find().select('legacyItemId').lean();
  cachedSet = new Set(docs.map((d) => String(d.legacyItemId).trim()).filter(Boolean));
  cacheLoadedAt = now;
  return cachedSet;
}

export function invalidateOrderQtyExcludedLegacyCache() {
  cachedSet = null;
  cacheLoadedAt = 0;
}
