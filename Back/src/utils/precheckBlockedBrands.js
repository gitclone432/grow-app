import PrecheckBlockedBrand from '../models/PrecheckBlockedBrand.js';

/**
 * Brands the ASIN precheck never surfaces. A hit drops the ASIN from the
 * stream entirely (the client removes the row on `item_blocked`) rather than
 * returning it as an excluded row, so these never reach the results table and
 * never spend an eBay Motors classifier call.
 *
 * One rule for every entry: the name appears in the brand Scrapingdog
 * returned OR in the buy-box seller ("Sold by"). Nowhere else — a title or
 * description that merely mentions a blocked brand, e.g. "case compatible
 * with OtterBox Defender", does not fire. The seller is checked because a
 * brand owner often sells under its own name while the listing's brand field
 * is blank or generic, and that ASIN is just as much a takedown risk.
 * Comparison ignores case and ®/™ marks, and the name must stand as a whole
 * word — "NOI" does not fire on "noise-cancelling", but "Spigen" still fires
 * on a brand field of "Spigen Inc" and "SUPFINE" on a seller of "SUPFINE-US".
 *
 * The list used to be hard-coded here. It now lives in the PrecheckBlockedBrand
 * collection and is edited from the ASIN Precheck page; the precheck loads it
 * once per run (loadPrecheckBlockList) and matches every ASIN against that
 * snapshot (findBlockedBrand), so an entry added mid-run applies to the next
 * run.
 */

/**
 * Collapse the ways the same brand shows up in scraped data — case, ®/™
 * marks, stray quotes from a spreadsheet cell, surrounding whitespace — so
 * comparisons are meaningful. Applied to both the list entries and the
 * scraped text. Also the key each DB entry is unique on.
 *
 * Marks and quotes become spaces rather than vanishing, so "Spigen's" still
 * contains the whole word "spigen" and "WeatherTech®Direct" splits into two
 * words — the old substring rule caught both, and so must this one.
 */
export function normalizeBrand(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[®™©"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The original hard-coded list, imported into the collection the first time
 * the server starts against an empty one (seedPrecheckBlockedBrands). Only
 * these two are seeded — every other brand is added through the UI. Kept only
 * as seed data; the DB is the source of truth once populated.
 */
export const DEFAULT_PRECHECK_BLOCKED_BRANDS = ['Spigen', 'OtterBox'];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turn a list of entries ({ brand }) into the matcher structure
 * findBlockedBrand consumes: one pre-compiled whole-word pattern per entry.
 * The boundary is "not touching another letter or digit" rather than \b, so
 * entries that start or end in punctuation ("https://www.apbands.com/",
 * "Apbands-US") still match. Pure, so the matcher is testable without Mongo.
 *
 * @returns {Array<{ key: string, display: string, pattern: RegExp }>}
 */
export function buildBlockList(entries = []) {
  const seen = new Set();
  const list = [];
  for (const entry of entries) {
    const key = normalizeBrand(entry?.brand);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    list.push({
      key,
      display: String(entry.brand).trim(),
      pattern: new RegExp(`(?<![a-z0-9])${escapeRegExp(key)}(?![a-z0-9])`)
    });
  }
  return list;
}

/**
 * One pattern matching any entry in the list, with the same whole-word rule as
 * each entry's own pattern. For pre-filtering in Mongo against text that was
 * stored already normalised (normalizeBrand) — the Amazon Stock Check's
 * Excluded Brands page narrows a run's items with it, then runs
 * findBlockedBrand on what comes back to learn which entry matched.
 *
 * @returns {RegExp | null} null for an empty list, which matches nothing
 */
export function buildBlockListPattern(blockList = EMPTY_BLOCK_LIST) {
  if (!blockList.length) return null;
  const alternatives = blockList.map(entry => escapeRegExp(entry.key)).join('|');
  return new RegExp(`(?<![a-z0-9])(?:${alternatives})(?![a-z0-9])`);
}

export const EMPTY_BLOCK_LIST = Object.freeze([]);

/**
 * Read the current list from the database. Called once at the start of each
 * precheck run. Throws on a failed read: the precheck cannot run without the
 * database anyway, and silently blocking nothing would let a takedown-risk
 * brand through unnoticed.
 */
export async function loadPrecheckBlockList() {
  const docs = await PrecheckBlockedBrand.find({}).select('brand').lean();
  return buildBlockList(docs);
}

/**
 * The fields the list is matched against, in the order they are tried. Only
 * these two are consulted — the rest of the scraped record (title,
 * description) is accepted for convenience, since callers spread the whole
 * amazonData object, but ignored, so a listing that merely mentions a blocked
 * brand is not dropped. Brand first: when both fields hit, the exclusion is
 * reported as a brand match, which is the one the list owner expects to see.
 */
export const BLOCKED_BRAND_FIELDS = Object.freeze(['brand', 'soldBy']);

/**
 * @param {{ brand?: string, soldBy?: string }} amazonData
 * @param {Array<{ display: string, pattern: RegExp }>} blockList
 * @returns {{ display: string, field: 'brand' | 'soldBy' } | null}
 *   the entry that matched and which field it was found in; null when allowed
 */
export function findBlockedBrand(amazonData = {}, blockList = EMPTY_BLOCK_LIST) {
  if (blockList.length === 0) return null;
  for (const field of BLOCKED_BRAND_FIELDS) {
    const haystack = normalizeBrand(amazonData?.[field]);
    if (!haystack) continue;
    const hit = blockList.find(entry => entry.pattern.test(haystack));
    if (hit) return { display: hit.display, field };
  }
  return null;
}

/**
 * findBlockedBrand() for callers that only need the name.
 *
 * @returns {string} display name of the entry that matched, '' when allowed
 */
export function matchBlockedBrand(amazonData = {}, blockList = EMPTY_BLOCK_LIST) {
  return findBlockedBrand(amazonData, blockList)?.display || '';
}

/**
 * Import the former hard-coded list when the collection is empty — i.e. the
 * first boot after this feature shipped. Never runs against a populated
 * collection, so entries removed through the UI stay removed. Failures are
 * logged, not thrown: a seed problem must not stop the API from starting.
 *
 * @returns {Promise<number>} entries inserted (0 when already populated)
 */
export async function seedPrecheckBlockedBrands() {
  try {
    const existing = await PrecheckBlockedBrand.estimatedDocumentCount();
    if (existing > 0) return 0;

    const seen = new Set();
    const docs = [];
    for (const brand of DEFAULT_PRECHECK_BLOCKED_BRANDS) {
      const normalized = normalizeBrand(brand);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      docs.push({ brand, normalized, source: 'seed' });
    }

    const inserted = await PrecheckBlockedBrand.insertMany(docs, { ordered: false });
    console.log(`[Precheck Blocked Brands] Seeded ${inserted.length} entries from the default list`);
    return inserted.length;
  } catch (error) {
    // 11000 = a concurrent boot seeded first; the rest still landed.
    if (error?.code === 11000 || error?.writeErrors) return error?.insertedDocs?.length ?? 0;
    console.error('[Precheck Blocked Brands] Seed failed:', error.message);
    return 0;
  }
}
