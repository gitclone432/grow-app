import express from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireAuthSSE } from '../middleware/auth.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import ListingTemplate from '../models/ListingTemplate.js';
import AsinPrecheckLog from '../models/AsinPrecheckLog.js';
import SellerSkuIndex from '../models/SellerSkuIndex.js';
import ApiUsage from '../models/ApiUsage.js';
import AiListingRun from '../models/AiListingRun.js';
import { fetchAmazonData } from '../utils/asinAutofill.js';
import { generateSKUFromASIN } from '../utils/skuGenerator.js';
import { getEffectiveTemplate } from '../utils/templateMerger.js';
import { generateWithGemini } from '../utils/gemini.js';

const router = express.Router();

function firstHeaderValue(value) {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

function getClientIpInfo(req) {
  const cfConnectingIp = firstHeaderValue(req.headers['cf-connecting-ip']).trim();
  if (cfConnectingIp) {
    return { ipAddress: cfConnectingIp, ipSource: 'cf-connecting-ip' };
  }

  const trueClientIp = firstHeaderValue(req.headers['true-client-ip']).trim();
  if (trueClientIp) {
    return { ipAddress: trueClientIp, ipSource: 'true-client-ip' };
  }

  const xRealIp = firstHeaderValue(req.headers['x-real-ip']).trim();
  if (xRealIp) {
    return { ipAddress: xRealIp, ipSource: 'x-real-ip' };
  }

  const forwardedFor = firstHeaderValue(req.headers['x-forwarded-for']);
  const firstForwardedIp = forwardedFor.split(',').map(ip => ip.trim()).find(Boolean);
  if (firstForwardedIp) {
    return { ipAddress: firstForwardedIp, ipSource: 'x-forwarded-for' };
  }

  return { ipAddress: req.ip, ipSource: 'req.ip' };
}

function buildAiUsageContext(req, templateId, sellerId, runContext = {}) {
  const ipInfo = getClientIpInfo(req);
  return {
    templateId,
    sellerId,
    userId: req.user?.userId,
    aiRunId: runContext.aiRunId,
    aiRunStartedAt: runContext.aiRunStartedAt,
    ipAddress: ipInfo.ipAddress,
    ipSource: ipInfo.ipSource,
    forwardedFor: req.headers['x-forwarded-for'] || '',
    userAgent: req.get('user-agent') || ''
  };
}

function buildAmazonSourceData(amazonData) {
  return {
    title: amazonData.title,
    brand: amazonData.brand,
    price: amazonData.price,
    description: amazonData.description,
    images: amazonData.images,
    color: amazonData.color,
    compatibility: amazonData.compatibility,
    productInfo: amazonData.productInfo || null
  };
}

async function runWithConcurrency(items, concurrency, worker, shouldContinue = () => true) {
  const limit = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (nextIndex < items.length && shouldContinue()) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (!shouldContinue()) break;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.allSettled(workers);
}

function getBaseSku(sku = '') {
  const cleanSku = String(sku || '').trim();
  return cleanSku.replace(/-\d+$/, '');
}

function parseNumericPrice(value) {
  const price = parseFloat(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(price) ? price : null;
}

// Scrapingdog returns counts as comma-grouped strings ("109,583") —
// Number() alone would yield NaN and ?? does not fall through on NaN.
function toNumeric(value) {
  if (typeof value === 'string') return Number(value.replace(/,/g, '').trim());
  return Number(value);
}

const MARKETPLACE_TIMEZONES = {
  US: 'America/Los_Angeles',
  UK: 'Europe/London',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney'
};

const MONTH_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};

function getMarketplaceLocalDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(date);

  return {
    year: Number(parts.find(part => part.type === 'year')?.value),
    month: Number(parts.find(part => part.type === 'month')?.value) - 1,
    day: Number(parts.find(part => part.type === 'day')?.value)
  };
}

function parseShippingDate(shippingValue, scrapedAt, timezone) {
  const raw = String(shippingValue || '').trim();
  const match = raw.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*(\d{4}))?/i);
  if (!match) return { deliveryDate: null, deliveryDays: null };

  const scrapedLocal = getMarketplaceLocalDateParts(scrapedAt, timezone);
  const month = MONTH_INDEX[match[1].toLowerCase()];
  const day = Number(match[2]);
  let year = match[3] ? Number(match[3]) : scrapedLocal.year;

  let deliveryUtc = Date.UTC(year, month, day);
  const scrapedUtc = Date.UTC(scrapedLocal.year, scrapedLocal.month, scrapedLocal.day);

  if (!match[3] && deliveryUtc < scrapedUtc) {
    year += 1;
    deliveryUtc = Date.UTC(year, month, day);
  }

  const deliveryDays = Math.round((deliveryUtc - scrapedUtc) / 86400000);
  return {
    deliveryDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    deliveryDays: Number.isFinite(deliveryDays) ? deliveryDays : null
  };
}

function getPrecheckEnrichment(amazonData = {}, region = 'US', scrapedAt = new Date()) {
  const rawData = amazonData.rawData?.rawData || amazonData.rawData || {};
  const customerReviews = rawData.product_information?.customer_reviews || {};
  const rating = toNumeric(rawData.average_rating ?? customerReviews.stars ?? 0);
  const reviewCount = toNumeric(rawData.total_reviews ?? rawData.total_ratings ?? customerReviews.ratings_count ?? 0);
  const availabilityStatus = String(rawData.availability_status || '').trim();
  // shipping_time is ScraperAPI's name; Scrapingdog exposes the same info as
  // shipping_info (string) and delivery (array of strings). Keep the old name
  // first so cached ScraperAPI-shape entries and rollback mode still resolve.
  const deliveryLines = Array.isArray(rawData.delivery) ? rawData.delivery.filter(Boolean).map(String) : [];
  const shippingTime = String(rawData.shipping_time || rawData.shipping_info || deliveryLines[0] || '').trim();
  const shippingCondition = String(rawData.shipping_condition || '').trim();
  const marketplaceTimezone = MARKETPLACE_TIMEZONES[region] || MARKETPLACE_TIMEZONES.US;
  const delivery = parseShippingDate(shippingTime || shippingCondition, scrapedAt, marketplaceTimezone);
  const availabilityLower = availabilityStatus.toLowerCase();
  let inStock = null;
  if (availabilityStatus) {
    if (availabilityLower.includes('out of stock') || availabilityLower.includes('unavailable')) {
      inStock = false;
    } else if (availabilityLower.includes('in stock') || availabilityLower.includes('available')) {
      inStock = true;
    }
  }

  return {
    price: amazonData.price || '',
    priceNumber: parseNumericPrice(amazonData.price),
    availabilityStatus,
    inStock,
    rating: Number.isFinite(rating) && rating > 0 ? rating : null,
    reviewCount: Number.isFinite(reviewCount) && reviewCount > 0 ? reviewCount : null,
    shippingTime,
    shippingCondition,
    marketplaceTimezone,
    scrapedAt: scrapedAt.toISOString(),
    deliveryDate: delivery.deliveryDate,
    deliveryDays: delivery.deliveryDays
  };
}

