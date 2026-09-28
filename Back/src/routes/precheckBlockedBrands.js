import { Router } from 'express';
import mongoose from 'mongoose';
import PrecheckBlockedBrand from '../models/PrecheckBlockedBrand.js';
import PrecheckBlockedAsin from '../models/PrecheckBlockedAsin.js';
import User from '../models/User.js';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { precheckBlockedBrandSchema } from '../schemas/index.js';
import { normalizeBrand } from '../utils/precheckBlockedBrands.js';
import { resolvePrecheckDateWindow } from '../utils/precheckDates.js';

const router = Router();

// Long enough for the odd URL-shaped brand ("https://www.apbands.com/"), short
// enough that a pasted paragraph is rejected rather than stored as a "brand".
const MAX_BRAND_LENGTH = 100;

/**
 * Split a pasted blob (or array) of brand names into clean, de-duplicated
 * entries. Splits on newlines, commas and semicolons only — brand names carry
 * spaces ("Barton Watch Bands"), so whitespace is never a separator. Stray
 * quotes from spreadsheet cells are stripped from the display value too.
 */
export function parseBrands(input) {
  const raw = Array.isArray(input) ? input : String(input ?? '').split(/[\r\n,;]+/);
  const seen = new Set();
  const valid = [];
  const invalid = [];

  for (const token of raw) {
    const brand = String(token ?? '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
    const normalized = normalizeBrand(brand);
    if (!normalized) continue;
    if (brand.length > MAX_BRAND_LENGTH) {
      if (!invalid.includes(brand)) invalid.push(brand);
      continue;
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    valid.push({ brand, normalized });
  }

  return { valid, invalid };
}

/**
 * @swagger
 * /precheck-blocked-brands:
 *   get:
 *     tags: [Precheck Blocked Brands]
 *     summary: List brands the ASIN precheck drops
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Entries, newest first
 *       500:
 *         description: Internal server error
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const entries = await PrecheckBlockedBrand.find({})
      .sort({ createdAt: -1, brand: 1 })
      .lean();
    res.json(entries);
  } catch (error) {
    console.error('Error fetching precheck blocked brands:', error);
    res.status(500).json({ error: 'Failed to fetch blocked brands' });
  }
});

/**
 * @swagger
 * /precheck-blocked-brands:
 *   post:
 *     tags: [Precheck Blocked Brands]
 *     summary: Add one or more brands to the precheck exclusion list
 *     description: Accepts a single brand, an array, or a pasted blob separated by newlines/commas/semicolons. Brands already on the list (compared case-insensitively) are reported as skipped rather than failing the request.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [brands]
 *             properties:
 *               brands:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: Summary of what was added, skipped and rejected
 *       400:
 *         description: No valid brands supplied
 *       500:
 *         description: Internal server error
 */
router.post(
  '/',
  requireAuth,
  requirePageAccess('AsinPrecheck'),
  validate(precheckBlockedBrandSchema),
  async (req, res) => {
    try {
      const { valid, invalid } = parseBrands(req.body.brands);
      const note = String(req.body.note || '').trim();

      if (valid.length === 0) {
        return res.status(400).json({
          error: invalid.length
            ? `No valid brands found. Rejected (too long): ${invalid.slice(0, 5).join(', ')}`
            : 'No valid brands found'
        });
      }

      const existing = await PrecheckBlockedBrand.find({ normalized: { $in: valid.map(v => v.normalized) } })
        .select('normalized')
        .lean();
      const existingKeys = new Set(existing.map((doc) => doc.normalized));
      const toInsert = valid.filter((entry) => !existingKeys.has(entry.normalized));

      let addedCount = 0;
      if (toInsert.length > 0) {
        const actor = await User.findById(req.user.userId).select('username').lean();
        const docs = toInsert.map(({ brand, normalized }) => ({
          brand,
          normalized,
          note,
          source: 'manual',
          createdBy: req.user.userId,
          createdByName: actor?.username || ''
        }));

        try {
          const inserted = await PrecheckBlockedBrand.insertMany(docs, { ordered: false });
          addedCount = inserted.length;
        } catch (error) {
          // A concurrent add can duplicate a brand; the unique index rejects
          // just that document and the rest still land.
          if (error?.code !== 11000 && !error?.writeErrors) throw error;
          addedCount = error?.insertedDocs?.length ?? 0;
        }
      }

      res.json({
        success: true,
        added: addedCount,
        skipped: valid.length - toInsert.length,
        invalid
      });
    } catch (error) {
      console.error('Error adding precheck blocked brands:', error);
      res.status(500).json({ error: 'Failed to add blocked brands' });
    }
  }
);

/**
 * Build the PrecheckBlockedAsin filter for a history request: the resolved
 * date window plus optional exact-ASIN and case-insensitive brand matches.
 * Shared by the paged history and the copy-all ASIN list so the two agree on
 * what "the period" contains.
 */
function buildHistoryFilter(query) {
  const window = resolvePrecheckDateWindow(query);
  if (window.error) return { error: window.error };

  const filter = { createdAt: window.match };
  const asin = String(query.asin || '').trim().toUpperCase();
  if (asin) filter.asin = asin;
  const brand = String(query.brand || '').trim();
  if (brand) filter.brand = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

  return { filter, rangeInfo: window.rangeInfo };
}

const MAX_HISTORY_PAGE_SIZE = 200;
const TOP_BRANDS_LIMIT = 8;

/**
 * @swagger
 * /precheck-blocked-brands/history:
 *   get:
 *     tags: [Precheck Blocked Brands]
 *     summary: ASINs the precheck dropped for an excluded brand
 *     description: The durable record behind the end-of-run "excluded by brand" summary. Newest first, paged. Filter by ASIN, by the excluded-brands entry that matched, or both. The `summary` describes the whole filtered period, not just the returned page.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: asin
 *         schema:
 *           type: string
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *         description: Matched case-insensitively against the excluded-brands entry
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive, in the precheck stats timezone (America/Los_Angeles). Alone, selects that single day.
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Inclusive; defaults to startDate
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 365
 *         description: Rolling window ending now; used only when startDate is absent
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *     responses:
 *       200:
 *         description: One page of exclusions (with the user who ran the precheck resolved to a username), pagination, and a period-wide summary
 *       400:
 *         description: endDate before startDate
 *       500:
 *         description: Internal server error
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const { error, filter, rangeInfo } = buildHistoryFilter(req.query);
    if (error) {
      return res.status(400).json({ error });
    }
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));

    const [rows, [facets]] = await Promise.all([
      PrecheckBlockedAsin.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        // A Seller has no name of its own — it is displayed by its linked user.
        .populate({ path: 'seller', select: 'user', populate: { path: 'user', select: 'username email' } })
        .populate('template', 'name')
        .lean(),
      // The tiles describe the whole period, so they come from the full filter
      // rather than the page: per-brand counts (which also give the total and
      // the top-brands list) and the number of distinct ASINs.
      PrecheckBlockedAsin.aggregate([
        { $match: filter },
        {
          $facet: {
            brands: [
              { $group: { _id: '$brand', count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } }
            ],
            asins: [
              { $group: { _id: '$asin' } },
              { $count: 'count' }
            ]
          }
        }
      ])
    ]);

    const brands = facets?.brands || [];
    const total = brands.reduce((sum, entry) => sum + entry.count, 0);

    const userIds = [...new Set(rows.map((row) => String(row.user || '')).filter(Boolean))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select('username').lean()
      : [];
    const usernameById = new Map(users.map((user) => [String(user._id), user.username]));

    res.json({
      range: rangeInfo,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      },
      summary: {
        exclusions: total,
        asins: facets?.asins?.[0]?.count || 0,
        brands: brands.length,
        topBrands: brands.slice(0, TOP_BRANDS_LIMIT).map((entry) => ({ brand: entry._id, count: entry.count }))
      },
      rows: rows.map((row) => ({
        _id: row._id,
        asin: row.asin,
        brand: row.brand,
        matchedOn: row.matchedOn || 'brand',
        amazonBrand: row.amazonBrand,
        amazonSoldBy: row.amazonSoldBy || '',
        title: row.title,
        region: row.region,
        userName: usernameById.get(String(row.user || '')) || '',
        sellerName: row.seller?.user?.username || row.seller?.user?.email || '',
        templateName: row.template?.name || '',
        precheckLog: row.precheckLog,
        createdAt: row.createdAt
      }))
    });
  } catch (error) {
    console.error('Error fetching precheck blocked ASIN history:', error);
    res.status(500).json({ error: 'Failed to fetch excluded ASIN history' });
  }
});

/**
 * @swagger
 * /precheck-blocked-brands/history/asins:
 *   get:
 *     tags: [Precheck Blocked Brands]
 *     summary: Every distinct ASIN excluded in a period
 *     description: The un-paged companion to `/history` for "Copy ASINs" — same date, ASIN and brand filters, but returns only the distinct ASINs, sorted.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: asin
 *         schema:
 *           type: string
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Distinct ASINs matching the filters
 *       400:
 *         description: endDate before startDate
 *       500:
 *         description: Internal server error
 */
router.get('/history/asins', requireAuth, async (req, res) => {
  try {
    const { error, filter, rangeInfo } = buildHistoryFilter(req.query);
    if (error) {
      return res.status(400).json({ error });
    }
    const asins = await PrecheckBlockedAsin.distinct('asin', filter);
    res.json({ range: rangeInfo, asins: asins.sort() });
  } catch (error) {
    console.error('Error fetching precheck blocked ASIN list:', error);
    res.status(500).json({ error: 'Failed to fetch excluded ASINs' });
  }
});

/**
 * @swagger
 * /precheck-blocked-brands/{id}:
 *   delete:
 *     tags: [Precheck Blocked Brands]
 *     summary: Remove a brand from the precheck exclusion list
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted successfully
 *       404:
 *         description: Entry not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', requireAuth, requirePageAccess('AsinPrecheck'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ error: 'Blocked brand not found' });
    }

    const deleted = await PrecheckBlockedBrand.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Blocked brand not found' });
    }

    res.json({ success: true, brand: deleted.brand });
  } catch (error) {
    console.error('Error deleting precheck blocked brand:', error);
    res.status(500).json({ error: 'Failed to remove blocked brand' });
  }
});

export default router;
