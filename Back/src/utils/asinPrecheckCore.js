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
  if (value == null || value === '') return NaN;
  if (typeof value === 'number') return value;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function firstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function extractRatingAndReviews(amazonData = {}, rawData = {}) {
  const info = rawData.product_information || amazonData.productInformation || {};
  const reviews = (info.customer_reviews && typeof info.customer_reviews === 'object' && !Array.isArray(info.customer_reviews))
    ? info.customer_reviews
    : {};
  const rating = firstFinite(
    toNumeric(amazonData.averageRating),
    toNumeric(amazonData.rating),
    toNumeric(rawData.average_rating),
    toNumeric(reviews.stars),
    toNumeric(reviews.rating),
    typeof info.customer_reviews === 'string' ? toNumeric(info.customer_reviews) : NaN
  );
  const reviewCount = firstFinite(
    toNumeric(amazonData.reviewCount),
    toNumeric(rawData.total_reviews),
    toNumeric(rawData.total_ratings),
    toNumeric(reviews.ratings_count),
    toNumeric(reviews.ratings),
    amazonData.customerReviewCount > 0 ? toNumeric(amazonData.customerReviewCount) : NaN
  );
  return {
    rating: rating != null && rating > 0 ? rating : null,
    reviewCount: reviewCount != null && reviewCount > 0 ? reviewCount : null,
  };
}

export const MARKETPLACE_TIMEZONES = {
  US: 'America/Los_Angeles',
  UK: 'Europe/London',
  CA: 'America/Toronto',
  AU: 'Australia/Sydney',
};

const MONTH_INDEX = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const MONTH_PATTERN = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';

function getRawPayload(amazonData = {}) {
  return amazonData.rawData?.rawData || amazonData.rawData || {};
}

function flattenDeliveryValue(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenDeliveryValue);
  if (typeof value === 'object') {
    return [value.date, value.comments, value.shipping_info, value.message, value.text]
      .filter(Boolean)
      .map(String);
  }
  return [String(value)];
}

function collectStockText(amazonData = {}) {
  const raw = getRawPayload(amazonData);
  const offer = raw.purchase_options?.single_offer || {};
  return String(
    raw.availability_status
    || amazonData.availabilityStatus
    || offer.stock
    || raw.stock
    || ''
  ).trim();
}

function parseStockQuantityFromText(text = '') {
  const lower = String(text || '').toLowerCase();
  const patterns = [
    /only\s+(\d+)\s+left(?:\s+in\s+stock)?/,
    /(\d+)\s+left\s+in\s+stock/,
    /(\d+)\s+in\s+stock/,
    /qty[:\s]+(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const qty = Number.parseInt(match[1], 10);
      if (Number.isFinite(qty)) return qty;
    }
  }
  return null;
}

function readNumericQuantity(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    const qty = Number(String(value).replace(/,/g, '').trim());
    if (Number.isFinite(qty) && qty >= 0) return qty;
  }
  return null;
}

function parseAvailabilityStock(amazonData = {}, availabilityStatus = '') {
  const raw = getRawPayload(amazonData);
  const offer = raw.purchase_options?.single_offer || {};
  const text = String(availabilityStatus || '').trim();
  const lower = text.toLowerCase();
  const stockQuantity = parseStockQuantityFromText(text)
    ?? parseStockQuantityFromText(offer.stock)
    ?? readNumericQuantity(
      raw.availability_quantity,
      offer.quantity,
      offer.available_quantity,
      offer.stock_quantity,
      amazonData.stockQuantity
    );

  if (lower.includes('out of stock') || lower.includes('currently unavailable') || (lower.includes('unavailable') && stockQuantity == null)) {
    return { inStock: false, stockQuantity: null, stockLabel: 'Out of Stock' };
  }

  if (
    stockQuantity != null
    || lower.includes('in stock')
    || lower.includes('order soon')
    || lower.includes('available')
  ) {
    return {
      inStock: true,
      stockQuantity,
      stockLabel: 'In Stock',
    };
  }

  return { inStock: null, stockQuantity, stockLabel: '' };
}

function collectDeliveryLines(amazonData = {}) {
  const raw = getRawPayload(amazonData);
  const offer = raw.purchase_options?.single_offer || {};
  return [
    amazonData.shippingTime,
    amazonData.shippingCondition,
    raw.shipping_info,
    raw.shipping_time,
    raw.shipping_condition,
    ...flattenDeliveryValue(raw.delivery),
    ...flattenDeliveryValue(offer.delivery),
  ].map((line) => String(line || '').trim()).filter(Boolean);
}

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