function parseJsonObject(text = '') {
  const raw = String(text || '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 6);
}

function detectVehicleYearText(title = '') {
  const yearPattern = /\b(?:19[5-9]\d|20[0-4]\d)(?:\s*[-–/]\s*(?:\d{2}|19[5-9]\d|20[0-4]\d))?\b/g;
  return [...new Set(String(title || '').match(yearPattern) || [])].slice(0, 8);
}

function detectUniversalPhrase(title = '') {
  const match = String(title || '').match(/\b(universal(?:\s+fit)?|fits\s+most\s+(?:cars|vehicles|trucks|motorcycles)|for\s+most\s+(?:cars|vehicles|trucks|motorcycles))\b/i);
  return match ? match[0] : '';
}

function detectKnownVehicleModelPhrase(title = '') {
  const text = String(title || '');
  const knownModelPattern = /\b(?:Harley\s+Davidson|Sportster|Softail|Dyna|Electra\s+Glide|Road\s+King|Fatboy|Touring|Chevy|Chevrolet|Silverado|Colorado|Ford|F-?150|F-?250|F-?350|Ram|Dodge|Jeep|Wrangler|Toyota|Tacoma|Tundra|Camry|Corolla|Honda|Civic|Accord|BMW|Mercedes|Audi|Nissan|Altima|Sentra|Subaru|Outback|Forester|Yamaha|Kawasaki|Suzuki|Polaris|Can-Am)\b/i;
  const match = text.match(knownModelPattern);
  return match ? match[0] : '';
}

async function classifyEbayMotorsTitle(title, asin, usageContext = {}) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) {
    return {
      eligible: false,
      reason: 'No title found',
      signals: { hasModel: false, hasYear: false, isUniversal: false },
      detected: { modelNames: [], years: [], universalPhrase: '' }
    };
  }

  const prompt = `
You are checking if an Amazon product title is suitable for an eBay Motors listing precheck.

Pass rule:
- eligible=true if the title contains BOTH a vehicle model name and a year/year range.
- Otherwise eligible=false.

Definitions:
- eBay Motors includes cars, trucks, motorcycles, powersports, ATV/UTV, and their parts.
- A vehicle model name can be a real vehicle make/model/trim/platform/family such as Silverado, Colorado, F-150, Civic, Wrangler, X5, G05, Camry, Tacoma, Harley Davidson Sportster, Dyna, Softail, Yamaha YZF, Polaris Ranger, etc.
- A year/year range means a model year like 2024, or a range like 2019-2024, 2023 2024 2025, 1999-06.
- Universal fit does NOT pass by itself. Universal products must still be excluded unless the title also has BOTH a vehicle model name and a year/year range.
- Do not require the exact word "model"; detect actual vehicle model names from the title.
- Engine sizes or product part numbers alone are not vehicle model names.

Return only valid JSON:
{
  "eligible": boolean,
  "reason": "short reason",
  "signals": {
    "hasModel": boolean,
    "hasYear": boolean,
    "isUniversal": boolean
  },
  "detected": {
    "modelNames": ["detected vehicle model names"],
    "years": ["detected years or year ranges"],
    "universalPhrase": "detected universal phrase or empty string"
  }
}

Examples:
- "27490-96 Carburetor for Harley Davidson Sportster 883 Sportster 1200 1988-2007" => eligible=true, hasModel=true, hasYear=true.
- "Universal Mud Flaps for Cars Trucks SUV" => eligible=false, isUniversal=true, because model and year are missing.
- "Carburetor for Predator 4000 Champion Honda 3500 Generator" => eligible=false because vehicle model and year are missing.

Title: ${cleanTitle}
`.trim();

  try {
    const response = await generateWithGemini(prompt, {
      maxTokens: 180,
      asin,
      fieldName: 'ebay_motors_title_eligibility',
      fieldType: 'precheck',
      // Dedicated key for ASIN precheck AI; falls back to OPENAI_API_KEY if unset
      apiKey: process.env.OPENAI_PRECHECK_API_KEY,
      ...usageContext
    });
    const parsed = parseJsonObject(response);
    if (!parsed || typeof parsed.eligible !== 'boolean') {
      throw new Error('Invalid eligibility response');
    }

    const signals = parsed.signals || {};
    const detected = parsed.detected || {};
    const modelNames = normalizeStringArray(detected.modelNames);
    const years = normalizeStringArray(detected.years);
    const universalPhrase = String(detected.universalPhrase || '').trim();
    const fallbackYears = detectVehicleYearText(cleanTitle);
    const fallbackUniversalPhrase = detectUniversalPhrase(cleanTitle);
    const fallbackModelPhrase = detectKnownVehicleModelPhrase(cleanTitle);
    const hasModel = Boolean(signals.hasModel) || modelNames.length > 0 || Boolean(fallbackModelPhrase);
    const hasYear = Boolean(signals.hasYear) || years.length > 0 || fallbackYears.length > 0;
    const isUniversal = Boolean(signals.isUniversal) || Boolean(universalPhrase) || Boolean(fallbackUniversalPhrase);
    const eligible = hasModel && hasYear;
    const normalizedDetected = {
      modelNames: modelNames.length > 0 ? modelNames : (fallbackModelPhrase ? [fallbackModelPhrase] : []),
      years: years.length > 0 ? years : fallbackYears,
      universalPhrase: universalPhrase || fallbackUniversalPhrase
    };
    const reason = eligible
      ? String(parsed.reason || 'Contains vehicle model and year fitment').slice(0, 180)
      : String(
          isUniversal
            ? 'Universal product excluded; model name and year are required'
            : parsed.reason || 'Missing vehicle model name or year'
        ).slice(0, 180);

    return {
      eligible,
      reason,
      signals: {
        hasModel,
        hasYear,
        isUniversal
      },
      detected: normalizedDetected
    };
  } catch (error) {
    console.warn(`[ASIN Precheck] eBay Motors title check failed for ${asin}:`, error.message);
    return {
      eligible: false,
      reason: 'Could not verify eBay Motors fitment from title',
      signals: { hasModel: false, hasYear: false, isUniversal: false },
      detected: { modelNames: [], years: [], universalPhrase: '' }
    };
  }
}

// ── Precheck-stats date helpers ──────────────────────────────────────────────
// The stats page groups days in America/Los_Angeles (PDT/PST), so explicit
// date filters must use that timezone's midnight as the day boundary. The
// two-pass offset technique stays correct across the DST switch.
const PRECHECK_STATS_TIMEZONE = 'America/Los_Angeles';

function zoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
  );
  return asUtc - date.getTime();
}

function zonedMidnightUtc(dateStr, timeZone) {
  const naive = new Date(`${dateStr}T00:00:00Z`);
  const offset = zoneOffsetMs(naive, timeZone);
  let utc = new Date(naive.getTime() - offset);
  const refined = zoneOffsetMs(utc, timeZone);
  if (refined !== offset) utc = new Date(naive.getTime() - refined);
  return utc;
}

