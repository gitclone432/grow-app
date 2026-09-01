import SellerSkuIndex from '../models/SellerSkuIndex.js';
import { fetchAmazonData, getTemplateOverlayFetchOptions } from './asinAutofill.js';
import { generateSKUFromASIN } from './skuGenerator.js';

/**
 * Shared ASIN-precheck enrichment logic, used by both the /asin-precheck-stream
 * SSE route (Back/src/routes/asinPrecheck.js, manual flow) and the automated
 * SourcingRule engine (Back/src/lib/asinSourcingAutomation.js), so both paths
 * enrich/filter ASINs identically.
 */

export function getBaseSku(sku = '') {
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

export const MARKETPLACE_TIMEZONES = {
  US: 'America/Los_Angeles',
  UK: 'Europe/London',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
};

const MONTH_INDEX = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function getMarketplaceLocalDateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value) - 1,
    day: Number(parts.find((part) => part.type === 'day')?.value),
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
    deliveryDays: Number.isFinite(deliveryDays) ? deliveryDays : null,
  };
}

export function getPrecheckEnrichment(amazonData = {}, region = 'US', scrapedAt = new Date()) {
  const rawData = amazonData.rawData?.rawData || amazonData.rawData || {};
  const customerReviews = rawData.product_information?.customer_reviews || {};
  const rating = toNumeric(rawData.average_rating ?? customerReviews.stars ?? 0);
  const reviewCount = toNumeric(rawData.total_reviews ?? rawData.total_ratings ?? customerReviews.ratings_count ?? 0);
  const availabilityStatus = String(rawData.availability_status || '').trim();
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
    deliveryDays: delivery.deliveryDays,
  };
}

/** Loads the set of active SKUs/baseSKUs for a seller, given candidate ASINs. */
export async function loadActiveSkuSet(sellerId, asins) {
  const generatedRows = asins.map((asin) => {
    const sku = generateSKUFromASIN(asin);
    return { asin, sku, baseSku: getBaseSku(sku) };
  });
  const skuValues = [...new Set(generatedRows.flatMap((row) => [row.sku, row.baseSku]).filter(Boolean))];
  const activeRecords = skuValues.length > 0
    ? await SellerSkuIndex.find({
        seller: sellerId,
        $or: [{ sku: { $in: skuValues } }, { baseSku: { $in: skuValues } }],
      }).select('sku baseSku').lean()
    : [];

  const activeSkuSet = new Set();
  activeRecords.forEach((record) => {
    if (record.sku) activeSkuSet.add(record.sku);
    if (record.baseSku) activeSkuSet.add(record.baseSku);
  });

  const rowByAsin = new Map(generatedRows.map((row) => [row.asin, row]));
  return { activeSkuSet, rowByAsin };
}

/**
 * Fetches + enriches one ASIN the same way the manual /asin-precheck-stream
 * route does, returning a precheck row. Throws on fetch failure — callers
 * decide how to handle per-ASIN errors.
 */
export async function precheckAsin(asin, region, template, activeSkuSet, generated) {
  const sku = generated?.sku || generateSKUFromASIN(asin);
  const baseSku = generated?.baseSku || getBaseSku(sku);
  const scrapedAt = new Date();
  const amazonData = await fetchAmazonData(asin, region, {
    ...getTemplateOverlayFetchOptions(template),
  });

  const active = activeSkuSet.has(sku) || activeSkuSet.has(baseSku);
  const enrichment = getPrecheckEnrichment(amazonData, region, scrapedAt);

  return {
    asin,
    sku,
    baseSku,
    active,
    title: amazonData.title || '',
    image: Array.isArray(amazonData.images) ? amazonData.images[0] || '' : '',
    ...enrichment,
  };
}

/**
 * Applies the "universal" precheck filters (price already applied at search
 * time upstream) the same way the manual ASIN Precheck page's client-side
 * getFilteredRows does (Front/src/pages/admin/AsinPrecheckPage.jsx).
 */
export function passesPrecheckFilters(row, filters = {}) {
  const minRating = Number(filters.minRating);
  const deliveryWithinDays = Number(filters.deliveryWithinDays);
  const stock = filters.stock ?? 'all';
  const active = filters.active ?? 'all';
  const excludeKeywords = Array.isArray(filters.excludeKeywords)
    ? filters.excludeKeywords.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean)
    : [];

  if (Number.isFinite(minRating) && String(filters.minRating ?? '') !== '' && !(Number(row.rating) >= minRating)) return false;
  if (Number.isFinite(deliveryWithinDays) && String(filters.deliveryWithinDays ?? '') !== '' && !(Number(row.deliveryDays) <= deliveryWithinDays)) return false;
  if (stock === 'in_stock' && row.inStock !== true) return false;
  if (stock === 'out_of_stock' && row.inStock !== false) return false;
  if (active === 'active' && row.active !== true) return false;
  if (active === 'inactive' && row.active !== false) return false;
  if (excludeKeywords.length > 0) {
    const title = String(row.title || '').toLowerCase();
    if (excludeKeywords.some((keyword) => title.includes(keyword))) return false;
  }
  return true;
}