function toDeliveryResult(year, month, day, scrapedLocal) {
  let deliveryUtc = Date.UTC(year, month, day);
  const scrapedUtc = Date.UTC(scrapedLocal.year, scrapedLocal.month, scrapedLocal.day);
  if (deliveryUtc < scrapedUtc) {
    year += 1;
    deliveryUtc = Date.UTC(year, month, day);
  }
  const deliveryDays = Math.round((deliveryUtc - scrapedUtc) / 86400000);
  return {
    deliveryDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    deliveryDays: Number.isFinite(deliveryDays) ? deliveryDays : null,
  };
}

function parseShippingDate(shippingValue, scrapedAt, timezone) {
  const raw = String(shippingValue || '').trim();
  if (!raw) return { deliveryDate: null, deliveryDays: null };

  const scrapedLocal = getMarketplaceLocalDateParts(scrapedAt, timezone);
  if (/\btoday\b/i.test(raw)) {
    return toDeliveryResult(scrapedLocal.year, scrapedLocal.month, scrapedLocal.day, scrapedLocal);
  }
  if (/\btomorrow\b/i.test(raw)) {
    const tomorrow = new Date(Date.UTC(scrapedLocal.year, scrapedLocal.month, scrapedLocal.day + 1));
    return toDeliveryResult(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), scrapedLocal);
  }
  const inDays = raw.match(/\bin\s+(\d+)\s+days?\b/i);
  if (inDays) {
    const offset = Number(inDays[1]);
    const next = new Date(Date.UTC(scrapedLocal.year, scrapedLocal.month, scrapedLocal.day + offset));
    return toDeliveryResult(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), scrapedLocal);
  }

  const monthFirst = raw.match(new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:,\\s*(\\d{4}))?`, 'i'));
  if (monthFirst) {
    const month = MONTH_INDEX[monthFirst[1].toLowerCase()];
    const day = Number(monthFirst[2]);
    const year = monthFirst[3] ? Number(monthFirst[3]) : scrapedLocal.year;
    if (month != null && Number.isFinite(day)) {
      return toDeliveryResult(year, month, day, scrapedLocal);
    }
  }

  const dayFirst = raw.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})(?:,\\s*(\\d{4}))?`, 'i'));
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = MONTH_INDEX[dayFirst[2].toLowerCase()];
    const year = dayFirst[3] ? Number(dayFirst[3]) : scrapedLocal.year;
    if (month != null && Number.isFinite(day)) {
      return toDeliveryResult(year, month, day, scrapedLocal);
    }
  }

  return { deliveryDate: null, deliveryDays: null };
}

export function getPrecheckEnrichment(amazonData = {}, region = 'US', scrapedAt = new Date()) {
  const rawData = getRawPayload(amazonData);
  const { rating, reviewCount } = extractRatingAndReviews(amazonData, rawData);
  const availabilityStatus = collectStockText(amazonData);
  const deliveryLines = collectDeliveryLines(amazonData);
  const shippingTime = deliveryLines[0] || '';
  const shippingCondition = String(rawData.shipping_condition || amazonData.shippingCondition || '').trim();
  const marketplaceTimezone = MARKETPLACE_TIMEZONES[region] || MARKETPLACE_TIMEZONES.US;
  let delivery = { deliveryDate: null, deliveryDays: null };
  for (const line of deliveryLines) {
    delivery = parseShippingDate(line, scrapedAt, marketplaceTimezone);
    if (delivery.deliveryDays != null) break;
  }
  const parsedStock = parseAvailabilityStock(amazonData, availabilityStatus);
  let inStock = parsedStock.inStock;
  const priceNumber = parseNumericPrice(amazonData.price);
  if (inStock == null && priceNumber > 0) {
    inStock = true;
  }

  return {
    price: amazonData.price || '',
    priceNumber,
    availabilityStatus,
    inStock,
    stockQuantity: parsedStock.stockQuantity,
    stockLabel: inStock === true
      ? (parsedStock.stockLabel || 'In Stock')
      : inStock === false ? 'Out of Stock' : '',
    rating,
    reviewCount,
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
    requireDelivery: true,
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
