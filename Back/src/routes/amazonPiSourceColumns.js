import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import AmazonPiSourceColumn from '../models/AmazonPiSourceColumn.js';
import { scrapeAmazonProductWithScraperAPI } from '../utils/scraperApiProduct.js';
import {
  flattenProductInformationRows,
  jsonPathToAmazonFieldKey,
  jsonPathToDefaultLabel
} from '../utils/amazonPiSourceColumnUtils.js';
import { invalidateAmazonPiSourceColumnsAutofillCache } from '../utils/asinAutofill.js';

const router = express.Router();

const REGION_SET = new Set(['US', 'UK', 'CA', 'AU']);
const JSON_PATH_RE = /^[a-zA-Z0-9_.]+$/;

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
    'SellerTemplates',
    'SelectSeller',
    'ListingDirectory',
    'TemplateDirectory',
    'TemplateListings',
    'TemplateListingAnalytics'
  ]),
  async (_req, res) => {
    const rows = await AmazonPiSourceColumn.find({}).sort({ label: 1 }).select('key label jsonPath').lean();
    res.json({
      options: rows.map((r) => ({ value: r.key, label: r.label, jsonPath: r.jsonPath }))
    });
  }
);

/** Full list for the catalog admin page. */
router.get(
  '/',
  requireAuth,
  requirePageAccess('AmazonPiSourceColumns'),
  async (_req, res) => {
    const columns = await AmazonPiSourceColumn.find({}).sort({ label: 1 }).lean();
    res.json({ columns });
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
    const rows = req.body?.rows;
    const sourceAsin = normalizeAsin(req.body?.sourceAsin || '');
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows must be a non-empty array' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: 'Maximum 500 rows per import' });
    }

    let saved = 0;
    for (const row of rows) {
      const jsonPath = String(row?.jsonPath || '').trim();
      if (!jsonPath || !JSON_PATH_RE.test(jsonPath)) continue;
      const key = jsonPathToAmazonFieldKey(jsonPath);
      if (!/^amazon_pi_[a-z0-9_]+$/.test(key)) continue;
      const label = String(row?.label || '').trim() || jsonPathToDefaultLabel(jsonPath);
      const lastSampleValue = String(row?.value ?? row?.sampleValue ?? '').slice(0, 2000);

      await AmazonPiSourceColumn.findOneAndUpdate(
        { jsonPath },
        {
          $set: {
            key,
            label,
            jsonPath,
            lastSampleValue,
            lastSourceAsin: sourceAsin.length === 10 ? sourceAsin : ''
          }
        },
        { upsert: true, new: true }
      );
      saved += 1;
    }

    invalidateAmazonPiSourceColumnsAutofillCache();
    const columns = await AmazonPiSourceColumn.find({}).sort({ label: 1 }).lean();
    res.json({ ok: true, saved, columns });
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