function nextDateStr(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /asin-precheck-stream
 * SSE stream that prechecks ASINs against Amazon + seller SKU index.
 */
router.get('/asin-precheck-stream', requireAuthSSE, async (req, res) => {
  let heartbeat = null;

  try {
    const { templateId, sellerId, asins: asinsParam, region = 'US' } = req.query;
    const ebayMotorsMode = String(req.query.ebayMotorsMode || '').toLowerCase() === 'true';

    if (!templateId || !sellerId || !asinsParam) {
      return res.status(400).json({ error: 'Template ID, Seller ID, and ASINs are required' });
    }

    const asins = [
      ...new Set(
        String(asinsParam)
          .split(',')
          .map(a => a.trim().toUpperCase())
          .filter(Boolean)
      )
    ];

    if (asins.length === 0) {
      return res.status(400).json({ error: 'At least one ASIN is required' });
    }

    if (asins.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 ASINs allowed per batch' });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    let streamClosed = false;
    const sendSse = (payload) => {
      if (streamClosed) return;
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (typeof res.flush === 'function') res.flush();
    };
    const sendDone = () => {
      if (streamClosed) return;
      res.write('data: [DONE]\n\n');
      if (typeof res.flush === 'function') res.flush();
    };

    heartbeat = setInterval(() => {
      sendSse({ type: 'ping', timestamp: Date.now() });
    }, 15000);

    req.on('close', () => {
      streamClosed = true;
      if (heartbeat) clearInterval(heartbeat);
    });

    const [seller, template] = await Promise.all([
      Seller.findById(sellerId).select('_id').lean(),
      getEffectiveTemplate(templateId, sellerId)
    ]);

    if (!seller || !template) {
      sendSse({ type: 'error', error: 'Seller or template not found' });
      sendDone();
      if (heartbeat) clearInterval(heartbeat);
      return res.end();
    }

    // Log this batch for the Precheck Stats page (counts by country/date/user/
    // seller). Fire-and-forget: a failed log never blocks the precheck. The
    // doc is kept so per-item retry counters can be added to it below.
    const precheckLogPromise = AsinPrecheckLog.create({
      user: req.user?.userId || null,
      seller: sellerId,
      template: templateId,
      region: ['US', 'UK', 'CA', 'AU'].includes(region) ? region : 'US',
      asins,
      asinCount: asins.length
    }).catch((error) => {
      console.error('[ASIN Precheck] Failed to log precheck batch:', error.message);
      return null;
    });

    const generatedRows = asins.map(asin => {
      const sku = generateSKUFromASIN(asin);
      return { asin, sku, baseSku: getBaseSku(sku) };
    });

    const skuValues = [...new Set(generatedRows.flatMap(row => [row.sku, row.baseSku]).filter(Boolean))];
    const activeRecords = skuValues.length > 0
      ? await SellerSkuIndex.find({
          seller: sellerId,
          $or: [
            { sku: { $in: skuValues } },
            { baseSku: { $in: skuValues } }
          ]
        }).select('sku baseSku').lean()
      : [];

    const activeSkuSet = new Set();
    activeRecords.forEach(record => {
      if (record.sku) activeSkuSet.add(record.sku);
      if (record.baseSku) activeSkuSet.add(record.baseSku);
    });

    const streamConcurrency = parseInt(process.env.ASIN_PRECHECK_CONCURRENCY, 10)
      || parseInt(process.env.SCRAPER_API_CONCURRENT, 10)
      || 10;
    const rowByAsin = new Map(generatedRows.map(row => [row.asin, row]));
    let completed = 0;

    const usageContext = buildAiUsageContext(req, templateId, sellerId);

    sendSse({
      type: 'started',
      total: asins.length,
      concurrency: Math.min(streamConcurrency, asins.length),
      ebayMotorsMode
    });

    await runWithConcurrency(asins, streamConcurrency, async (asin) => {
      if (streamClosed) return;

      const generated = rowByAsin.get(asin) || {
        sku: generateSKUFromASIN(asin),
        baseSku: getBaseSku(generateSKUFromASIN(asin))
      };

      try {
        sendSse({
          type: 'item_started',
          asin,
          id: `asin-precheck-${asin}`,
          progressStage: 'fetching'
        });

        const scrapedAt = new Date();
        const amazonData = await fetchAmazonData(asin, region);

        // Count the missing-stock-info re-fetch (fresh fetches only — cache
        // hits carry availabilityRetry: null) on this batch's stats log.
        if (amazonData.availabilityRetry?.attempted) {
          const retrySucceeded = Boolean(amazonData.availabilityRetry.succeeded);
          precheckLogPromise.then((logDoc) => {
            if (!logDoc) return;
            AsinPrecheckLog.updateOne(
              { _id: logDoc._id },
              { $inc: { availabilityRetryCount: 1, availabilityRetrySuccessCount: retrySucceeded ? 1 : 0 } }
            ).catch((err) => console.error('[ASIN Precheck] Failed to log retry:', err.message));
          });
        }

        const sourceData = buildAmazonSourceData(amazonData);
        const active = activeSkuSet.has(generated.sku) || activeSkuSet.has(generated.baseSku);
        const enrichment = getPrecheckEnrichment(amazonData, region, scrapedAt);
        const ebayMotorsEligibility = ebayMotorsMode
          ? await classifyEbayMotorsTitle(amazonData.title || '', asin, usageContext)
          : null;

        sendSse({
          type: 'item',
          item: {
            id: `asin-precheck-${asin}`,
            asin,
            sku: generated.sku,
            baseSku: generated.baseSku,
            active,
            activeStatus: active ? 'active' : 'inactive',
            title: amazonData.title || '',
            image: Array.isArray(amazonData.images) ? amazonData.images[0] || '' : '',
            ...enrichment,
            ebayMotorsMode,
            ebayMotorsEligible: ebayMotorsEligibility?.eligible ?? null,
            ebayMotorsReason: ebayMotorsEligibility?.reason || '',
            ebayMotorsSignals: ebayMotorsEligibility?.signals || null,
            ebayMotorsDetected: ebayMotorsEligibility?.detected || null,
            intent: ebayMotorsEligibility && !ebayMotorsEligibility.eligible ? 'excluded' : 'neutral',
            sourceData,
            status: 'success',
            progressStage: 'complete',
            errors: []
          },
          progress: ++completed,
          total: asins.length
        });
      } catch (error) {
        console.error(`[ASIN Precheck] Error processing ${asin}:`, error.message);
        const active = activeSkuSet.has(generated.sku) || activeSkuSet.has(generated.baseSku);

        sendSse({
          type: 'item',
          item: {
            id: `asin-precheck-${asin}`,
            asin,
            sku: generated.sku,
            baseSku: generated.baseSku,
            active,
            activeStatus: active ? 'active' : 'inactive',
            title: '',
            image: '',
            price: '',
            priceNumber: null,
            availabilityStatus: '',
            inStock: null,
            rating: null,
            reviewCount: null,
            shippingTime: '',
            shippingCondition: '',
            marketplaceTimezone: MARKETPLACE_TIMEZONES[region] || MARKETPLACE_TIMEZONES.US,
            scrapedAt: new Date().toISOString(),
            deliveryDate: null,
            deliveryDays: null,
            ebayMotorsMode,
            ebayMotorsEligible: ebayMotorsMode ? false : null,
            ebayMotorsReason: ebayMotorsMode ? 'Could not check title eligibility' : '',
            ebayMotorsSignals: ebayMotorsMode ? { hasModel: false, hasYear: false, isUniversal: false } : null,
            ebayMotorsDetected: ebayMotorsMode ? { modelNames: [], years: [], universalPhrase: '' } : null,
            intent: ebayMotorsMode ? 'excluded' : 'neutral',
            sourceData: null,
            status: 'error',
            progressStage: 'complete',
            errors: [error.message]
          },
          progress: ++completed,
          total: asins.length
        });
      }
    }, () => !streamClosed);

    sendSse({ type: 'complete', total: completed });
    sendDone();
    if (heartbeat) clearInterval(heartbeat);
    res.end();
  } catch (error) {
    console.error('[ASIN Precheck] Stream error:', error);
    if (heartbeat) clearInterval(heartbeat);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to run ASIN precheck', details: error.message });
    }
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

/**
 * GET /precheck-stats
 * Aggregated counts of prechecked ASINs (from AsinPrecheckLog) for the
 * Precheck Stats page: totals + breakdowns by country, day, user, and
 * seller/template.
 * Query: either startDate/endDate (YYYY-MM-DD, PDT days — endDate defaults to
 * startDate for a single day) or days (1-365 rolling window, default 30);
 * plus optional region (US|UK|CA|AU).
 */
router.get('/precheck-stats', requireAuth, async (req, res) => {
  try {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const startDateParam = dateRe.test(String(req.query.startDate || '')) ? String(req.query.startDate) : null;
    const endDateParam = dateRe.test(String(req.query.endDate || '')) ? String(req.query.endDate) : startDateParam;

    let match;
    let rangeInfo;
    if (startDateParam) {
      const from = zonedMidnightUtc(startDateParam, PRECHECK_STATS_TIMEZONE);
      const toExclusive = zonedMidnightUtc(nextDateStr(endDateParam), PRECHECK_STATS_TIMEZONE);
      if (toExclusive <= from) {
        return res.status(400).json({ error: 'endDate must be on or after startDate' });
      }
      match = { createdAt: { $gte: from, $lt: toExclusive } };
      rangeInfo = { mode: 'range', startDate: startDateParam, endDate: endDateParam };
    } else {
      const days = Math.min(365, Math.max(1, Number.parseInt(req.query.days, 10) || 30));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      match = { createdAt: { $gte: since } };
      rangeInfo = { mode: 'rolling', days, since: since.toISOString() };
    }
    if (['US', 'UK', 'CA', 'AU'].includes(req.query.region)) {
      match.region = req.query.region;
    }

    const [totals, byRegion, byDay, byUser, bySellerTemplate] = await Promise.all([
      AsinPrecheckLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            asinCount: { $sum: '$asinCount' },
            batchCount: { $sum: 1 },
            availabilityRetryCount: { $sum: '$availabilityRetryCount' },
            availabilityRetrySuccessCount: { $sum: '$availabilityRetrySuccessCount' }
          }
        }
      ]),
      AsinPrecheckLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$region',
            asinCount: { $sum: '$asinCount' },
            batchCount: { $sum: 1 },
            availabilityRetryCount: { $sum: '$availabilityRetryCount' },
            availabilityRetrySuccessCount: { $sum: '$availabilityRetrySuccessCount' }
          }
        },
        { $sort: { asinCount: -1 } }
      ]),
      AsinPrecheckLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: PRECHECK_STATS_TIMEZONE } },
              region: '$region'
            },
            asinCount: { $sum: '$asinCount' }
          }
        },
        { $sort: { '_id.day': -1 } }
      ]),
      AsinPrecheckLog.aggregate([
        { $match: match },
        { $group: { _id: '$user', asinCount: { $sum: '$asinCount' }, batchCount: { $sum: 1 } } },
        { $sort: { asinCount: -1 } }
      ]),
      AsinPrecheckLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: { seller: '$seller', template: '$template' },
            asinCount: { $sum: '$asinCount' },
            batchCount: { $sum: 1 }
          }
        },
        { $sort: { asinCount: -1 } },
        { $limit: 100 }
      ])
    ]);

    // Resolve ids to display names in one query per collection
    const userIds = byUser.map((row) => row._id).filter(Boolean);
    const sellerIds = bySellerTemplate.map((row) => row._id.seller).filter(Boolean);
    const templateIds = bySellerTemplate.map((row) => row._id.template).filter(Boolean);

    const [users, sellers, templates] = await Promise.all([
      userIds.length
        ? User.find({ _id: { $in: userIds } }).select('username email').lean()
        : [],
      sellerIds.length
        ? Seller.find({ _id: { $in: sellerIds } }).populate('user', 'username email').lean()
        : [],
      templateIds.length
        ? ListingTemplate.find({ _id: { $in: templateIds } }).select('name').lean()
        : []
    ]);

    const userNameById = new Map(users.map((u) => [String(u._id), u.username || u.email || String(u._id)]));
    const sellerNameById = new Map(sellers.map((s) => [String(s._id), s.user?.username || s.user?.email || String(s._id)]));
    const templateNameById = new Map(templates.map((t) => [String(t._id), t.name || String(t._id)]));

    res.json({
      ...rangeInfo,
      totals: totals[0]
        ? {
            asinCount: totals[0].asinCount,
            batchCount: totals[0].batchCount,
            availabilityRetryCount: totals[0].availabilityRetryCount || 0,
            availabilityRetrySuccessCount: totals[0].availabilityRetrySuccessCount || 0
          }
        : { asinCount: 0, batchCount: 0, availabilityRetryCount: 0, availabilityRetrySuccessCount: 0 },
      byRegion: byRegion.map((row) => ({
        region: row._id,
        asinCount: row.asinCount,
        batchCount: row.batchCount,
        availabilityRetryCount: row.availabilityRetryCount || 0,
        availabilityRetrySuccessCount: row.availabilityRetrySuccessCount || 0
      })),
      byDay: byDay.map((row) => ({ day: row._id.day, region: row._id.region, asinCount: row.asinCount })),
      byUser: byUser.map((row) => ({
        userId: row._id ? String(row._id) : null,
        userName: row._id ? (userNameById.get(String(row._id)) || String(row._id)) : 'Unknown',
        asinCount: row.asinCount,
        batchCount: row.batchCount
      })),
      bySellerTemplate: bySellerTemplate.map((row) => ({
        sellerId: row._id.seller ? String(row._id.seller) : null,
        sellerName: row._id.seller ? (sellerNameById.get(String(row._id.seller)) || String(row._id.seller)) : 'Unknown',
        templateId: row._id.template ? String(row._id.template) : null,
        templateName: row._id.template ? (templateNameById.get(String(row._id.template)) || String(row._id.template)) : 'Unknown',
        asinCount: row.asinCount,
        batchCount: row.batchCount
      }))
    });
  } catch (error) {
    console.error('[Precheck Stats] Failed:', error);
    res.status(500).json({ error: error.message || 'Failed to load precheck stats' });
  }
});

