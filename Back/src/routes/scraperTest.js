import express from 'express';
import axios from 'axios';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { trackApiUsage } from '../utils/apiUsageTracker.js';

const router = express.Router();

/** Same endpoint as listing pipeline (`scraperApiProduct.js`). */
const SCRAPER_STRUCTURED_BASE = 'https://api.scraperapi.com/structured/amazon/product/v1';

const REGIONS = new Set(['US', 'UK', 'CA', 'AU']);

function getScraperApiKey() {
  const key = process.env.SCRAPER_API_KEY;
  if (!key || key === 'your_api_key_here_after_signup') {
    throw new Error('SCRAPER_API_KEY environment variable not set. Please add it to .env file.');
  }
  return key;
}

function normalizeAsin(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normalizeRegion(raw) {
  const r = String(raw || 'US').trim().toUpperCase();
  return REGIONS.has(r) ? r : 'US';
}

function regionToTld(region) {
  if (region === 'UK') return '.co.uk';
  if (region === 'CA') return '.ca';
  if (region === 'AU') return '.com.au';
  return '.com';
}

/**
 * Raw ScraperAPI structured Amazon product JSON only (no app-side parsing / fallbacks).
 */
router.post('/raw', requireAuth, requirePageAccess('ScraperTester'), async (req, res) => {
  const startTime = Date.now();
  const asin = normalizeAsin(req.body?.asin);
  const region = normalizeRegion(req.body?.region);

  if (asin.length !== 10) {
    return res.status(400).json({ error: 'ASIN must be exactly 10 alphanumeric characters' });
  }

  const timeout = parseInt(process.env.SCRAPER_API_TIMEOUT_MS, 10) || 30000;

  try {
    const response = await axios.get(SCRAPER_STRUCTURED_BASE, {
      params: {
        api_key: getScraperApiKey(),
        asin,
        tld: regionToTld(region)
      },
      timeout
    });

    const responseTime = Date.now() - startTime;
    trackApiUsage({
      service: 'ScraperAPI',
      asin,
      creditsUsed: 1,
      success: true,
      responseTime,
      extractedFields: ['raw_debug']
    }).catch((err) => console.error('[ScraperTester] usage track:', err?.message));

    return res.json({
      ok: true,
      asin,
      region,
      httpStatus: response.status,
      raw: response.data
    });
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const status = err.response?.status;
    const body = err.response?.data;

    trackApiUsage({
      service: 'ScraperAPI',
      asin,
      creditsUsed: 1,
      success: false,
      errorMessage: err.message,
      responseTime,
      extractedFields: []
    }).catch((e) => console.error('[ScraperTester] usage track:', e?.message));

    console.error('[ScraperTester] raw:', err?.message || err);

    if (body && typeof body === 'object') {
      return res.status(status && status >= 400 && status < 600 ? status : 502).json({
        ok: false,
        asin,
        region,
        httpStatus: status || null,
        error: err.message,
        raw: body
      });
    }

    return res.status(500).json({
      ok: false,
      asin,
      region,
      error: err.message || 'ScraperAPI request failed'
    });
  }
});

export default router;
