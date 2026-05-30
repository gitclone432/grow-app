import express from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { trackApiUsage } from '../utils/apiUsageTracker.js';
import {
  fetchStructuredAmazonProduct,
  getScraperRuntimeInfo,
} from '../utils/scraperApiProduct.js';

const router = express.Router();

const REGIONS = new Set(['US', 'UK', 'CA', 'AU']);

function scraperServiceLabel() {
  const provider = String(process.env.SCRAPER_PROVIDER || 'scraperapi').trim().toLowerCase();
  return provider === 'scrapingdog' ? 'ScrapingDog' : 'ScraperAPI';
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

/** Which scraper + whether a key is loaded (for debugging 401s). */
router.get('/status', requireAuth, requirePageAccess('ScraperTester'), (req, res) => {
  res.json(getScraperRuntimeInfo());
});

/**
 * Raw structured Amazon product JSON (ScraperAPI or ScrapingDog per SCRAPER_PROVIDER).
 */
router.post('/raw', requireAuth, requirePageAccess('ScraperTester'), async (req, res) => {
  const startTime = Date.now();
  const asin = normalizeAsin(req.body?.asin);
  const region = normalizeRegion(req.body?.region);

  if (asin.length !== 10) {
    return res.status(400).json({ error: 'ASIN must be exactly 10 alphanumeric characters' });
  }

  try {
    const raw = await fetchStructuredAmazonProduct(asin, region);
    const responseTime = Date.now() - startTime;
    trackApiUsage({
      service: scraperServiceLabel(),
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
      provider: scraperServiceLabel(),
      httpStatus: 200,
      raw
    });
  } catch (err) {
    const responseTime = Date.now() - startTime;
    const status = err.response?.status;
    const body = err.response?.data;

    trackApiUsage({
      service: scraperServiceLabel(),
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

    return res.status(status === 401 ? 401 : 500).json({
      ok: false,
      asin,
      region,
      httpStatus: status || null,
      error: err.message || 'Amazon scraper request failed',
      provider: scraperServiceLabel(),
      runtime: getScraperRuntimeInfo(),
    });
  }
});

export default router;