const IST_OFFSET_MINUTES = 330;

const parseIstDateBoundary = (dateValue, isEndOfDay = false) => {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(dateValue);

  const [, year, month, day] = match.map(Number);
  const utcTime = Date.UTC(
    year,
    month - 1,
    day,
    isEndOfDay ? 23 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 59 : 0,
    isEndOfDay ? 999 : 0
  );
  return new Date(utcTime - IST_OFFSET_MINUTES * 60 * 1000);
};

const parseIstDateTime = (dateTimeValue) => {
  const match = String(dateTimeValue || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return new Date(dateTimeValue);

  const [, year, month, day, hour, minute, second = '0'] = match;
  const utcTime = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0
  );
  return new Date(utcTime - IST_OFFSET_MINUTES * 60 * 1000);
};

// ASIN Precheck AI usage (eBay Motors title eligibility checks).
// Under /api/template-listings → GET /api/template-listings/api/precheck-usage-summary (frontend)
// Under /api → GET /api/precheck-usage-summary (top-level alias)
router.get(['/api/precheck-usage-summary', '/precheck-usage-summary'], requireAuth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      startDateTime,
      endDateTime,
      userId,
      sellerId,
      templateId,
      limit = 500
    } = req.query;

    const match = { service: 'OpenAI', fieldType: 'precheck' };

    if (startDateTime || endDateTime) {
      match.timestamp = {};
      if (startDateTime) match.timestamp.$gte = parseIstDateTime(startDateTime);
      if (endDateTime) match.timestamp.$lte = parseIstDateTime(endDateTime);
    } else if (startDate || endDate) {
      match.timestamp = {};
      if (startDate) match.timestamp.$gte = parseIstDateBoundary(startDate);
      if (endDate) match.timestamp.$lte = parseIstDateBoundary(endDate, true);
    }

    if (userId && userId !== 'all' && mongoose.Types.ObjectId.isValid(userId)) {
      match.userId = new mongoose.Types.ObjectId(userId);
    }
    if (sellerId && sellerId !== 'all' && mongoose.Types.ObjectId.isValid(sellerId)) {
      match.sellerId = new mongoose.Types.ObjectId(sellerId);
    }
    if (templateId && templateId !== 'all' && mongoose.Types.ObjectId.isValid(templateId)) {
      match.templateId = new mongoose.Types.ObjectId(templateId);
    }

    const maxRows = Math.min(parseInt(limit, 10) || 500, 2000);

    const [rows, totalsAgg, filterOptionsAgg] = await Promise.all([
      ApiUsage.aggregate([
        { $match: match },
        {
          $group: {
            _id: { userId: '$userId', sellerId: '$sellerId', templateId: '$templateId' },
            aiCalls: { $sum: 1 },
            successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
            failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            asins: {
              $addToSet: {
                $cond: [{ $and: [{ $ne: ['$asin', null] }, { $ne: ['$asin', ''] }] }, '$asin', '$$REMOVE']
              }
            },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } },
            firstUsedAt: { $min: '$timestamp' },
            lastUsedAt: { $max: '$timestamp' }
          }
        },
        { $lookup: { from: 'users', localField: '_id.userId', foreignField: '_id', as: 'user' } },
        { $lookup: { from: 'sellers', localField: '_id.sellerId', foreignField: '_id', as: 'seller' } },
        { $lookup: { from: 'users', localField: 'seller.user', foreignField: '_id', as: 'sellerUser' } },
        { $lookup: { from: 'listingtemplates', localField: '_id.templateId', foreignField: '_id', as: 'template' } },
        { $sort: { lastUsedAt: -1 } },
        { $limit: maxRows },
        {
          $project: {
            _id: 0,
            userId: '$_id.userId',
            sellerId: '$_id.sellerId',
            templateId: '$_id.templateId',
            username: { $ifNull: [{ $arrayElemAt: ['$user.username', 0] }, 'Unknown user'] },
            userEmail: { $arrayElemAt: ['$user.email', 0] },
            sellerName: { $ifNull: [{ $arrayElemAt: ['$sellerUser.username', 0] }, 'Unknown seller'] },
            templateName: { $ifNull: [{ $arrayElemAt: ['$template.name', 0] }, 'Unknown template'] },
            asinCount: { $size: '$asins' },
            aiCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1,
            firstUsedAt: 1,
            lastUsedAt: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            aiCalls: { $sum: 1 },
            successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
            failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            asins: {
              $addToSet: {
                $cond: [{ $and: [{ $ne: ['$asin', null] }, { $ne: ['$asin', ''] }] }, '$asin', '$$REMOVE']
              }
            },
            users: { $addToSet: '$userId' },
            templates: { $addToSet: '$templateId' },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            aiCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            asinCount: { $size: '$asins' },
            userCount: { $size: '$users' },
            templateCount: { $size: '$templates' },
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        { $match: match },
        {
          $facet: {
            users: [
              { $match: { userId: { $ne: null } } },
              { $group: { _id: '$userId', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 500 },
              { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  label: { $ifNull: [{ $arrayElemAt: ['$user.username', 0] }, 'Unknown user'] },
                  secondary: { $arrayElemAt: ['$user.email', 0] },
                  count: 1
                }
              }
            ],
            sellers: [
              { $match: { sellerId: { $ne: null } } },
              { $group: { _id: '$sellerId', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 500 },
              { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 'seller' } },
              { $lookup: { from: 'users', localField: 'seller.user', foreignField: '_id', as: 'sellerUser' } },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  label: { $ifNull: [{ $arrayElemAt: ['$sellerUser.username', 0] }, 'Unknown seller'] },
                  secondary: { $arrayElemAt: ['$sellerUser.email', 0] },
                  count: 1
                }
              }
            ],
            templates: [
              { $match: { templateId: { $ne: null } } },
              { $group: { _id: '$templateId', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 500 },
              { $lookup: { from: 'listingtemplates', localField: '_id', foreignField: '_id', as: 'template' } },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  label: { $ifNull: [{ $arrayElemAt: ['$template.name', 0] }, 'Unknown template'] },
                  count: 1
                }
              }
            ]
          }
        }
      ])
    ]);

    const totals = totalsAgg[0] || {
      aiCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      asinCount: 0,
      userCount: 0,
      templateCount: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0
    };

    res.json({
      success: true,
      rows,
      totals,
      filterOptions: filterOptionsAgg[0] || { users: [], sellers: [], templates: [] }
    });
  } catch (error) {
    console.error('[Precheck Usage Summary] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch precheck usage summary' });
  }
});

