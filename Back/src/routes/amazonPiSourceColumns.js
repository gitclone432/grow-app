import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import AmazonPiSourceColumn from '../models/AmazonPiSourceColumn.js';
import { scrapeAmazonProductWithScraperAPI } from '../utils/scraperApiProduct.js';
import {
  buildAmazonPiCatalogEntry,
  dedupeProductInformationRows,
  filterAmazonPiCatalogColumns,
  flattenProductInformationRows,
  jsonPathToAmazonFieldKey,
  jsonPathToDefaultLabel
} from '../utils/amazonPiSourceColumnUtils.js';
import { invalidateAmazonPiSourceColumnsAutofillCache } from '../utils/asinAutofill.js';

const router = express.Router();

const REGION_SET = new Set(['US', 'UK', 'CA', 'AU']);
function normalizeAsin(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeRegion(raw) {
  const r = String(raw || 'US').trim().toUpperCase();
  return REGION_SET.has(r) ? r : 'US';
}

/** Dropdown + template editor — anyone who can edit templates may read options. */
router.get(
  '/options',
  requireAuth,
  requirePageAccess([
    'AmazonPiSourceColumns',
    'ManageTemplates',
    'SellerTemplatesLab',
    'SelectSellerLab',
    'ListingDirectory',
    'TemplateDirectory',
    'TemplateListingsLab',
    'TemplateListingAnalytics'
  ]),
  async (_req, res) => {
    const rows = await AmazonPiSourceColumn.find({}).sort({ label: 1 }).select('key label jsonPath').lean();
    res.json({
      options: filterAmazonPiCatalogColumns(rows).map((r) => ({
        value: r.key,
        label: r.label,
        jsonPath: r.jsonPath,
      })),
    });
  }
);

/** Full list for the catalog admin page. */
router.get(
  '/',
  requireAuth,
  requirePageAccess('AmazonPiSourceColumns'),
  async (_req, res) => {
    try {
      const columns = filterAmazonPiCatalogColumns(
        await AmazonPiSourceColumn.find({}).sort({ label: 1 }).lean()
      );
      res.json({ columns });
    } catch (e) {
      console.error('[amazon-pi-source-columns] list failed:', e);
      res.status(500).json({ error: e.message || 'Failed to load saved columns' });
    }
  }
);

/**
 * Scrape one ASIN and return flattened product_information rows (does not save).
 */
router.post(
  '/preview-from-asin',
  requireAuth,
  requirePageAccess('AmazonPiSourceColumns'),
  async (req, res) => {
    const asin = normalizeAsin(req.body?.asin);
    const region = normalizeRegion(req.body?.region);
    if (asin.length !== 10) {
      return res.status(400).json({ error: 'ASIN must be exactly 10 characters' });
    }
    try {
      const scraped = await scrapeAmazonProductWithScraperAPI(asin, region);
      const pi = scraped.productInformation || {};
      const flat = flattenProductInformationRows(pi);
      res.json({
        asin,
        region,
        rows: flat.map((r) => ({
          jsonPath: r.jsonPath,
          value: r.value,
          key: jsonPathToAmazonFieldKey(r.jsonPath),
          label: jsonPathToDefaultLabel(r.jsonPath)
        }))
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'Scrape failed' });
    }
  }
);

/**
 * Upsert catalog entries from preview rows (checked rows from the UI).
 * Body: { sourceAsin?, rows: [{ jsonPath, value?, label? }] }
 */
router.post(
  '/import-rows',
  requireAuth,
  requirePageAccess('AmazonPiSourceColumns'),
  async (req, res) => {
    try {
      const rows = req.body?.rows;
      const sourceAsin = normalizeAsin(req.body?.sourceAsin || '');
      if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ error: 'rows must be a non-empty array' });
      }
      if (rows.length > 500) {
        return res.status(400).json({ error: 'Maximum 500 rows per import' });
      }

      const deduped = dedupeProductInformationRows(
        rows.map((row) => ({
          jsonPath: String(row?.jsonPath || '').trim(),
          value: row?.value ?? row?.sampleValue ?? '',
          label: String(row?.label || '').trim(),
        })).filter((row) => row.jsonPath)
      );

      const lastSourceAsin = sourceAsin.length === 10 ? sourceAsin : '';
      const entriesByKey = new Map();

      for (const row of deduped) {
        const entry = buildAmazonPiCatalogEntry(row);
        if (!entry) continue;
        entriesByKey.set(entry.key, entry);
      }

      const entries = Array.from(entriesByKey.values());
      const skipped = deduped.length - entries.length;

      if (entries.length === 0) {
        return res.status(400).json({
          error: skipped > 0
            ? 'No valid rows to save. Paths may be invalid or too long.'
            : 'No rows to save.',
        });
      }

      const ops = entries.map((entry) => ({
        updateOne: {
          filter: { key: entry.key },
          update: {
            $set: {
              ...entry,
              lastSourceAsin,
            },
          },
          upsert: true,
        },
      }));

      await AmazonPiSourceColumn.bulkWrite(ops, { ordered: false });
      const saved = entries.length;

      invalidateAmazonPiSourceColumnsAutofillCache();
      const columns = filterAmazonPiCatalogColumns(
        await AmazonPiSourceColumn.find({}).sort({ label: 1 }).lean()
      );
      res.json({ ok: true, saved, skipped, columns });
    } catch (e) {
      console.error('[amazon-pi-source-columns] import-rows failed:', e);
      const message = e.code === 11000
        ? 'Duplicate column key — refresh the page and save again.'
        : (e.message || 'Save failed');
      res.status(500).json({ error: message });
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  requirePageAccess('AmazonPiSourceColumns'),
  async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    await AmazonPiSourceColumn.deleteOne({ _id: id });
    invalidateAmazonPiSourceColumnsAutofillCache();
    res.json({ ok: true });
  }
);

export default router;