// AI Listing Usage (Add Template Listings OpenAI calls).
// Under /api/template-listings → GET /api/template-listings/api/openai-usage-summary (frontend)
router.get(['/api/openai-usage-summary', '/openai-usage-summary'], requireAuth, async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      startDateTime,
      endDateTime,
      userId,
      sellerId,
      templateId,
      ipAddress,
      limit = 500
    } = req.query;

    const match = { service: 'OpenAI' };
    const optionMatch = { service: 'OpenAI' };
    let listingRunDateRange = null;

    if (startDateTime || endDateTime) {
      match.timestamp = {};
      optionMatch.timestamp = optionMatch.timestamp || {};
      listingRunDateRange = {};
      if (startDateTime) {
        const start = parseIstDateTime(startDateTime);
        match.timestamp.$gte = start;
        optionMatch.timestamp.$gte = start;
        listingRunDateRange.$gte = start;
      }
      if (endDateTime) {
        const end = parseIstDateTime(endDateTime);
        match.timestamp.$lte = end;
        optionMatch.timestamp.$lte = end;
        listingRunDateRange.$lte = end;
      }
    } else if (startDate || endDate) {
      match.timestamp = {};
      listingRunDateRange = {};
      if (startDate) {
        const start = parseIstDateBoundary(startDate);
        match.timestamp.$gte = start;
        optionMatch.timestamp = optionMatch.timestamp || {};
        optionMatch.timestamp.$gte = start;
        listingRunDateRange.$gte = start;
      }
      if (endDate) {
        const end = parseIstDateBoundary(endDate, true);
        match.timestamp.$lte = end;
        optionMatch.timestamp = optionMatch.timestamp || {};
        optionMatch.timestamp.$lte = end;
        listingRunDateRange.$lte = end;
      }
    }

    if (userId && userId !== 'all' && mongoose.Types.ObjectId.isValid(userId)) {
      match.userId = new mongoose.Types.ObjectId(userId);
    }
    if (sellerId && sellerId !== 'all' && mongoose.Types.ObjectId.isValid(sellerId)) {
      match.sellerId = new mongoose.Types.ObjectId(sellerId);
    }
    if (templateId && templateId !== 'all' && mongoose.Types.ObjectId.isValid(templateId)) {
      match.templateId = new mongoose.Types.ObjectId(templateId);
    }
    if (ipAddress && ipAddress !== 'all') {
      match.ipAddress = ipAddress;
    }

    const maxRows = Math.min(parseInt(limit, 10) || 500, 2000);

    const [rows, fieldBreakdown, fieldAsinBreakdown, asinCallBreakdown, ipBreakdown, totalsAgg, filterOptionsAgg] = await Promise.all([
      ApiUsage.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              userId: '$userId',
              sellerId: '$sellerId',
              templateId: '$templateId',
              ipAddress: '$ipAddress',
              ipSource: '$ipSource',
              aiRunId: '$aiRunId'
            },
            aiCalls: { $sum: 1 },
            successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
            failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            successfulAsins: {
              $addToSet: {
                $cond: [
                  { $and: ['$success', { $ne: ['$asin', null] }, { $ne: ['$asin', ''] }] },
                  '$asin',
                  '$$REMOVE'
                ]
              }
            },
            successfulAsinRuns: {
              $push: {
                $cond: [
                  { $and: ['$success', { $ne: ['$asin', null] }, { $ne: ['$asin', ''] }] },
                  {
                    asin: '$asin',
                    fieldName: '$fieldName',
                    timestamp: '$timestamp'
                  },
                  '$$REMOVE'
                ]
              }
            },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } },
            avgResponseTime: { $avg: '$responseTime' },
            userAgents: {
              $addToSet: {
                $cond: [
                  { $and: [{ $ne: ['$userAgent', null] }, { $ne: ['$userAgent', ''] }] },
                  '$userAgent',
                  '$$REMOVE'
                ]
              }
            },
            firstUsedAt: { $min: '$timestamp' },
            aiRunStartedAt: { $min: { $ifNull: ['$aiRunStartedAt', '$timestamp'] } },
            lastUsedAt: { $max: '$timestamp' }
          }
        },
        { $sort: { lastUsedAt: -1, totalTokens: -1, aiCalls: -1 } },
        { $limit: maxRows },
        {
          $lookup: {
            from: 'users',
            localField: '_id.userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $lookup: {
            from: 'sellers',
            localField: '_id.sellerId',
            foreignField: '_id',
            as: 'seller'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'seller.user',
            foreignField: '_id',
            as: 'sellerUser'
          }
        },
        {
          $lookup: {
            from: 'listingtemplates',
            localField: '_id.templateId',
            foreignField: '_id',
            as: 'template'
          }
        },
        {
          $lookup: {
            from: 'ailistingruns',
            localField: '_id.aiRunId',
            foreignField: 'aiRunId',
            as: 'listingRun'
          }
        },
        {
          $project: {
            _id: 0,
            userId: '$_id.userId',
            sellerId: '$_id.sellerId',
            templateId: '$_id.templateId',
            aiRunId: { $ifNull: ['$_id.aiRunId', 'legacy-usage'] },
            aiRunStartedAt: 1,
            ipAddress: { $ifNull: ['$_id.ipAddress', 'Unknown IP'] },
            ipSource: { $ifNull: ['$_id.ipSource', 'unknown'] },
            username: { $ifNull: [{ $arrayElemAt: ['$user.username', 0] }, 'Unknown user'] },
            userEmail: { $arrayElemAt: ['$user.email', 0] },
            userRole: { $arrayElemAt: ['$user.role', 0] },
            sellerName: { $ifNull: [{ $arrayElemAt: ['$sellerUser.username', 0] }, 'Unknown seller'] },
            sellerEmail: { $arrayElemAt: ['$sellerUser.email', 0] },
            templateName: { $ifNull: [{ $arrayElemAt: ['$template.name', 0] }, 'Unknown template'] },
            aiCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            savedFromReviewCount: {
              $ifNull: [{ $arrayElemAt: ['$listingRun.savedFromReviewCount', 0] }, 0]
            },
            updateableDuplicateCount: {
              $ifNull: [{ $arrayElemAt: ['$listingRun.updateableDuplicateCount', 0] }, 0]
            },
            dismissedFromReviewCount: {
              $ifNull: [{ $arrayElemAt: ['$listingRun.dismissedFromReviewCount', 0] }, 0]
            },
            dismissedNewAsinCount: {
              $ifNull: [{ $arrayElemAt: ['$listingRun.dismissedNewAsinCount', 0] }, 0]
            },
            dismissedUpdateableDuplicateCount: {
              $ifNull: [{ $arrayElemAt: ['$listingRun.dismissedUpdateableDuplicateCount', 0] }, 0]
            },
            reviewSaveAttempts: {
              $ifNull: [{ $arrayElemAt: ['$listingRun.reviewSaveAttempts', 0] }, 0]
            },
            lastSavedFromReviewAt: { $arrayElemAt: ['$listingRun.lastSavedFromReviewAt', 0] },
            successfulAsinCount: { $size: '$successfulAsins' },
            successfulAsinRunCount: { $size: '$successfulAsinRuns' },
            successfulAsinRuns: 1,
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1,
            avgResponseTime: { $round: ['$avgResponseTime', 1] },
            userAgents: 1,
            firstUsedAt: 1,
            lastUsedAt: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        { $match: match },
        {
          $addFields: {
            normalizedFieldName: {
              $cond: [
                { $or: [{ $eq: ['$fieldName', null] }, { $eq: ['$fieldName', ''] }] },
                'Unknown field',
                '$fieldName'
              ]
            }
          }
        },
        {
          $group: {
            _id: '$normalizedFieldName',
            aiCalls: { $sum: 1 },
            successfulAsins: {
              $addToSet: {
                $cond: [
                  { $and: ['$success', { $ne: ['$asin', null] }, { $ne: ['$asin', ''] }] },
                  '$asin',
                  '$$REMOVE'
                ]
              }
            },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } }
          }
        },
        { $sort: { totalTokens: -1 } },
        {
          $project: {
            _id: 0,
            fieldName: { $ifNull: ['$_id', 'unknown'] },
            aiCalls: 1,
            successfulAsinCount: { $size: '$successfulAsins' },
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        { $match: match },
        {
          $addFields: {
            normalizedFieldName: {
              $cond: [
                { $or: [{ $eq: ['$fieldName', null] }, { $eq: ['$fieldName', ''] }] },
                'Unknown field',
                '$fieldName'
              ]
            },
            normalizedAsin: {
              $cond: [
                { $or: [{ $eq: ['$asin', null] }, { $eq: ['$asin', ''] }] },
                'Unknown ASIN',
                '$asin'
              ]
            }
          }
        },
        {
          $group: {
            _id: {
              fieldName: '$normalizedFieldName',
              asin: '$normalizedAsin'
            },
            aiCalls: { $sum: 1 },
            successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
            failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } },
            firstUsedAt: { $min: '$timestamp' },
            lastUsedAt: { $max: '$timestamp' }
          }
        },
        { $match: { aiCalls: { $gt: 1 } } },
        { $sort: { aiCalls: -1, totalTokens: -1 } },
        { $limit: 500 },
        {
          $project: {
            _id: 0,
            fieldName: '$_id.fieldName',
            asin: '$_id.asin',
            aiCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1,
            firstUsedAt: 1,
            lastUsedAt: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              sellerId: '$sellerId',
              templateId: '$templateId',
              asin: '$asin'
            },
            aiCalls: { $sum: 1 },
            successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
            failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            fields: {
              $addToSet: {
                $cond: [
                  { $and: [{ $ne: ['$fieldName', null] }, { $ne: ['$fieldName', ''] }] },
                  '$fieldName',
                  '$$REMOVE'
                ]
              }
            },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } },
            firstUsedAt: { $min: '$timestamp' },
            lastUsedAt: { $max: '$timestamp' }
          }
        },
        {
          $lookup: {
            from: 'sellers',
            localField: '_id.sellerId',
            foreignField: '_id',
            as: 'seller'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'seller.user',
            foreignField: '_id',
            as: 'sellerUser'
          }
        },
        {
          $lookup: {
            from: 'listingtemplates',
            localField: '_id.templateId',
            foreignField: '_id',
            as: 'template'
          }
        },
        { $sort: { aiCalls: -1, totalTokens: -1 } },
        { $limit: 1000 },
        {
          $project: {
            _id: 0,
            sellerId: '$_id.sellerId',
            templateId: '$_id.templateId',
            asin: { $ifNull: ['$_id.asin', 'Unknown ASIN'] },
            sellerName: { $ifNull: [{ $arrayElemAt: ['$sellerUser.username', 0] }, 'Unknown seller'] },
            templateName: { $ifNull: [{ $arrayElemAt: ['$template.name', 0] }, 'Unknown template'] },
            aiCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            fields: 1,
            fieldCount: { $size: '$fields' },
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1,
            firstUsedAt: 1,
            lastUsedAt: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        {
          $match: {
            ...match,
            ipAddress: match.ipAddress || { $nin: [null, ''] },
            ipSource: { $nin: [null, ''] }
          }
        },
        {
          $group: {
            _id: '$ipAddress',
            users: {
              $addToSet: {
                $cond: [{ $ne: ['$userId', null] }, '$userId', '$$REMOVE']
              }
            },
            sellers: {
              $addToSet: {
                $cond: [{ $ne: ['$sellerId', null] }, '$sellerId', '$$REMOVE']
              }
            },
            templates: {
              $addToSet: {
                $cond: [{ $ne: ['$templateId', null] }, '$templateId', '$$REMOVE']
              }
            },
            aiCalls: { $sum: 1 },
            successfulAsins: {
              $addToSet: {
                $cond: [
                  { $and: ['$success', { $ne: ['$asin', null] }, { $ne: ['$asin', ''] }] },
                  '$asin',
                  '$$REMOVE'
                ]
              }
            },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } },
            firstUsedAt: { $min: '$timestamp' },
            lastUsedAt: { $max: '$timestamp' },
            ipSources: {
              $addToSet: {
                $cond: [
                  { $and: [{ $ne: ['$ipSource', null] }, { $ne: ['$ipSource', ''] }] },
                  '$ipSource',
                  '$$REMOVE'
                ]
              }
            }
          }
        },
        { $sort: { lastUsedAt: -1, totalTokens: -1, aiCalls: -1 } },
        {
          $project: {
            _id: 0,
            ipAddress: { $ifNull: ['$_id', 'Unknown IP'] },
            userCount: { $size: '$users' },
            sellerCount: { $size: '$sellers' },
            templateCount: { $size: '$templates' },
            successfulAsinCount: { $size: '$successfulAsins' },
            aiCalls: 1,
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1,
            firstUsedAt: 1,
            lastUsedAt: 1,
            ipSources: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            aiCalls: { $sum: 1 },
            successfulCalls: { $sum: { $cond: ['$success', 1, 0] } },
            failedCalls: { $sum: { $cond: ['$success', 0, 1] } },
            uniqueIps: {
              $addToSet: {
                $cond: [
                  { $and: [{ $ne: ['$ipAddress', null] }, { $ne: ['$ipAddress', ''] }, { $ne: ['$ipSource', null] }, { $ne: ['$ipSource', ''] }] },
                  '$ipAddress',
                  '$$REMOVE'
                ]
              }
            },
            successfulAsins: {
              $addToSet: {
                $cond: [
                  { $and: ['$success', { $ne: ['$asin', null] }, { $ne: ['$asin', ''] }] },
                  '$asin',
                  '$$REMOVE'
                ]
              }
            },
            totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
            promptTokens: { $sum: { $ifNull: ['$promptTokens', 0] } },
            completionTokens: { $sum: { $ifNull: ['$completionTokens', 0] } }
          }
        },
        {
          $project: {
            _id: 0,
            aiCalls: 1,
            successfulCalls: 1,
            failedCalls: 1,
            uniqueIpCount: { $size: '$uniqueIps' },
            successfulAsinCount: { $size: '$successfulAsins' },
            totalTokens: 1,
            promptTokens: 1,
            completionTokens: 1
          }
        }
      ]),
      ApiUsage.aggregate([
        { $match: optionMatch },
        {
          $facet: {
            users: [
              { $match: { userId: { $ne: null } } },
              { $group: { _id: '$userId', count: { $sum: 1 }, lastUsedAt: { $max: '$timestamp' } } },
              { $sort: { count: -1 } },
              { $limit: 500 },
              { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  label: { $ifNull: [{ $arrayElemAt: ['$user.username', 0] }, 'Unknown user'] },
                  secondary: { $ifNull: [{ $arrayElemAt: ['$user.email', 0] }, { $arrayElemAt: ['$user.role', 0] }] },
                  count: 1,
                  lastUsedAt: 1
                }
              }
            ],
            sellers: [
              { $match: { sellerId: { $ne: null } } },
              { $group: { _id: '$sellerId', count: { $sum: 1 }, lastUsedAt: { $max: '$timestamp' } } },
              { $sort: { count: -1 } },
              { $limit: 500 },
              { $lookup: { from: 'sellers', localField: '_id', foreignField: '_id', as: 'seller' } },
              { $lookup: { from: 'users', localField: 'seller.user', foreignField: '_id', as: 'sellerUser' } },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  label: { $ifNull: [{ $arrayElemAt: ['$sellerUser.username', 0] }, 'Unknown seller'] },
                  secondary: { $arrayElemAt: ['$sellerUser.email', 0] },
                  count: 1,
                  lastUsedAt: 1
                }
              }
            ],
            templates: [
              { $match: { templateId: { $ne: null } } },
              { $group: { _id: '$templateId', count: { $sum: 1 }, lastUsedAt: { $max: '$timestamp' } } },
              { $sort: { count: -1 } },
              { $limit: 500 },
              { $lookup: { from: 'listingtemplates', localField: '_id', foreignField: '_id', as: 'template' } },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  label: { $ifNull: [{ $arrayElemAt: ['$template.name', 0] }, 'Unknown template'] },
                  count: 1,
                  lastUsedAt: 1
                }
              }
            ],
            ips: [
              { $match: { ipAddress: { $nin: [null, ''] }, ipSource: { $nin: [null, ''] } } },
              { $group: { _id: '$ipAddress', count: { $sum: 1 }, userIds: { $addToSet: '$userId' }, lastUsedAt: { $max: '$timestamp' } } },
              { $sort: { count: -1 } },
              { $limit: 500 },
              {
                $project: {
                  _id: 0,
                  id: '$_id',
                  label: '$_id',
                  count: 1,
                  userCount: { $size: '$userIds' },
                  lastUsedAt: 1
                }
              }
            ]
          }
        }
      ])
    ]);

    const filterOptions = filterOptionsAgg[0] || { users: [], sellers: [], templates: [], ips: [] };
    const rowsWithUsage = rows;
    let zeroCallRunRows = [];

    if (!ipAddress || ipAddress === 'all') {
      const runIdsWithUsage = rowsWithUsage
        .map(row => row.aiRunId)
        .filter(runId => runId && runId !== 'legacy-usage');
      const listingRunMatch = {};

      if (runIdsWithUsage.length > 0) {
        listingRunMatch.aiRunId = { $nin: runIdsWithUsage };
      }
      if (listingRunDateRange) {
        listingRunMatch.lastSavedFromReviewAt = listingRunDateRange;
      }
      if (userId && userId !== 'all' && mongoose.Types.ObjectId.isValid(userId)) {
        listingRunMatch.userId = new mongoose.Types.ObjectId(userId);
      }
      if (sellerId && sellerId !== 'all' && mongoose.Types.ObjectId.isValid(sellerId)) {
        listingRunMatch.sellerId = new mongoose.Types.ObjectId(sellerId);
      }
      if (templateId && templateId !== 'all' && mongoose.Types.ObjectId.isValid(templateId)) {
        listingRunMatch.templateId = new mongoose.Types.ObjectId(templateId);
      }

      zeroCallRunRows = await AiListingRun.aggregate([
        { $match: listingRunMatch },
        { $sort: { lastSavedFromReviewAt: -1, updatedAt: -1 } },
        { $limit: maxRows },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $lookup: {
            from: 'sellers',
            localField: 'sellerId',
            foreignField: '_id',
            as: 'seller'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'seller.user',
            foreignField: '_id',
            as: 'sellerUser'
          }
        },
        {
          $lookup: {
            from: 'listingtemplates',
            localField: 'templateId',
            foreignField: '_id',
            as: 'template'
          }
        },
        {
          $project: {
            _id: 0,
            userId: 1,
            sellerId: 1,
            templateId: 1,
            aiRunId: 1,
            aiRunStartedAt: { $ifNull: ['$createdAt', '$lastSavedFromReviewAt'] },
            ipAddress: 'No OpenAI calls',
            ipSource: 'duplicate-skip',
            username: { $ifNull: [{ $arrayElemAt: ['$user.username', 0] }, 'Unknown user'] },
            userEmail: { $arrayElemAt: ['$user.email', 0] },
            userRole: { $arrayElemAt: ['$user.role', 0] },
            sellerName: { $ifNull: [{ $arrayElemAt: ['$sellerUser.username', 0] }, 'Unknown seller'] },
            sellerEmail: { $arrayElemAt: ['$sellerUser.email', 0] },
            templateName: { $ifNull: [{ $arrayElemAt: ['$template.name', 0] }, 'Unknown template'] },
            aiCalls: { $literal: 0 },
            successfulCalls: { $literal: 0 },
            failedCalls: { $literal: 0 },
            savedFromReviewCount: { $ifNull: ['$savedFromReviewCount', 0] },
            updateableDuplicateCount: { $ifNull: ['$updateableDuplicateCount', 0] },
            dismissedFromReviewCount: { $ifNull: ['$dismissedFromReviewCount', 0] },
            dismissedNewAsinCount: { $ifNull: ['$dismissedNewAsinCount', 0] },
            dismissedUpdateableDuplicateCount: { $ifNull: ['$dismissedUpdateableDuplicateCount', 0] },
            reviewSaveAttempts: { $ifNull: ['$reviewSaveAttempts', 0] },
            lastSavedFromReviewAt: 1,
            successfulAsinCount: { $literal: 0 },
            successfulAsinRunCount: { $literal: 0 },
            successfulAsinRuns: { $literal: [] },
            totalTokens: { $literal: 0 },
            promptTokens: { $literal: 0 },
            completionTokens: { $literal: 0 },
            avgResponseTime: { $literal: null },
            userAgents: { $literal: [] },
            firstUsedAt: '$lastSavedFromReviewAt',
            lastUsedAt: '$lastSavedFromReviewAt'
          }
        }
      ]);
    }

    const combinedRows = [...rowsWithUsage, ...zeroCallRunRows]
      .sort((a, b) => new Date(b.lastUsedAt || b.lastSavedFromReviewAt || 0) - new Date(a.lastUsedAt || a.lastSavedFromReviewAt || 0))
      .slice(0, maxRows);

    const expectedAiFieldCountByPair = new Map();
    const pairInputs = [
      ...combinedRows.map((row) => ({ sellerId: row.sellerId, templateId: row.templateId })),
      ...asinCallBreakdown.map((row) => ({ sellerId: row.sellerId, templateId: row.templateId }))
    ];

    await Promise.all(pairInputs.map(async ({ sellerId: pairSellerId, templateId: pairTemplateId }) => {
      if (!pairSellerId || !pairTemplateId) return;
      const key = `${pairSellerId}-${pairTemplateId}`;
      if (expectedAiFieldCountByPair.has(key)) return;
      expectedAiFieldCountByPair.set(key, 0);
      try {
        const effectiveTemplate = await getEffectiveTemplate(pairTemplateId, pairSellerId);
        const expectedAiFields = (effectiveTemplate.asinAutomation?.fieldConfigs || [])
          .filter((config) => config.enabled && config.source === 'ai')
          .map((config) => config.ebayField);
        expectedAiFieldCountByPair.set(key, expectedAiFields.length);
      } catch (err) {
        console.warn('[OpenAI Usage Summary] Failed to resolve expected AI fields:', err.message);
      }
    }));

    const savedCounts = await TemplateListing.aggregate([
      { $match: { aiRunId: { $ne: null } } },
      {
        $group: {
          _id: '$aiRunId',
          savedCount: { $sum: 1 }
        }
      }
    ]);

    const savedCountsMap = new Map();
    savedCounts.forEach(item => {
      if (item._id) {
        savedCountsMap.set(item._id, item.savedCount);
      }
    });

    const rowsWithExpected = combinedRows.map((row) => {
      const expectedAiFieldCount = expectedAiFieldCountByPair.get(`${row.sellerId}-${row.templateId}`) || 0;
      const savedCount = Math.max(
        Number(savedCountsMap.get(row.aiRunId) || 0),
        Number(row.savedFromReviewCount || 0)
      );
      return {
        ...row,
        expectedAiFieldCount,
        expectedAiCalls: expectedAiFieldCount * (row.successfulAsinCount || 0),
        overExpectedCalls: Math.max(0, (row.aiCalls || 0) - (expectedAiFieldCount * (row.successfulAsinCount || 0))),
        savedCount
      };
    });

    const asinCallBreakdownWithExpected = asinCallBreakdown.map((row) => {
      const expectedAiFieldCount = expectedAiFieldCountByPair.get(`${row.sellerId}-${row.templateId}`) || 0;
      return {
        ...row,
        expectedAiFieldCount,
        overExpectedCalls: Math.max(0, (row.aiCalls || 0) - expectedAiFieldCount)
      };
    }).filter((row) => row.overExpectedCalls > 0);
    const totals = totalsAgg[0] || {
      aiCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      uniqueIpCount: 0,
      successfulAsinCount: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0
    };
    totals.savedFromReviewCount = rowsWithExpected.reduce(
      (sum, row) => sum + Number(row.savedFromReviewCount || 0),
      0
    );

    res.json({
      success: true,
      rows: rowsWithExpected,
      fieldBreakdown,
      fieldAsinBreakdown,
      asinCallBreakdown: asinCallBreakdownWithExpected,
      ipBreakdown,
      filterOptions,
      totals
    });
  } catch (error) {
    console.error('[OpenAI Usage Summary] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch OpenAI usage summary' });
  }
});

export default router;

