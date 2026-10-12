import express from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import pLimit from 'p-limit';
import { parseStringPromise } from 'xml2js';
import { requireAuth, requirePageAccess, requireFeatureAccess } from '../middleware/auth.js';
import { requireObjectId } from '../middleware/objectId.js';

// Feature id used to gate who may run Estimate/Start on this page (superadmin
// always allowed; others must be explicitly granted via /feature-permissions).
export const AMAZON_STOCK_CHECK_RUN_FEATURE_ID = 'amazonStockCheck.run';

// Pages allowed to use these endpoints. SellerSkuStockCheck is the
// seller-scoped variant of the Amazon Stock Check page.
const STOCK_CHECK_PAGES = ['AmazonStockCheck', 'SellerSkuStockCheck'];

// The revision history has its own page, and is also reachable from the stock
// check pages that create the revisions.
const LISTING_REVISION_PAGES = ['ListingRevisions', ...STOCK_CHECK_PAGES];

// The Excluded Brands page reads the runs started from the stock check pages
// and lists the SKUs whose Amazon brand / seller is on the exclusion list,
// with the same end/revise actions on each listing. It can start and cancel
// small brand-test runs, but has none of the other run controls.
const EXCLUDED_BRANDS_PAGE = 'AmazonStockCheckExcludedBrands';
const EXCLUDED_BRANDS_PAGES = [EXCLUDED_BRANDS_PAGE, ...STOCK_CHECK_PAGES];

// The SKU Listing Manager searches the SKU index for a typed SKU and offers the
// same end/revise actions on what it finds, so it shares those endpoints.
const SKU_LISTING_MANAGER_PAGE = 'SkuListingManager';
const LISTING_ACTION_PAGES = [SKU_LISTING_MANAGER_PAGE, EXCLUDED_BRANDS_PAGE, ...STOCK_CHECK_PAGES];
// The same page also answers the read-only SKU / ASIN Lookup route, so that
// page id may read the lookup — but not the end/revise routes above it.
const SKU_LOOKUP_PAGES = ['SkuIndexLookup', ...LISTING_ACTION_PAGES];
import SellerSkuIndex from '../models/SellerSkuIndex.js';
import TemplateListing from '../models/TemplateListing.js';
import Seller from '../models/Seller.js';
import Order from '../models/Order.js';
import AmazonStockCheckRun from '../models/AmazonStockCheckRun.js';
import AmazonStockCheckItem from '../models/AmazonStockCheckItem.js';
import AmazonStockSkuState from '../models/AmazonStockSkuState.js';
import AmazonStockActionLog from '../models/AmazonStockActionLog.js';
import EndListingLog from '../models/EndListingLog.js';
import ListingRevision from '../models/ListingRevision.js';
import SellerPricingConfig from '../models/SellerPricingConfig.js';
import { ensureValidToken } from './ebay.js';
import { getEffectiveTemplate } from '../utils/templateMerger.js';
import { hostImagesOnEbay, hostsAreUniform, IMAGE_LIST_SEPARATOR, splitImageList } from '../utils/overlayImage.js';
import {
  buildItemSpecifics,
  buildReviseUsageContext,
  generateListingFromAsin,
  regionForCurrency,
  resolveAvailableSku
} from '../utils/reviseListingGenerator.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { extractBrandExclusionFields, extractBuyBoxShipping, isShipsFromAmazon } from '../utils/scrapingdogProduct.js';
import {
  buildBlockListPattern,
  findBlockedBrand,
  loadPrecheckBlockList,
  normalizeBrand
} from '../utils/precheckBlockedBrands.js';

const router = express.Router();
const activeRuns = new Set();

// postalCode pins the Amazon delivery location the scraper sees, so stock
// results are measured from a consistent place instead of a random datacenter
// location. Override per country via env if needed; set to '' to disable.
const COUNTRY_CONFIG = {
  USD: { currency: 'USD', country: 'United States', domain: 'com', scrapingdogCountry: 'us', credits: 1, postalCode: process.env.SCRAPINGDOG_POSTAL_USD ?? '82801' },
  AUD: { currency: 'AUD', country: 'Australia', domain: 'com.au', scrapingdogCountry: 'au', credits: 5, postalCode: process.env.SCRAPINGDOG_POSTAL_AUD ?? '2000' },
  CAD: { currency: 'CAD', country: 'Canada', domain: 'ca', scrapingdogCountry: 'ca', credits: 5, postalCode: process.env.SCRAPINGDOG_POSTAL_CAD ?? 'A1A 1A1' },
  GBP: { currency: 'GBP', country: 'United Kingdom', domain: 'co.uk', scrapingdogCountry: 'gb', credits: 5, postalCode: process.env.SCRAPINGDOG_POSTAL_GBP ?? 'SW1A 1AA' }
};

const PILOT_OPTION_B_LIMITS = {
  USD: 100,
  AUD: 10,
  CAD: 5,
  GBP: 4
};
const SCRAPINGDOG_CONCURRENT = Math.max(1, Number.parseInt(process.env.SCRAPINGDOG_CONCURRENT || '40', 10));
// Identifies which server instance owns/resumes stock check runs — same
// convention as auto-compat batches (ebay.js). Set RUNNER_ID=render in
// Render's env vars, leave unset (defaults to 'local') on dev machines.
const RUNNER_ID = (process.env.RUNNER_ID || 'local').trim().toLowerCase();
// Delay before the single retry attempt for "ambiguous" unknown_stock_text
// results (has a returns policy, but stock/price text didn't render) — gives
// Amazon's async buy-box widget a moment longer to populate on re-scrape.
const UNKNOWN_STOCK_RETRY_DELAY_MS = Math.max(500, Number.parseInt(process.env.AMAZON_STOCK_UNKNOWN_RETRY_DELAY_MS || '3000', 10));
// Delay before the single retry attempt for outright request failures
// (timeouts, 429, 5xx) that classifyStockCheckError marks retryable — these
// are transient Scrapingdog/Amazon infrastructure hiccups, not data-shape
// issues, so a plain re-request (no special parsing) is the fix.
const ERROR_RETRY_DELAY_MS = Math.max(500, Number.parseInt(process.env.AMAZON_STOCK_ERROR_RETRY_DELAY_MS || '3000', 10));
const EBAY_QUANTITY_CONCURRENT = Math.max(1, Number.parseInt(process.env.EBAY_QUANTITY_CONCURRENT || '5', 10));
const STOCK_PROCESS_BATCH_SIZE = Math.max(100, Number.parseInt(process.env.AMAZON_STOCK_PROCESS_BATCH_SIZE || '1000', 10));
const PREPARE_CHUNK_SIZE = Math.max(100, Number.parseInt(process.env.AMAZON_STOCK_PREPARE_CHUNK_SIZE || '1000', 10));
const RUN_ITEM_INSERT_BATCH_SIZE = Math.max(100, Number.parseInt(process.env.AMAZON_STOCK_ITEM_INSERT_BATCH_SIZE || '2000', 10));
const scrapingdogLimit = pLimit(SCRAPINGDOG_CONCURRENT);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stockCheckLog(stage, details = {}) {
  console.log(`[Amazon Stock Check] ${stage}`, {
    timestamp: new Date().toISOString(),
    ...details
  });
}

function stockCheckWarn(stage, details = {}) {
  console.warn(`[Amazon Stock Check] ${stage}`, {
    timestamp: new Date().toISOString(),
    ...details
  });
}

function getElapsedMs(startedAt) {
  return Date.now() - startedAt;
}

async function flushStockCheckItemBatch(batch) {
  if (!batch.length) return;
  await AmazonStockCheckItem.insertMany(batch, { ordered: false });
  batch.length = 0;
}

function isTransientMongoError(error) {
  const message = String(error?.message || '').toLowerCase();
  const name = String(error?.name || '').toLowerCase();
  return (
    name.includes('mongonetwork') ||
    name.includes('mongoserverselection') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    message.includes('server selection') ||
    message.includes('replicasetnoprimary') ||
    message.includes('topology')
  );
}

async function withMongoRetry(label, operation, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt === attempts) break;
      const delayMs = attempt * 5000;
      console.warn(`[Amazon Stock Check] ${label} failed on attempt ${attempt}/${attempts}: ${error.message}. Retrying in ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

export function normalizeCurrency(value) {
  const cur = String(value || '').trim().toUpperCase();
  if (cur === 'GB') return 'GBP';
  return cur;
}

export function getConfig(currency) {
  return COUNTRY_CONFIG[normalizeCurrency(currency)] || null;
}

// Raw currency values to match in the SKU index for a normalized currency.
// Legacy UK rows were synced with currency "GB" instead of "GBP"; the other
// currencies are stored consistently and need no alias.
function currencyAliases(currency) {
  const normalized = normalizeCurrency(currency);
  return normalized === 'GBP' ? ['GBP', 'GB'] : [normalized];
}

export function cleanSku(value) {
  return String(value || '').trim();
}

export function getBaseLabel(value) {
  return cleanSku(value).split('-')[0].trim();
}

export function cleanAsin(value) {
  return String(value || '').trim().toUpperCase();
}

export function isAmazonAsin(value) {
  return /^[A-Z0-9]{10}$/.test(cleanAsin(value)) && cleanAsin(value).startsWith('B0');
}

// The ASIN each base SKU label points at, from TemplateListing. Keyed by the
// uppercased base label; the first ASIN seen for a label wins. Shared by the
// SKU lookup and the Keyword End Listing search, which both show an Amazon
// link beside every seller listing.
export async function loadAsinByBaseLabel(labels) {
  const asinByLabel = new Map();
  if (!labels.length) return asinByLabel;
  const templateRows = await TemplateListing.find({
    baseCustomLabel: { $in: labels },
    _asinReference: { $exists: true, $ne: '' }
  })
    .select('customLabel baseCustomLabel +_asinReference')
    .collation({ locale: 'en', strength: 2 })
    .lean();
  for (const row of templateRows) {
    const label = getBaseLabel(row.baseCustomLabel || row.customLabel).toUpperCase();
    const asin = cleanAsin(row._asinReference);
    if (label && asin && !asinByLabel.has(label)) asinByLabel.set(label, asin);
  }
  return asinByLabel;
}

function estimateCredits(candidates) {
  return candidates.reduce((sum, row) => sum + (getConfig(row.currency)?.credits || 0), 0);
}

export function parseStockStatus(payload, threshold = 5) {
  const singleOffer = payload?.purchase_options?.single_offer || {};
  const text = String(singleOffer.stock || payload?.availability_status || '').trim();
  const normalized = text.toLowerCase();
  const qtyMatch = normalized.match(/only\s+(\d+)\s+left/);
  const stockQuantity = qtyMatch ? Number.parseInt(qtyMatch[1], 10) : null;

  if (stockQuantity != null) {
    return {
      status: stockQuantity < threshold ? 'low_stock' : 'in_stock',
      stockQuantity,
      availabilityText: text || `Only ${stockQuantity} left`
    };
  }

  if (
    normalized.includes('currently unavailable') ||
    normalized.includes('out of stock') ||
    normalized.includes('unavailable')
  ) {
    return { status: 'out_of_stock', stockQuantity: null, availabilityText: text || 'Unavailable' };
  }

  if (normalized.includes('in stock')) {
    return { status: 'in_stock', stockQuantity: null, availabilityText: text || 'In Stock' };
  }

  if (text) {
    return { status: 'in_stock', stockQuantity: null, availabilityText: text };
  }

  // No stock/availability text, but a real price is present — direct proof of
  // an active, purchasable offer (Scrapingdog doesn't always emit an explicit
  // stock string for every listing template, confirmed against production
  // data where price/delivery/variants were all populated but stock was not,
  // even after a retry). Kept as its own status rather than folded into
  // "in_stock" since it's inferred from price, not confirmed by Amazon's own
  // wording — no retry needed, this is a definite signal, not an ambiguous one.
  const singleOfferPrice = singleOffer.price || singleOffer.extracted_price || null;
  if (singleOfferPrice) {
    return {
      status: 'in_stock_unconfirmed',
      stockQuantity: null,
      availabilityText: `Price found (${singleOffer.price ?? singleOffer.extracted_price}) but no explicit stock text`
    };
  }

  // No stock/availability text and no price either. Amazon only renders a
  // returns/refund policy line when a listing has an active, purchasable
  // offer; a dead ("Currently unavailable") listing's purchase box shows only
  // the ships_from/sold_by headers with no returns entry at all. Confirmed
  // against several real listings (both dead and live) in production data.
  const features = singleOffer.features || null;
  const hasActiveOfferSignal = Boolean(features) && Object.prototype.hasOwnProperty.call(features, 'returns');

  if (features && !hasActiveOfferSignal) {
    return {
      status: 'out_of_stock',
      stockQuantity: null,
      availabilityText: 'No active offer detected (no returns policy shown)'
    };
  }

  return {
    status: 'unknown_stock_text',
    stockQuantity: null,
    availabilityText: 'No stock availability text found',
    hasActiveOfferSignal
  };
}

export function classifyStockCheckError(error) {
  const status = error?.response?.status || null;
  const message = error?.message || 'Stock check failed';
  if (status) {
    // axios's own message is just "Request failed with status code 404" —
    // Scrapingdog's response body usually explains the actual reason (invalid
    // ASIN, plan/credit limit, concurrent-request limit, etc.), so surface it
    // when present instead of discarding it.
    const body = error?.response?.data;
    const bodyText = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');
    const detail = bodyText ? bodyText.slice(0, 300) : '';
    return {
      errorType: `scrapingdog_http_${status}`,
      errorSource: 'scrapingdog',
      retryable: status === 408 || status === 429 || status >= 500,
      message: detail ? `${message}: ${detail}` : message
    };
  }
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(message)) {
    return {
      errorType: 'scrapingdog_timeout',
      errorSource: 'scrapingdog',
      retryable: true,
      message
    };
  }
  if (/SCRAPINGDOG_API_KEY/i.test(message)) {
    return {
      errorType: 'configuration',
      errorSource: 'server',
      retryable: false,
      message
    };
  }
  return {
    errorType: 'stock_check_failed',
    errorSource: 'server',
    retryable: true,
    message
  };
}

// Brand, seller and shipper fields recorded on each checked item for the
// Excluded Brands page. Read from the response already fetched for the stock
// status — no extra request. Never throws: a shape surprise here must not turn
// a good stock result into an error, so it degrades to "nothing seen" instead
// (which, like a blank Ships From in the precheck, counts as not Amazon).
export function getItemBrandFields(scraperData) {
  try {
    const { brand, soldBy } = extractBrandExclusionFields(scraperData);
    const { shipsFrom } = extractBuyBoxShipping(scraperData);
    return {
      amazonBrand: brand,
      amazonSoldBy: soldBy,
      amazonBrandKey: normalizeBrand(brand),
      amazonSoldByKey: normalizeBrand(soldBy),
      amazonShipsFrom: shipsFrom,
      amazonShippedByAmazon: isShipsFromAmazon(shipsFrom)
    };
  } catch {
    return {
      amazonBrand: '',
      amazonSoldBy: '',
      amazonBrandKey: '',
      amazonSoldByKey: '',
      amazonShipsFrom: '',
      amazonShippedByAmazon: false
    };
  }
}

async function getRunStatus(runId) {
  const run = await AmazonStockCheckRun.findById(runId).select('status').lean();
  return run?.status || '';
}

// includePostalCode defaults to false: Scrapingdog confirmed passing
// postal_code was the root cause of a large, sustained wave of 400 errors
// (see amazonStockChecks.js processStockItem call sites) — opt back in
// explicitly only if deliberately testing with it again.
export async function fetchScrapingdogProduct({ asin, currency, timeoutMs = 45000, includePostalCode = false }) {
  const config = getConfig(currency);
  const apiKey = process.env.SCRAPINGDOG_API_KEY
    || (String(process.env.SCRAPER_PROVIDER || '').toLowerCase() === 'scrapingdog' ? process.env.SCRAPER_API_KEY : '')
    || '';
  if (!apiKey) {
    throw new Error('SCRAPINGDOG_API_KEY is not configured (or set SCRAPER_PROVIDER=scrapingdog with SCRAPER_API_KEY)');
  }

  const response = await axios.get('https://api.scrapingdog.com/amazon/product', {
    params: {
      api_key: apiKey,
      domain: config.domain,
      country: config.scrapingdogCountry,
      ...(includePostalCode && config.postalCode ? { postal_code: config.postalCode } : {}),
      asin
    },
    timeout: timeoutMs
  });

  return {
    statusCode: response.status,
    data: response.data
  };
}

async function reviseInventoryQuantity({ sellerId, itemId, quantity, runId, itemDocId, sku, asin, requestedBy }) {
  const log = await AmazonStockActionLog.create({
    run: runId,
    item: itemDocId,
    sku,
    asin,
    seller: sellerId,
    itemId,
    actionType: quantity === 0 ? 'set_quantity_zero' : 'set_quantity_one',
    requestedBy,
    status: 'pending',
    requestPayload: { quantity }
  });

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) throw new Error('Seller not found');

    const accessToken = await ensureValidToken(seller);
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<ReviseInventoryStatusRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials>
    <eBayAuthToken>${accessToken}</eBayAuthToken>
  </RequesterCredentials>
  <InventoryStatus>
    <ItemID>${itemId}</ItemID>
    <Quantity>${quantity}</Quantity>
  </InventoryStatus>
</ReviseInventoryStatusRequest>`;

    const tradingRes = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1271',
        'X-EBAY-API-CALL-NAME': 'ReviseInventoryStatus',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml'
      },
      timeout: 45000
    });

    const parsed = await parseStringPromise(tradingRes.data, { explicitArray: false });
    const ack = parsed?.ReviseInventoryStatusResponse?.Ack;
    if (ack !== 'Success' && ack !== 'Warning') {
      const errorMsg = parsed?.ReviseInventoryStatusResponse?.Errors?.ShortMessage || 'Unknown eBay quantity update error';
      throw new Error(errorMsg);
    }

    await AmazonStockActionLog.findByIdAndUpdate(log._id, {
      status: 'success',
      responseSummary: { ack }
    });
    return { ok: true };
  } catch (error) {
    await AmazonStockActionLog.findByIdAndUpdate(log._id, {
      status: 'failed',
      error: error.message || 'Quantity update failed'
    });
    return { ok: false, error: error.message || 'Quantity update failed' };
  }
}

function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Revises title/price on eBay (ReviseFixedPriceItem) and logs the action —
// self-contained like reviseInventoryQuantity/end-item, not tied to a
// specific run or AmazonStockCheckItem, so it works the same regardless of
// which run/seller page triggered it.
async function reviseListingDetails({ sellerId, itemId, title, price, previousTitle, previousPrice, sku, asin, requestedBy }) {
  const log = await AmazonStockActionLog.create({
    sku: sku || '',
    asin: asin || '',
    seller: sellerId,
    itemId,
    actionType: 'revise_listing',
    requestedBy,
    status: 'pending',
    requestPayload: { title, price, previousTitle, previousPrice }
  });

  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) throw new Error('Seller not found');

    const accessToken = await ensureValidToken(seller);
    let itemContent = `<ItemID>${itemId}</ItemID>`;
    if (title) itemContent += `<Title>${escapeXmlText(title)}</Title>`;
    if (price != null) itemContent += `<StartPrice>${Number(price).toFixed(2)}</StartPrice>`;

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${accessToken}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>Low</WarningLevel>
  <Item>${itemContent}</Item>
</ReviseFixedPriceItemRequest>`;

    const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
      headers: {
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
        'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
        'Content-Type': 'text/xml'
      },
      timeout: 45000
    });

    const parsed = await parseStringPromise(response.data, { explicitArray: false });
    const ack = parsed?.ReviseFixedPriceItemResponse?.Ack;
    if (ack !== 'Success' && ack !== 'Warning') {
      const errors = parsed?.ReviseFixedPriceItemResponse?.Errors;
      const errorMsg = (Array.isArray(errors) ? errors[0]?.LongMessage : errors?.LongMessage) || 'Unknown eBay revise error';
      throw new Error(errorMsg);
    }

    await AmazonStockActionLog.findByIdAndUpdate(log._id, { status: 'success', responseSummary: { ack } });
    return { ok: true };
  } catch (error) {
    await AmazonStockActionLog.findByIdAndUpdate(log._id, {
      status: 'failed',
      error: error.message || 'Revise failed'
    });
    return { ok: false, error: error.message || 'Revise failed' };
  }
}

async function getSellerNameMap(sellerIds) {
  const sellers = await Seller.find({ _id: { $in: sellerIds } }).populate('user', 'username name email').lean();
  return new Map(sellers.map((seller) => [
    String(seller._id),
    seller.user?.username || seller.user?.name || seller.user?.email || String(seller._id)
  ]));
}

// ---------------------------------------------------------------------------
// Per-listing history
//
// Orders, end-listing actions and revisions for a set of eBay item ids, keyed
// by `${sellerId}:${itemId}`. Shared by the verify drawer, the SKU Listing
// Manager page and the Keyword End Listing route, which all show one row per
// seller listing and need the same order counts and action badges beside it.
// ---------------------------------------------------------------------------
export async function loadListingHistory(itemIds) {
  if (!itemIds.length) {
    return { endedByKey: new Map(), revisedByKey: new Map(), ordersByKey: new Map() };
  }

  const [endLogs, reviseLogs, orders] = await Promise.all([
    EndListingLog.find({ itemId: { $in: itemIds } })
      .populate('endedBy', 'username name email')
      .sort({ endedAt: -1 })
      .lean(),
    AmazonStockActionLog.find({ itemId: { $in: itemIds }, actionType: 'revise_listing', status: 'success' })
      .populate('requestedBy', 'username name email')
      .sort({ createdAt: -1 })
      .lean(),
    Order.find({
      $or: [{ itemNumber: { $in: itemIds } }, { 'lineItems.legacyItemId': { $in: itemIds } }]
    })
      .select('seller orderId dateSold creationDate itemNumber lineItems quantity subtotal productName')
      .sort({ dateSold: -1, creationDate: -1 })
      .lean()
  ]);

  const endedByKey = new Map();
  for (const log of endLogs) {
    const key = `${String(log.seller)}:${log.itemId}`;
    if (endedByKey.has(key)) continue; // keep the most recent log per item
    endedByKey.set(key, {
      endedAt: log.endedAt,
      endedBy: log.endedBy?.username || log.endedBy?.name || log.endedBy?.email || null,
      source: log.source
    });
  }

  const revisedByKey = new Map();
  for (const log of reviseLogs) {
    const key = `${String(log.seller)}:${log.itemId}`;
    if (revisedByKey.has(key)) continue; // keep the most recent log per item
    revisedByKey.set(key, {
      revisedAt: log.createdAt,
      revisedBy: log.requestedBy?.username || log.requestedBy?.name || log.requestedBy?.email || null,
      previousTitle: log.requestPayload?.previousTitle || '',
      newTitle: log.requestPayload?.title || '',
      previousPrice: log.requestPayload?.previousPrice ?? null,
      newPrice: log.requestPayload?.price ?? null
    });
  }

  // Group orders by (seller, itemId); an order can reference an item id via
  // the denormalized itemNumber or any of its line items.
  const ordersByKey = new Map();
  for (const order of orders) {
    const orderDate = order.dateSold || order.creationDate || null;
    if (!orderDate) continue;
    const ids = new Set();
    if (order.itemNumber) ids.add(order.itemNumber);
    for (const lineItem of order.lineItems || []) {
      if (lineItem?.legacyItemId) ids.add(lineItem.legacyItemId);
    }
    for (const itemId of ids) {
      const key = `${String(order.seller)}:${itemId}`;
      const list = ordersByKey.get(key) || [];
      list.push({
        orderId: order.orderId,
        date: orderDate,
        quantity: order.quantity ?? null,
        subtotal: order.subtotal ?? null,
        productName: order.productName || ''
      });
      ordersByKey.set(key, list);
    }
  }

  return { endedByKey, revisedByKey, ordersByKey };
}

// Folds loadListingHistory() output onto seller-listing rows, adding the 30d /
// 90d / lifetime order counts and the 12-month sparkline series each row shows.
export function attachListingHistory(sellerItems, history, { fallbackSku = '', fallbackCurrency = '', runSellerId = null } = {}) {
  const { endedByKey, revisedByKey, ordersByKey } = history;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  // Last 12 calendar months (oldest first) for the per-item order sparkline.
  const monthKeys = [];
  const now = new Date();
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  return sellerItems.map((row) => {
    const key = `${String(row.sellerId)}:${row.itemId}`;
    const allOrders = (ordersByKey.get(key) || []).sort((a, b) => new Date(b.date) - new Date(a.date));
    const recentOrders = allOrders.filter((order) => new Date(order.date) >= since30);
    const recentOrders90d = allOrders.filter((order) => new Date(order.date) >= since90);
    const countsByMonth = new Map();
    for (const order of allOrders) {
      const d = new Date(order.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      countsByMonth.set(monthKey, (countsByMonth.get(monthKey) || 0) + 1);
    }
    return {
      sellerId: row.sellerId,
      sellerName: row.sellerName,
      itemId: row.itemId,
      sku: row.sku || fallbackSku,
      title: row.title || '',
      price: row.price ?? null,
      currency: row.currency || fallbackCurrency,
      imageUrl: row.imageUrl || '',
      syncedAt: row.syncedAt || null,
      quantityZeroStatus: row.quantityZeroStatus || 'not_needed',
      isRunSeller: runSellerId ? String(row.sellerId) === runSellerId : false,
      orderCount30d: recentOrders.length,
      orderCount90d: recentOrders90d.length,
      orders: recentOrders.slice(0, 20),
      lifetimeOrderCount: allOrders.length,
      monthlyOrders: monthKeys.map((month) => ({ month, count: countsByMonth.get(month) || 0 })),
      endedInfo: endedByKey.get(key) || null,
      revisedInfo: revisedByKey.get(key) || null
    };
  });
}

async function buildOrderSummaryMapForSellerItems(sellerItems) {
  const itemIds = [...new Set(sellerItems.map((row) => row.itemId).filter(Boolean))];
  if (!itemIds.length) return new Map();

  const startedAt = Date.now();
  const orders = await Order.aggregate([
    {
      $match: {
        $or: [
          { itemNumber: { $in: itemIds } },
          { 'lineItems.legacyItemId': { $in: itemIds } }
        ]
      }
    },
    {
      $project: {
        seller: 1,
        dateSold: 1,
        creationDate: 1,
        itemNumber: 1,
        lineItems: 1
      }
    }
  ]);
  stockCheckLog('enrichCandidates:orderLookupComplete', {
    sellerItemCount: sellerItems.length,
    itemIdCount: itemIds.length,
    orderCount: orders.length,
    elapsedMs: getElapsedMs(startedAt)
  });

  const since90 = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const orderMap = new Map();
  for (const order of orders) {
    const ids = new Set();
    if (order.itemNumber) ids.add(order.itemNumber);
    for (const lineItem of order.lineItems || []) {
      if (lineItem?.legacyItemId) ids.add(lineItem.legacyItemId);
    }
    for (const itemId of ids) {
      const key = `${String(order.seller)}:${itemId}`;
      const current = orderMap.get(key) || { count: 0, count90: 0, lastOrderDate: null };
      const orderDate = order.dateSold || order.creationDate || null;
      current.count += 1;
      if (orderDate && new Date(orderDate).getTime() >= since90) current.count90 += 1;
      if (orderDate && (!current.lastOrderDate || new Date(orderDate) > new Date(current.lastOrderDate))) {
        current.lastOrderDate = orderDate;
      }
      orderMap.set(key, current);
    }
  }

  return orderMap;
}

function attachOrderSummariesFromMap(sellerItems, orderMap) {
  return sellerItems.map((row) => {
    const summary = orderMap.get(`${String(row.sellerId)}:${row.itemId}`);
    return {
      ...row,
      orderCount: summary?.count || 0,
      orderCount90d: summary?.count90 || 0,
      lastOrderDate: summary?.lastOrderDate || null
    };
  });
}

async function buildCandidates({ currencies, mode, limit, sellerId }) {
  const startedAt = Date.now();
  stockCheckLog('buildCandidates:start', { currencies, mode, limit: limit || null, sellerId: sellerId ? String(sellerId) : null });
  const candidates = [];
  for (const currency of currencies) {
    const config = getConfig(currency);
    if (!config) continue;
    const runLimit = mode === 'pilot_option_b'
      ? PILOT_OPTION_B_LIMITS[config.currency]
      : Number.parseInt(limit, 10) || null;

    const currencyStartedAt = Date.now();
    const match = { currency: { $in: currencyAliases(config.currency) }, sku: { $ne: '' } };
    if (sellerId) match.seller = new mongoose.Types.ObjectId(String(sellerId));
    // One candidate per BASE SKU: variant listings like GRW25X-1 fold into
    // GRW25X so the same product is checked (and billed) once per currency.
    const rows = await SellerSkuIndex.aggregate([
      { $match: match },
      {
        $addFields: {
          groupKey: {
            $let: {
              vars: { base: { $ifNull: ['$baseSku', ''] } },
              in: { $cond: [{ $eq: ['$$base', ''] }, '$sku', '$$base'] }
            }
          }
        }
      },
      {
        $group: {
          _id: '$groupKey',
          currency: { $first: '$currency' },
          sellers: { $addToSet: '$seller' },
          itemCount: { $sum: 1 }
        }
      },
      { $project: { _id: 0, sku: '$_id', baseSku: '$_id', currency: 1, sellers: 1, itemCount: 1 } },
      { $sort: { sku: 1 } },
      ...(runLimit ? [{ $limit: runLimit }] : [])
    ]).allowDiskUse(true);
    stockCheckLog('buildCandidates:currencyComplete', {
      currency: config.currency,
      runLimit,
      rowCount: rows.length,
      elapsedMs: getElapsedMs(currencyStartedAt)
    });

    for (const row of rows) {
      candidates.push({
        sku: cleanSku(row.sku),
        baseSku: cleanSku(row.baseSku),
        sellers: row.sellers || [],
        currency: config.currency,
        country: config.country
      });
    }
  }
  stockCheckLog('buildCandidates:complete', {
    candidateCount: candidates.length,
    elapsedMs: getElapsedMs(startedAt)
  });
  return candidates;
}

async function enrichCandidates(candidates, { includeSellerItems = true } = {}) {
  const startedAt = Date.now();
  const skus = [...new Set(candidates.map((row) => row.sku).filter(Boolean))];
  const lookupLabels = [...new Set(candidates.map((row) => row.baseSku).map(getBaseLabel).filter(Boolean))];
  stockCheckLog('enrichCandidates:start', {
    candidateCount: candidates.length,
    skuCount: skus.length,
    lookupLabelCount: lookupLabels.length,
    includeSellerItems
  });

  const templateStartedAt = Date.now();
  const templateRows = [];
  const seenTemplateIds = new Set();
  const addTemplateRows = (rows) => {
    for (const row of rows) {
      const id = String(row._id);
      if (seenTemplateIds.has(id)) continue;
      seenTemplateIds.add(id);
      templateRows.push(row);
    }
  };

  if (lookupLabels.length) {
    const indexedLookupStartedAt = Date.now();
    const indexedRows = await TemplateListing.find({
      baseCustomLabel: { $in: lookupLabels },
      _asinReference: { $exists: true, $ne: '' }
    })
      .select('customLabel baseCustomLabel +_asinReference')
      .collation({ locale: 'en', strength: 2 })
      .lean();
    addTemplateRows(indexedRows);
    stockCheckLog('enrichCandidates:templateIndexedLookupComplete', {
      templateRowCount: indexedRows.length,
      elapsedMs: getElapsedMs(indexedLookupStartedAt)
    });
  }
  stockCheckLog('enrichCandidates:templateLookupComplete', {
    templateRowCount: templateRows.length,
    elapsedMs: getElapsedMs(templateStartedAt)
  });

  const asinByLabel = new Map();
  for (const row of templateRows) {
    const label = getBaseLabel(row.baseCustomLabel || row.customLabel).toUpperCase();
    const asin = cleanAsin(row._asinReference);
    if (!asinByLabel.has(label)) asinByLabel.set(label, asin);
  }

  if (!includeSellerItems) {
    const enriched = candidates.map((row) => {
      const baseSku = getBaseLabel(row.baseSku);
      const directAsin = isAmazonAsin(row.baseSku) ? cleanAsin(row.baseSku) : (isAmazonAsin(row.sku) ? cleanAsin(row.sku) : '');
      const asin = directAsin || (baseSku ? (asinByLabel.get(baseSku.toUpperCase()) || '') : '');
      return { ...row, asin, sellerItems: [] };
    });
    stockCheckLog('enrichCandidates:complete', {
      enrichedCount: enriched.length,
      asinFoundCount: enriched.filter((row) => row.asin).length,
      sellerItemCount: 0,
      skippedSellerItems: true,
      elapsedMs: getElapsedMs(startedAt)
    });
    return enriched;
  }

  const skuIndexStartedAt = Date.now();
  // Candidates are keyed by base SKU, so pull every index row whose base (or
  // exact, for legacy rows without a baseSku) matches.
  const skuIndexRows = await SellerSkuIndex.find({
    $or: [{ baseSku: { $in: skus } }, { sku: { $in: skus } }],
    currency: { $in: [...new Set(candidates.flatMap((row) => currencyAliases(row.currency)))] }
  }).lean();
  stockCheckLog('enrichCandidates:skuIndexLookupComplete', {
    skuIndexRowCount: skuIndexRows.length,
    elapsedMs: getElapsedMs(skuIndexStartedAt)
  });

  const sellerNameStartedAt = Date.now();
  const sellerNameMap = await getSellerNameMap([...new Set(skuIndexRows.map((row) => row.seller).filter(Boolean))]);
  stockCheckLog('enrichCandidates:sellerLookupComplete', {
    sellerCount: sellerNameMap.size,
    elapsedMs: getElapsedMs(sellerNameStartedAt)
  });

  const sellerItemsByKey = new Map();
  const allSellerItems = [];
  for (const row of skuIndexRows) {
    const sku = cleanSku(row.sku);
    const currency = normalizeCurrency(row.currency);
    const key = `${currency}:${cleanSku(row.baseSku) || sku}`;
    const arr = sellerItemsByKey.get(key) || [];
    const sellerItem = {
      sellerId: row.seller,
      sellerName: sellerNameMap.get(String(row.seller)) || String(row.seller),
      itemId: row.itemId,
      title: row.title || '',
      price: row.price ?? null,
      currency,
      quantityZeroStatus: 'not_needed',
      quantityZeroError: ''
    };
    arr.push(sellerItem);
    allSellerItems.push(sellerItem);
    sellerItemsByKey.set(key, arr);
  }

  const orderSummaryMap = await buildOrderSummaryMapForSellerItems(allSellerItems);

  const enriched = [];
  for (const row of candidates) {
    const baseSku = getBaseLabel(row.baseSku);
    const directAsin = isAmazonAsin(row.baseSku) ? cleanAsin(row.baseSku) : (isAmazonAsin(row.sku) ? cleanAsin(row.sku) : '');
    const asin = directAsin || (baseSku ? (asinByLabel.get(baseSku.toUpperCase()) || '') : '');
    const sellerItems = attachOrderSummariesFromMap(sellerItemsByKey.get(`${row.currency}:${row.sku}`) || [], orderSummaryMap);
    enriched.push({ ...row, asin, sellerItems });
  }
  stockCheckLog('enrichCandidates:complete', {
    enrichedCount: enriched.length,
    asinFoundCount: enriched.filter((row) => row.asin).length,
    sellerItemCount: allSellerItems.length,
    elapsedMs: getElapsedMs(startedAt)
  });
  return enriched;
}

async function processStockItem({ itemDoc, run, runId }) {
  const row = itemDoc;
  const claim = await AmazonStockCheckItem.updateOne(
    { _id: row._id, status: 'queued' },
    { $set: { status: 'processing' } }
  );
  if (claim.modifiedCount !== 1) return;

  // Tracked outside the try block so the catch handler can still record it
  // if the retry itself ends up failing too.
  let errorRetryAttempted = false;

  try {
    const previous = await AmazonStockSkuState.findOne({
      sku: row.sku,
      asin: row.asin,
      currency: row.currency
    }).lean();

    let scraper;
    try {
      scraper = await fetchScrapingdogProduct({ asin: row.asin, currency: row.currency, includePostalCode: false });
    } catch (fetchError) {
      const classified = classifyStockCheckError(fetchError);
      if (!classified.retryable) throw fetchError;

      // Transient Scrapingdog/Amazon failure (timeout, 429, 5xx) — retry once
      // after a short delay. If this also throws, it propagates to the outer
      // catch below exactly as an unretried failure would have.
      errorRetryAttempted = true;
      await sleep(ERROR_RETRY_DELAY_MS);
      scraper = await fetchScrapingdogProduct({ asin: row.asin, currency: row.currency, includePostalCode: false });
    }

    let parsed = parseStockStatus(scraper.data, run.threshold);
    let creditMultiplier = errorRetryAttempted ? 2 : 1;

    // Ambiguous case: no stock/availability text, but a returns policy is
    // present, meaning there's likely a live offer that just didn't fully
    // render. One retry after a short delay usually resolves this — if it
    // doesn't, we accept the extra credit and leave it as unknown_stock_text
    // rather than retry indefinitely or guess a status without evidence.
    if (parsed.status === 'unknown_stock_text' && parsed.hasActiveOfferSignal) {
      await sleep(UNKNOWN_STOCK_RETRY_DELAY_MS);
      try {
        const retryScraper = await fetchScrapingdogProduct({ asin: row.asin, currency: row.currency, includePostalCode: false });
        scraper = retryScraper;
        parsed = parseStockStatus(retryScraper.data, run.threshold);
        creditMultiplier += 1;
      } catch (retryError) {
        stockCheckWarn('processStockItem:retryFailed', {
          sku: row.sku,
          asin: row.asin,
          error: retryError.message
        });
      }
    }

    const becameAvailable = ['low_stock', 'out_of_stock'].includes(previous?.lastStatus)
      && ['in_stock', 'in_stock_unconfirmed'].includes(parsed.status);
    const sellerItems = row.sellerItems;

    await AmazonStockCheckRun.findByIdAndUpdate(runId, {
      $inc: {
        checkedCount: 1,
        creditsUsed: (getConfig(row.currency)?.credits || 0) * creditMultiplier,
        inStockCount: parsed.status === 'in_stock' ? 1 : 0,
        inStockUnconfirmedCount: parsed.status === 'in_stock_unconfirmed' ? 1 : 0,
        lowStockCount: parsed.status === 'low_stock' ? 1 : 0,
        outOfStockCount: parsed.status === 'out_of_stock' ? 1 : 0,
        unknownStockTextCount: parsed.status === 'unknown_stock_text' ? 1 : 0,
        becameAvailableCount: becameAvailable ? 1 : 0
      }
    });

    await AmazonStockCheckItem.findByIdAndUpdate(row._id, {
      status: parsed.status,
      stockQuantity: parsed.stockQuantity,
      availabilityText: parsed.availabilityText,
      scraperStatusCode: scraper.statusCode,
      scraperResponseSummary: {
        title: scraper.data?.title || '',
        availability_status: scraper.data?.availability_status || '',
        stock: scraper.data?.purchase_options?.single_offer?.stock || ''
      },
      ...getItemBrandFields(scraper.data),
      retryAttempted: creditMultiplier > 1,
      previousStatus: previous?.lastStatus || '',
      becameAvailable,
      sellerItems,
      checkedAt: new Date()
    });

    await AmazonStockSkuState.findOneAndUpdate(
      { sku: row.sku, asin: row.asin, currency: row.currency },
      {
        sku: row.sku,
        asin: row.asin,
        currency: row.currency,
        country: row.country,
        lastStatus: parsed.status,
        lastStockQuantity: parsed.stockQuantity,
        lastAvailabilityText: parsed.availabilityText,
        lastRun: runId,
        lastCheckedAt: new Date()
      },
      { upsert: true }
    );
  } catch (error) {
    const classified = classifyStockCheckError(error);
    await AmazonStockCheckItem.findByIdAndUpdate(row._id, {
      status: 'error',
      error: classified.message,
      errorType: classified.errorType,
      errorSource: classified.errorSource,
      retryable: classified.retryable,
      retryAttempted: errorRetryAttempted,
      checkedAt: new Date()
    });
    await AmazonStockCheckRun.findByIdAndUpdate(runId, {
      $inc: { checkedCount: 1, errorCount: 1 }
    });
  }
}

async function processQueuedStockBatches({ run, runId, maxBatches = Infinity, startingBatch = 0 }) {
  let processedBatchCount = startingBatch;
  let queuedCount = await AmazonStockCheckItem.countDocuments({
    run: runId,
    status: 'queued',
    asin: { $exists: true, $ne: '' }
  });

  while (queuedCount > 0 && processedBatchCount - startingBatch < maxBatches) {
    const status = await getRunStatus(runId);
    if (status === 'paused' || status === 'cancelled') break;

    const batchStartedAt = Date.now();
    const queuedItems = await AmazonStockCheckItem.find({
      run: runId,
      status: 'queued',
      asin: { $exists: true, $ne: '' }
    })
      .sort({ sku: 1, _id: 1 })
      .limit(STOCK_PROCESS_BATCH_SIZE)
      .lean();

    if (!queuedItems.length) break;

    await Promise.all(queuedItems.map((itemDoc) => scrapingdogLimit(() => processStockItem({ itemDoc, run, runId }))));
    processedBatchCount += 1;
    queuedCount = await AmazonStockCheckItem.countDocuments({
      run: runId,
      status: 'queued',
      asin: { $exists: true, $ne: '' }
    });

    stockCheckLog('processRun:stockChecksBatchComplete', {
      runId: String(runId),
      batch: processedBatchCount,
      batchSize: queuedItems.length,
      queuedRemaining: queuedCount,
      elapsedMs: getElapsedMs(batchStartedAt)
    });
  }

  return { processedBatchCount, queuedCount };
}

function shuffleInPlace(rows) {
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows;
}

async function initializeRunItems(run) {
  const runId = run._id;
  const existingItemCount = await AmazonStockCheckItem.countDocuments({ run: runId });
  if (existingItemCount > 0 && run.candidateBuildComplete) {
    const completedItemCount = await AmazonStockCheckItem.countDocuments({
      run: runId,
      status: { $nin: ['queued', 'no_asin'] }
    });
    if (run.totalSkus > 0 && existingItemCount < run.totalSkus && completedItemCount === 0) {
      stockCheckWarn('processRun:partialInitializationRebuild', {
        runId: String(runId),
        existingItemCount,
        expectedItemCount: run.totalSkus
      });
      await AmazonStockCheckItem.deleteMany({ run: runId });
    } else {
      stockCheckLog('processRun:itemsAlreadyInitialized', {
        runId: String(runId),
        existingItemCount,
        completedItemCount
      });
      return;
    }
  }

  const currencies = run.currencies.map(normalizeCurrency);
  const candidates = await withMongoRetry('Build SKU candidate list', () => buildCandidates({ currencies, mode: run.mode, sellerId: run.seller || null }));
  // A brand test samples skuLimit SKUs at random, keeping only ones that map
  // to an ASIN (a no-ASIN SKU has no brand to check), so the count asked for
  // is the count actually scraped.
  const sampleLimit = run.mode === 'brand_test' && run.skuLimit > 0 ? run.skuLimit : 0;
  if (sampleLimit) shuffleInPlace(candidates);
  await AmazonStockCheckRun.findByIdAndUpdate(runId, {
    totalSkus: sampleLimit ? Math.min(sampleLimit, candidates.length) : candidates.length,
    candidateBuildComplete: false
  });

  const existingKeys = new Set();
  let sampleSlotsLeft = sampleLimit;
  if (existingItemCount > 0) {
    const existingRows = await AmazonStockCheckItem.find({ run: runId }).select('currency sku asin').lean();
    for (const row of existingRows) existingKeys.add(`${row.currency}:${row.sku}`);
    // Resumed after a restart: the reshuffle picks a different order, so
    // count what was already inserted rather than overshooting the limit.
    if (sampleLimit) sampleSlotsLeft -= existingRows.filter((row) => row.asin).length;
  }

  let preparedCount = existingKeys.size;
  for (let offset = 0; offset < candidates.length; offset += PREPARE_CHUNK_SIZE) {
    if (sampleLimit && sampleSlotsLeft <= 0) break;
    const status = await getRunStatus(runId);
    if (status === 'cancelled' || status === 'paused') return;

    const chunkStartedAt = Date.now();
    const chunk = candidates.slice(offset, offset + PREPARE_CHUNK_SIZE)
      .filter((row) => !existingKeys.has(`${row.currency}:${row.sku}`));
    if (!chunk.length) continue;

    let enriched = await withMongoRetry('Map base SKUs to ASINs', () => enrichCandidates(chunk));
    if (sampleLimit) {
      enriched = enriched.filter((row) => row.asin).slice(0, sampleSlotsLeft);
      sampleSlotsLeft -= enriched.length;
      if (!enriched.length) continue;
    }
    const asinFoundCount = enriched.reduce((count, row) => count + (row.asin ? 1 : 0), 0);
    const noAsinCount = enriched.length - asinFoundCount;
    const creditsEstimated = enriched.reduce((sum, row) => sum + (row.asin ? (getConfig(row.currency)?.credits || 0) : 0), 0);

    const batch = [];
    for (const row of enriched) {
      existingKeys.add(`${row.currency}:${row.sku}`);
      const hasRecentOrder90d = (row.sellerItems || []).some((si) => (si.orderCount90d || 0) > 0);
      batch.push(row.asin
        ? {
            run: runId,
            sku: row.sku,
            asin: row.asin,
            currency: row.currency,
            country: row.country,
            status: 'queued',
            sellerItems: row.sellerItems,
            hasRecentOrder90d
          }
        : {
            run: runId,
            sku: row.sku,
            asin: '',
            currency: row.currency,
            country: row.country,
            status: 'no_asin',
            sellerItems: row.sellerItems,
            hasRecentOrder90d,
            error: 'No ASIN found from TemplateListing._asinReference',
            errorType: 'no_asin_found',
            errorSource: 'template_listing',
            retryable: false,
            checkedAt: new Date()
          });

      if (batch.length >= RUN_ITEM_INSERT_BATCH_SIZE) {
        await flushStockCheckItemBatch(batch);
      }
    }
    await flushStockCheckItemBatch(batch);
    preparedCount += enriched.length;

    await AmazonStockCheckRun.findByIdAndUpdate(runId, {
      $inc: {
        asinFoundCount,
        noAsinCount,
        creditsEstimated
      }
    });

    stockCheckLog('processRun:itemsChunkInitialized', {
      runId: String(runId),
      preparedCount,
      totalSkus: candidates.length,
      chunkSize: enriched.length,
      asinFoundCount,
      noAsinCount,
      elapsedMs: getElapsedMs(chunkStartedAt)
    });

    await processQueuedStockBatches({ run, runId, maxBatches: 1 });
  }

  const [finalItemCount, finalAsinFoundCount, finalNoAsinCount] = await Promise.all([
    AmazonStockCheckItem.countDocuments({ run: runId }),
    AmazonStockCheckItem.countDocuments({ run: runId, asin: { $exists: true, $ne: '' } }),
    AmazonStockCheckItem.countDocuments({ run: runId, status: 'no_asin' })
  ]);
  const finalCreditRows = await AmazonStockCheckItem.aggregate([
    { $match: { run: runId, asin: { $exists: true, $ne: '' } } },
    { $group: { _id: '$currency', count: { $sum: 1 } } }
  ]);
  const finalCreditsEstimated = finalCreditRows.reduce((sum, row) => sum + (row.count * (getConfig(row._id)?.credits || 0)), 0);

  await AmazonStockCheckRun.findByIdAndUpdate(runId, {
    totalSkus: finalItemCount,
    asinFoundCount: finalAsinFoundCount,
    noAsinCount: finalNoAsinCount,
    creditsEstimated: finalCreditsEstimated,
    candidateBuildComplete: true
  });

  stockCheckLog('processRun:itemsInitialized', {
    runId: String(runId),
    totalSkus: finalItemCount,
    preparedCount: finalItemCount,
    insertBatchSize: RUN_ITEM_INSERT_BATCH_SIZE
  });
}

async function processRun(runId) {
  if (activeRuns.has(String(runId))) return;
  activeRuns.add(String(runId));

  try {
    const run = await AmazonStockCheckRun.findById(runId);
    if (!run) return;
    if (run.status === 'cancelled' || run.status === 'paused') return;

    run.status = 'running';
    if (!run.startedAt) run.startedAt = new Date();
    await run.save();

    await initializeRunItems(run);
    let queuedCount = await AmazonStockCheckItem.countDocuments({
      run: runId,
      status: 'queued',
      asin: { $exists: true, $ne: '' }
    });

    stockCheckLog('processRun:stockChecksStart', {
      runId: String(runId),
      queuedCount,
      processBatchSize: STOCK_PROCESS_BATCH_SIZE,
      scrapingdogConcurrent: SCRAPINGDOG_CONCURRENT,
      ebayQuantityConcurrent: EBAY_QUANTITY_CONCURRENT
    });

    const result = await processQueuedStockBatches({ run, runId });
    queuedCount = result.queuedCount;

    stockCheckLog('processRun:stockChecksComplete', {
      runId: String(runId),
      batches: result.processedBatchCount,
      queuedRemaining: queuedCount
    });

    const latestStatus = await getRunStatus(runId);
    if (latestStatus === 'paused' || latestStatus === 'cancelled') return;

    await AmazonStockCheckRun.findByIdAndUpdate(runId, {
      status: 'completed',
      completedAt: new Date()
    });
  } catch (error) {
    const dbHint = isTransientMongoError(error)
      ? 'MongoDB connection timed out while preparing the run. No Scrapingdog credits were used before SKU preparation completed. '
      : '';
    await AmazonStockCheckRun.findByIdAndUpdate(runId, {
      status: 'failed',
      error: `${dbHint}${error.message || 'Run failed'}`,
      completedAt: new Date()
    });
  } finally {
    activeRuns.delete(String(runId));
  }
}

export async function resumeRunningAmazonStockCheckRuns() {
  // Boot-resume only adopts runs THIS server owns, so a restart on one server
  // can never steal a run being processed by the other. Runs with no runnerId
  // are legacy (created before ownership tracking) — only the Render runner
  // adopts those. Explicit Start/Resume clicks (processRun via the routes)
  // still work anywhere and take ownership of the run.
  const ownershipFilter = RUNNER_ID === 'render'
    ? { $or: [{ runnerId: { $in: [null, ''] } }, { runnerId: RUNNER_ID }] }
    : { runnerId: RUNNER_ID };

  const runs = await AmazonStockCheckRun.find({
    status: { $in: ['queued', 'running'] },
    ...ownershipFilter
  }).sort({ createdAt: 1 }).lean();

  stockCheckLog('resume:scan', { runnerId: RUNNER_ID, adoptableRunCount: runs.length });

  for (const run of runs) {
    await AmazonStockCheckItem.updateMany(
      {
        run: run._id,
        status: 'processing',
        asin: { $exists: true, $ne: '' }
      },
      { $set: { status: 'queued' } }
    );

    const queuedItemCount = await AmazonStockCheckItem.countDocuments({
      run: run._id,
      status: 'queued',
      asin: { $exists: true, $ne: '' }
    });
    const totalItemCount = await AmazonStockCheckItem.countDocuments({ run: run._id });

    if (totalItemCount > 0 && queuedItemCount === 0) {
      await AmazonStockCheckRun.findByIdAndUpdate(run._id, {
        status: 'completed',
        completedAt: new Date(),
        error: ''
      });
      continue;
    }

    stockCheckLog('resume:runQueued', {
      runId: String(run._id),
      status: run.status,
      totalItemCount,
      queuedItemCount
    });
    setTimeout(() => processRun(run._id), 0);
  }

  return runs.length;
}

function normalizeItemFilters(filter) {
  return String(filter || 'actionable')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function getItemFilterCondition(filter) {
  if (filter === 'in_stock') return { status: 'in_stock' };
  if (filter === 'in_stock_unconfirmed') return { status: 'in_stock_unconfirmed' };
  if (filter === 'low_stock') return { status: 'low_stock' };
  // $ne true (not a strict false check) so items checked before this field
  // existed — which simply lack it — still fall into the "no orders" bucket
  // instead of vanishing from both counts.
  if (filter === 'low_stock_no_orders') return { status: 'low_stock', hasRecentOrder90d: { $ne: true } };
  if (filter === 'low_stock_with_orders') return { status: 'low_stock', hasRecentOrder90d: true };
  if (filter === 'out_of_stock') return { status: 'out_of_stock' };
  if (filter === 'unknown_stock_text') return { status: 'unknown_stock_text' };
  if (filter === 'errors') return { status: 'error' };
  if (filter === 'no_asin') return { status: 'no_asin' };
  if (filter === 'restocked') return { becameAvailable: true };
  if (filter === 'qty_zero_success') return { 'sellerItems.quantityZeroStatus': 'success' };
  if (filter === 'qty_zero_failed') return { 'sellerItems.quantityZeroStatus': 'failed' };
  if (filter === 'has_orders') return { 'sellerItems.orderCount': { $gt: 0 } };
  if (filter === 'checked') return { status: { $nin: ['queued', 'processing', 'no_asin'] } };
  if (filter === 'actionable') return { status: { $in: ['low_stock', 'out_of_stock', 'unknown_stock_text'] } };
  return null;
}

function buildItemFilterQuery(runId, filter, sellerId) {
  const query = { run: runId };
  const conditions = normalizeItemFilters(filter)
    .filter((value) => value !== 'all')
    .map(getItemFilterCondition)
    .filter(Boolean);
  if (conditions.length === 1) {
    Object.assign(query, conditions[0]);
  } else if (conditions.length > 1) {
    query.$and = conditions;
  }
  if (sellerId && mongoose.Types.ObjectId.isValid(String(sellerId))) {
    query['sellerItems.sellerId'] = new mongoose.Types.ObjectId(String(sellerId));
  }
  return query;
}

async function getItemFilterCounts(runId, sellerId) {
  const [
    all,
    actionable,
    checked,
    inStock,
    inStockUnconfirmed,
    lowStockNoOrders,
    lowStockWithOrders,
    outOfStock,
    unknownStockText,
    errors,
    noAsin,
    restocked,
    qtyZeroSuccess,
    qtyZeroFailed,
    hasOrders
  ] = await Promise.all([
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'all', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'actionable', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'checked', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'in_stock', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'in_stock_unconfirmed', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'low_stock_no_orders', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'low_stock_with_orders', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'out_of_stock', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'unknown_stock_text', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'errors', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'no_asin', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'restocked', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'qty_zero_success', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'qty_zero_failed', sellerId)),
    AmazonStockCheckItem.countDocuments(buildItemFilterQuery(runId, 'has_orders', sellerId))
  ]);

  return {
    all,
    actionable,
    checked,
    in_stock: inStock,
    in_stock_unconfirmed: inStockUnconfirmed,
    low_stock: lowStockNoOrders + lowStockWithOrders,
    low_stock_no_orders: lowStockNoOrders,
    low_stock_with_orders: lowStockWithOrders,
    out_of_stock: outOfStock,
    unknown_stock_text: unknownStockText,
    errors,
    no_asin: noAsin,
    restocked,
    qty_zero_success: qtyZeroSuccess,
    qty_zero_failed: qtyZeroFailed,
    has_orders: hasOrders
  };
}

// GET /amazon-stock-checks/seller-summary?sellerId=...
// Per-currency SKU index summary for one seller: unique SKU count, listing
// count, and extra duplicate count (mirrors the SKU Index Dashboard math).
router.get('/seller-summary', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), async (req, res) => {
  try {
    const sellerId = String(req.query.sellerId || '');
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ error: 'A valid sellerId is required.' });
    }

    const rows = await SellerSkuIndex.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId), sku: { $nin: ['', null] } } },
      {
        $addFields: {
          normalizedCurrency: {
            $let: {
              vars: { cur: { $toUpper: { $ifNull: ['$currency', 'UNKNOWN'] } } },
              in: { $cond: [{ $eq: ['$$cur', 'GB'] }, 'GBP', '$$cur'] }
            }
          }
        }
      },
      {
        $group: {
          _id: { currency: '$normalizedCurrency', sku: '$sku' },
          listingCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.currency',
          uniqueSkuCount: { $sum: 1 },
          listingCount: { $sum: '$listingCount' },
          duplicateSkuCount: { $sum: { $cond: [{ $gt: ['$listingCount', 1] }, 1, 0] } },
          extraCount: { $sum: { $subtract: ['$listingCount', 1] } }
        }
      },
      { $sort: { listingCount: -1 } }
    ]);

    const currencies = rows.map((row) => {
      const config = getConfig(row._id);
      return {
        currency: row._id,
        country: config?.country || row._id,
        supported: Boolean(config),
        credits: config?.credits || 0,
        uniqueSkuCount: row.uniqueSkuCount,
        listingCount: row.listingCount,
        duplicateSkuCount: row.duplicateSkuCount,
        extraCount: row.extraCount
      };
    });

    const totals = currencies.reduce((acc, row) => {
      acc.uniqueSkuCount += row.uniqueSkuCount;
      acc.listingCount += row.listingCount;
      acc.duplicateSkuCount += row.duplicateSkuCount;
      acc.extraCount += row.extraCount;
      return acc;
    }, { uniqueSkuCount: 0, listingCount: 0, duplicateSkuCount: 0, extraCount: 0 });

    res.json({ sellerId, currencies, totals });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load seller SKU summary' });
  }
});

// GET /amazon-stock-checks/items/:itemId/verify
// Verification data for one checked SKU: the Amazon product URL for the
// item's country plus every seller's item IDs for this SKU/currency with
// their orders from the last 30 days.
// ---------------------------------------------------------------------------
// SKU LISTING MANAGER
//
// Type a SKU, get every seller listing carrying it straight out of
// SellerSkuIndex, with the order history for each item id and enough detail to
// end or revise the listing from the same row. Unlike the verify drawer this
// is not tied to a stock check run, so no run has to exist for the SKU.
// ---------------------------------------------------------------------------

// One SKU can be listed by every seller, sometimes several times each; cap the
// response rather than returning an unbounded list.
const SKU_LISTING_LOOKUP_MAX_ROWS = 500;
// Distinct SKU labels resolved from a single ASIN before the index lookup.
const SKU_LISTING_LOOKUP_MAX_ASIN_LABELS = 200;

router.get('/sku-lookup', requireAuth, requirePageAccess(SKU_LOOKUP_PAGES), async (req, res) => {
  try {
    const raw = cleanSku(req.query.query ?? req.query.sku);
    if (!raw) return res.status(400).json({ error: 'query is required' });

    const isAsinQuery = isAmazonAsin(raw);
    const queriedAsin = isAsinQuery ? cleanAsin(raw) : '';

    // Match the SKU as typed, its base label (variant suffix stripped) and the
    // uppercase form of both. All equality matches, so the plain sku / baseSku
    // indexes are used instead of a collection scan.
    const candidateSet = new Set();
    const addCandidate = (value) => {
      const cleaned = cleanSku(value);
      if (!cleaned) return;
      candidateSet.add(cleaned);
      candidateSet.add(cleaned.toUpperCase());
      const base = getBaseLabel(cleaned);
      if (base) {
        candidateSet.add(base);
        candidateSet.add(base.toUpperCase());
      }
    };
    addCandidate(raw);

    // An ASIN is not stored on the index (unless a SKU literally is one), so
    // resolve it to the SKUs listed for it first. Distinct labels are collected
    // with $addToSet rather than capping documents: one ASIN can be listed
    // hundreds of times, and a document cap could drop a distinct SKU — and
    // with it a seller that genuinely carries this ASIN.
    let asinSkuLabels = [];
    if (isAsinQuery) {
      const [grouped] = await TemplateListing.aggregate([
        { $match: { _asinReference: { $in: [...new Set([queriedAsin, queriedAsin.toLowerCase(), raw])] } } },
        {
          $group: {
            _id: null,
            labels: { $addToSet: '$customLabel' },
            baseLabels: { $addToSet: '$baseCustomLabel' }
          }
        }
      ]);
      asinSkuLabels = [...new Set([...(grouped?.labels || []), ...(grouped?.baseLabels || [])])]
        .filter(Boolean)
        .sort();
      asinSkuLabels.slice(0, SKU_LISTING_LOOKUP_MAX_ASIN_LABELS).forEach(addCandidate);
    }

    const baseLabel = getBaseLabel(raw);
    const candidates = [...candidateSet];

    const rows = await SellerSkuIndex.find({
      $or: [{ sku: { $in: candidates } }, { baseSku: { $in: candidates } }]
    })
      .select('seller itemId sku baseSku title price currency imageUrl syncedAt')
      .sort({ syncedAt: -1 })
      .limit(SKU_LISTING_LOOKUP_MAX_ROWS + 1)
      .lean();

    const truncated = rows.length > SKU_LISTING_LOOKUP_MAX_ROWS;
    if (truncated) rows.length = SKU_LISTING_LOOKUP_MAX_ROWS;

    if (!rows.length) {
      return res.json({
        sku: raw,
        baseSku: baseLabel,
        queryType: isAsinQuery ? 'asin' : 'sku',
        queriedAsin,
        totalListings: 0,
        sellerCount: 0,
        matchedSkus: [],
        asins: [],
        // SKUs the ASIN is listed under in TemplateListing — lets the page say
        // "known ASIN, just not in any seller's synced index" instead of
        // "nothing found".
        knownSkusForAsin: asinSkuLabels.slice(0, 50),
        truncated: false,
        totals: { orderCount90d: 0, lifetimeOrderCount: 0 },
        sellers: []
      });
    }

    const itemIds = [...new Set(rows.map((row) => row.itemId).filter(Boolean))];
    const labels = [...new Set(rows.map((row) => getBaseLabel(row.baseSku || row.sku)).filter(Boolean))];

    // Seller names, order/action history and the ASIN each SKU points at are
    // independent lookups — run them together.
    const [sellerNameMap, history, asinByLabel] = await Promise.all([
      getSellerNameMap([...new Set(rows.map((row) => row.seller).filter(Boolean))]),
      loadListingHistory(itemIds),
      loadAsinByBaseLabel(labels)
    ]);

    const asinForRow = (row) => {
      if (isAmazonAsin(row.sku)) return cleanAsin(row.sku);
      return asinByLabel.get(getBaseLabel(row.baseSku || row.sku).toUpperCase()) || queriedAsin || '';
    };

    const sellerItems = rows.map((row) => ({
      sellerId: row.seller,
      sellerName: sellerNameMap.get(String(row.seller)) || String(row.seller),
      itemId: row.itemId,
      sku: cleanSku(row.sku),
      title: row.title || '',
      price: row.price ?? null,
      currency: normalizeCurrency(row.currency),
      imageUrl: row.imageUrl || '',
      syncedAt: row.syncedAt,
      asin: asinForRow(row)
    }));

    const enriched = attachListingHistory(sellerItems, history);
    // attachListingHistory returns a fixed row shape, so carry the ASIN across
    // from the source row it was resolved on.
    enriched.forEach((row, index) => { row.asin = sellerItems[index].asin; });

    // Exact-SKU rows first, then variants, then by item id so the same search
    // always reads in the same order.
    const bySeller = new Map();
    for (const row of enriched) {
      const sellerId = String(row.sellerId);
      if (!bySeller.has(sellerId)) {
        bySeller.set(sellerId, {
          sellerId,
          sellerName: row.sellerName,
          listingCount: 0,
          orderCount90d: 0,
          lifetimeOrderCount: 0,
          lastSyncedAt: null,
          listings: []
        });
      }
      const group = bySeller.get(sellerId);
      group.listingCount += 1;
      group.orderCount90d += row.orderCount90d || 0;
      group.lifetimeOrderCount += row.lifetimeOrderCount || 0;
      if (!group.lastSyncedAt || row.syncedAt > group.lastSyncedAt) group.lastSyncedAt = row.syncedAt;
      group.listings.push(row);
    }
    for (const group of bySeller.values()) {
      group.listings.sort((a, b) => (
        (a.sku === raw ? 0 : 1) - (b.sku === raw ? 0 : 1)
        || String(a.sku).localeCompare(String(b.sku))
        || String(a.itemId).localeCompare(String(b.itemId))
      ));
    }

    const sellers = [...bySeller.values()].sort((a, b) =>
      a.sellerName.localeCompare(b.sellerName, undefined, { sensitivity: 'base' })
    );

    res.json({
      sku: raw,
      baseSku: baseLabel,
      queryType: isAsinQuery ? 'asin' : 'sku',
      queriedAsin,
      knownSkusForAsin: asinSkuLabels.slice(0, 50),
      totalListings: enriched.length,
      sellerCount: sellers.length,
      matchedSkus: [...new Set(enriched.map((row) => row.sku).filter(Boolean))].sort(),
      asins: [...new Set(enriched.map((row) => row.asin).filter(Boolean))].sort(),
      truncated,
      totals: {
        orderCount90d: enriched.reduce((sum, row) => sum + (row.orderCount90d || 0), 0),
        lifetimeOrderCount: enriched.reduce((sum, row) => sum + (row.lifetimeOrderCount || 0), 0)
      },
      sellers
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to look up SKU listings' });
  }
});

router.get('/items/:itemId/verify', requireAuth, requirePageAccess(EXCLUDED_BRANDS_PAGES), async (req, res) => {
  try {
    const item = await AmazonStockCheckItem.findById(req.params.itemId).lean();
    if (!item) return res.status(404).json({ error: 'Item result not found' });

    const run = await AmazonStockCheckRun.findById(item.run).select('seller').lean();
    const runSellerId = run?.seller ? String(run.seller) : null;
    const config = getConfig(item.currency);
    const amazonUrl = item.asin && config ? `https://www.amazon.${config.domain}/dp/${item.asin}` : '';

    // Gather item IDs live from the SKU index by BASE SKU (same currency), so
    // variant listings like GRW25X and GRW25X-1 are reviewed together and the
    // list reflects the current index rather than the run-time snapshot.
    const exactSku = cleanSku(item.sku);
    const baseLabel = getBaseLabel(item.sku);
    const baseCandidates = [...new Set([exactSku, baseLabel].filter(Boolean))];
    const currencyMatches = currencyAliases(item.currency);
    const indexRows = baseCandidates.length
      ? await SellerSkuIndex.find({
          currency: { $in: currencyMatches },
          $or: [{ baseSku: { $in: baseCandidates } }, { sku: exactSku }]
        }).lean()
      : [];

    let sellerItems;
    if (indexRows.length) {
      sellerItems = indexRows.map((row) => ({
        sellerId: row.seller,
        sellerName: String(row.seller), // replaced with the username below
        itemId: row.itemId,
        sku: cleanSku(row.sku),
        title: row.title || '',
        price: row.price ?? null,
        currency: normalizeCurrency(row.currency),
        quantityZeroStatus: 'not_needed'
      }));
    } else {
      // Index has no rows for this base SKU any more (e.g. everything was
      // ended and re-synced) — fall back to the snapshot stored on the run.
      sellerItems = (item.sellerItems || []).map((row) => ({ ...row, sku: item.sku }));
    }

    // Snapshot listings the index no longer has — usually ones already ended,
    // which drop out of the index on the next sync. Kept below when they have
    // an end log, so a seller whose only listing was ended sees it marked
    // ended instead of "no item IDs".
    const liveItemIds = new Set(sellerItems.map((row) => row.itemId));
    const goneSnapshotRows = indexRows.length
      ? (item.sellerItems || [])
          .filter((row) => row.itemId && !liveItemIds.has(row.itemId))
          .map((row) => ({ ...row, sku: item.sku }))
      : [];

    const itemIds = [...new Set([...sellerItems, ...goneSnapshotRows].map((row) => row.itemId).filter(Boolean))];

    // Seller names and per-listing history (orders, prior end/revise actions)
    // are independent lookups — run them in parallel.
    const [sellerNameMap, history] = await Promise.all([
      indexRows.length
        ? getSellerNameMap([...new Set([...indexRows.map((row) => row.seller), ...goneSnapshotRows.map((row) => row.sellerId)].filter(Boolean))])
        : Promise.resolve(new Map()),
      loadListingHistory(itemIds)
    ]);
    sellerItems.push(...goneSnapshotRows.filter((row) => history.endedByKey.has(`${String(row.sellerId)}:${row.itemId}`)));

    if (sellerNameMap.size) {
      for (const row of sellerItems) {
        row.sellerName = sellerNameMap.get(String(row.sellerId)) || row.sellerName;
      }
    }
    // Exact-SKU rows first, then variants, then by seller name for stable reading order.
    sellerItems.sort((a, b) => (
      (a.sku === item.sku ? 0 : 1) - (b.sku === item.sku ? 0 : 1)
      || String(a.sku).localeCompare(String(b.sku))
      || String(a.sellerName).localeCompare(String(b.sellerName))
    ));

    const enrichedSellerItems = attachListingHistory(sellerItems, history, {
      fallbackSku: item.sku,
      fallbackCurrency: item.currency,
      runSellerId
    });

    res.json({
      sku: item.sku,
      asin: item.asin,
      currency: item.currency,
      country: item.country,
      status: item.status,
      stockQuantity: item.stockQuantity,
      availabilityText: item.availabilityText,
      amazonUrl,
      runSellerId,
      // Live recompute (not the stored snapshot) so it reflects orders placed
      // since the run last checked this SKU — true if ANY seller listing has
      // sold in the last 90 days, used client-side to withhold auto-select.
      hasRecentOrder90d: enrichedSellerItems.some((row) => (row.orderCount90d || 0) > 0),
      sellerItems: enrichedSellerItems
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load verification data' });
  }
});

// POST /amazon-stock-checks/live-images
// Fetches current listing images straight from eBay (Trading GetItem) for the
// verify panel. Any connected seller's token can read public items; the panel
// passes its selected seller. Fetched lazily by the client so verify stays fast.
const liveImageLimit = pLimit(6);
router.post('/live-images', requireAuth, requirePageAccess(EXCLUDED_BRANDS_PAGES), async (req, res) => {
  try {
    const sellerId = String(req.body?.sellerId || '');
    const itemIds = [...new Set((req.body?.itemIds || []).map((id) => String(id).trim()).filter(Boolean))].slice(0, 24);
    if (!mongoose.Types.ObjectId.isValid(sellerId) || !itemIds.length) {
      return res.status(400).json({ error: 'sellerId and itemIds are required.' });
    }

    const seller = await Seller.findById(sellerId);
    if (!seller) return res.status(404).json({ error: 'Seller not found.' });
    const token = await ensureValidToken(seller);

    const entries = await Promise.all(itemIds.map((itemId) => liveImageLimit(async () => {
      try {
        const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ItemID>${itemId}</ItemID>
  <OutputSelector>Item.ItemID</OutputSelector>
  <OutputSelector>Item.PictureDetails</OutputSelector>
</GetItemRequest>`;
        const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
          headers: {
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
            'X-EBAY-API-CALL-NAME': 'GetItem',
            'Content-Type': 'text/xml'
          },
          timeout: 20000
        });
        const parsed = await parseStringPromise(response.data, { explicitArray: false });
        const pictureUrl = parsed?.GetItemResponse?.Item?.PictureDetails?.PictureURL;
        const url = Array.isArray(pictureUrl) ? pictureUrl[0] : pictureUrl;
        return url ? [itemId, url] : null;
      } catch {
        return null; // ended/unavailable items simply have no image
      }
    })));

    res.json({ images: Object.fromEntries(entries.filter(Boolean)) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load listing images' });
  }
});

router.get('/estimate', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), requireFeatureAccess(AMAZON_STOCK_CHECK_RUN_FEATURE_ID), async (req, res) => {
  const requestStartedAt = Date.now();
  try {
    const sellerId = mongoose.Types.ObjectId.isValid(String(req.query.sellerId || '')) ? String(req.query.sellerId) : null;
    const mode = sellerId
      ? 'seller'
      : (req.query.mode === 'pilot_option_b' ? 'pilot_option_b' : (req.query.mode === 'full' ? 'full' : 'custom'));
    const currencies = mode === 'pilot_option_b'
      ? Object.keys(PILOT_OPTION_B_LIMITS)
      : (mode === 'full'
        ? Object.keys(COUNTRY_CONFIG)
        : String(req.query.currencies || 'USD').split(',').map(normalizeCurrency).filter((cur) => getConfig(cur)));
    stockCheckLog('estimate:start', {
      mode,
      currencies,
      sellerId,
      limit: req.query.limit || null,
      userId: req.user?.userId || null
    });
    const candidates = await buildCandidates({ currencies, mode, limit: req.query.limit, sellerId });
    const enriched = await enrichCandidates(candidates, { includeSellerItems: false });
    const withAsin = enriched.filter((row) => row.asin);
    stockCheckLog('estimate:complete', {
      mode,
      currencies,
      totalSkus: enriched.length,
      asinFoundCount: withAsin.length,
      noAsinCount: enriched.length - withAsin.length,
      creditsEstimated: estimateCredits(withAsin),
      elapsedMs: getElapsedMs(requestStartedAt)
    });

    res.json({
      mode,
      currencies,
      totalSkus: enriched.length,
      asinFoundCount: withAsin.length,
      noAsinCount: enriched.length - withAsin.length,
      creditsEstimated: estimateCredits(withAsin),
      plan: currencies.map((currency) => ({
        ...getConfig(currency),
        skuCount: enriched.filter((row) => row.currency === currency).length,
        asinFoundCount: withAsin.filter((row) => row.currency === currency).length
      }))
    });
  } catch (error) {
    stockCheckWarn('estimate:failed', {
      elapsedMs: getElapsedMs(requestStartedAt),
      errorName: error?.name || '',
      errorMessage: error?.message || 'Failed to estimate stock check',
      errorCode: error?.code || '',
      isTransientMongoError: isTransientMongoError(error)
    });
    res.status(500).json({ error: error.message || 'Failed to estimate stock check' });
  }
});

router.post('/runs', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), requireFeatureAccess(AMAZON_STOCK_CHECK_RUN_FEATURE_ID), async (req, res) => {
  try {
    const sellerId = mongoose.Types.ObjectId.isValid(String(req.body?.sellerId || '')) ? String(req.body.sellerId) : null;
    const mode = sellerId
      ? 'seller'
      : (req.body?.mode === 'pilot_option_b' ? 'pilot_option_b' : (req.body?.mode === 'full' ? 'full' : 'custom'));
    const currencies = mode === 'pilot_option_b'
      ? Object.keys(PILOT_OPTION_B_LIMITS)
      : (req.body?.currencies || ['USD']).map(normalizeCurrency).filter((cur) => getConfig(cur));

    if (!currencies.length) {
      return res.status(400).json({ error: 'Select at least one supported currency.' });
    }

    if (sellerId) {
      const sellerExists = await Seller.exists({ _id: sellerId });
      if (!sellerExists) return res.status(404).json({ error: 'Seller not found.' });
    }

    const run = await AmazonStockCheckRun.create({
      countries: currencies.map((currency) => getConfig(currency).country),
      currencies,
      status: 'queued',
      mode,
      seller: sellerId,
      threshold: Number.parseInt(req.body?.threshold, 10) || 5,
      requestedBy: req.user?.userId || null,
      runnerId: RUNNER_ID
    });

    setTimeout(() => processRun(run._id), 0);
    res.status(201).json({ run });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to start stock check run' });
  }
});

// POST /amazon-stock-checks/runs/brand-test  { currency, skuCount }
// A small stock check run on a random sample of one country's SKUs, started
// from the Excluded Brands page to try the brand check before a full run. It
// is an ordinary run (same scrape, same results, listed with the others) —
// only the SKU selection differs. Like every run, it never changes eBay.
const BRAND_TEST_MAX_SKUS = 2000;
router.post('/runs/brand-test', requireAuth, requirePageAccess(EXCLUDED_BRANDS_PAGES), requireFeatureAccess(AMAZON_STOCK_CHECK_RUN_FEATURE_ID), asyncHandler(async (req, res) => {
  const currency = normalizeCurrency(req.body?.currency);
  const config = getConfig(currency);
  if (!config) return res.status(400).json({ error: 'Select a supported country.' });

  const skuLimit = Number.parseInt(req.body?.skuCount, 10);
  if (!Number.isFinite(skuLimit) || skuLimit < 1 || skuLimit > BRAND_TEST_MAX_SKUS) {
    return res.status(400).json({ error: `Number of SKUs must be between 1 and ${BRAND_TEST_MAX_SKUS}.` });
  }

  const run = await AmazonStockCheckRun.create({
    countries: [config.country],
    currencies: [config.currency],
    status: 'queued',
    mode: 'brand_test',
    skuLimit,
    requestedBy: req.user?.userId || null,
    runnerId: RUNNER_ID
  });

  setTimeout(() => processRun(run._id), 0);
  res.status(201).json({ run });
}));

router.post('/runs/:runId/pause', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), requireFeatureAccess(AMAZON_STOCK_CHECK_RUN_FEATURE_ID), asyncHandler(async (req, res) => {
  const run = await AmazonStockCheckRun.findById(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!['queued', 'running'].includes(run.status)) {
    return res.status(400).json({ error: `Run cannot be paused from status ${run.status}` });
  }

  run.status = 'paused';
  await run.save();
  await AmazonStockCheckItem.updateMany(
    { run: run._id, status: 'processing' },
    { $set: { status: 'queued' } }
  );
  res.json({ run, message: 'Run paused.' });
}));

router.post('/runs/:runId/resume', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), requireFeatureAccess(AMAZON_STOCK_CHECK_RUN_FEATURE_ID), asyncHandler(async (req, res) => {
  const run = await AmazonStockCheckRun.findById(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.status !== 'paused') {
    return res.status(400).json({ error: `Run cannot be resumed from status ${run.status}` });
  }

  run.status = 'queued';
  run.completedAt = null;
  run.error = '';
  // Explicit resume transfers ownership: whichever server handles this click
  // becomes the run's processor (and the only one that auto-resumes it on boot).
  run.runnerId = RUNNER_ID;
  await run.save();
  await AmazonStockCheckItem.updateMany(
    { run: run._id, status: 'processing' },
    { $set: { status: 'queued' } }
  );
  setTimeout(() => processRun(run._id), 0);
  res.json({ run, message: 'Run resumed.' });
}));

router.post('/runs/:runId/cancel', requireAuth, requirePageAccess(EXCLUDED_BRANDS_PAGES), requireFeatureAccess(AMAZON_STOCK_CHECK_RUN_FEATURE_ID), asyncHandler(async (req, res) => {
  const run = await AmazonStockCheckRun.findById(req.params.runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (['completed', 'failed', 'cancelled'].includes(run.status)) {
    return res.status(400).json({ error: `Run cannot be cancelled from status ${run.status}` });
  }

  run.status = 'cancelled';
  run.completedAt = new Date();
  await run.save();
  await AmazonStockCheckItem.updateMany(
    { run: run._id, status: 'processing' },
    { $set: { status: 'queued' } }
  );
  res.json({ run, message: 'Run cancelled.' });
}));

router.get('/runs', requireAuth, requirePageAccess(EXCLUDED_BRANDS_PAGES), asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(5, Number.parseInt(req.query.limit || '20', 10)));
  const skip = (page - 1) * limit;
  const runQuery = {};
  if (mongoose.Types.ObjectId.isValid(String(req.query.sellerId || ''))) {
    runQuery.seller = String(req.query.sellerId);
  }
  const [runs, total] = await Promise.all([
    AmazonStockCheckRun.find(runQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('requestedBy', 'username name email')
      .lean(),
    AmazonStockCheckRun.countDocuments(runQuery)
  ]);
  res.json({
    runs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
}));

router.get('/runs/:runId', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), asyncHandler(async (req, res) => {
  const run = await AmazonStockCheckRun.findById(req.params.runId).populate('requestedBy', 'username name email').lean();
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const itemCounts = await getItemFilterCounts(req.params.runId, req.query.sellerId);
  res.json({ run, itemCounts });
}));

router.get('/runs/:runId/items', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), asyncHandler(async (req, res) => {
  const filter = String(req.query.filter || 'actionable').trim();
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
  const limit = Math.min(500, Math.max(25, Number.parseInt(req.query.limit || '100', 10)));
  const query = buildItemFilterQuery(req.params.runId, filter, req.query.sellerId);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    AmazonStockCheckItem.find(query)
      // Raw scraper payload fields are never rendered by the UI; excluding
      // them keeps the list response small (they can be large per row).
      .select('-scraperResponseSummary -previousStatus -scraperStatusCode')
      // _id last: (status, sku) repeats (one SKU in two currencies), and the
      // resume point reads this list in exactly the reverse order.
      .sort({ status: 1, sku: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AmazonStockCheckItem.countDocuments(query)
  ]);

  res.json({
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
}));

// The eBay listings carrying each item's SKU, read live from the SKU index by
// base SKU (same currency) — the same lookup the verify panel does per item,
// batched for a page of items. Variants (GRW25X-1 under GRW25X) are included.
// Falls back to the snapshot stored on the run when the index no longer has
// any row for the SKU. Returns Map<item _id string, sellerItems[]>.
// withNames: false skips the seller-name lookup (sellerName is the id).
async function loadLiveSellerItems(items, { withNames = true } = {}) {
  const lookups = items.map((item) => {
    const exactSku = cleanSku(item.sku);
    return {
      item,
      exactSku,
      candidates: [...new Set([exactSku, getBaseLabel(item.sku)].filter(Boolean))],
      currencies: currencyAliases(item.currency)
    };
  });
  const allCandidates = [...new Set(lookups.flatMap((lookup) => lookup.candidates))];
  const allExact = [...new Set(lookups.map((lookup) => lookup.exactSku).filter(Boolean))];
  const allCurrencies = [...new Set(lookups.flatMap((lookup) => lookup.currencies))];

  const indexRows = allCandidates.length
    ? await SellerSkuIndex.find({
        currency: { $in: allCurrencies },
        $or: [{ baseSku: { $in: allCandidates } }, { sku: { $in: allExact } }]
      }).lean()
    : [];
  const sellerNameMap = indexRows.length && withNames
    ? await getSellerNameMap([...new Set(indexRows.map((row) => row.seller).filter(Boolean))])
    : new Map();

  const result = new Map();
  for (const { item, exactSku, candidates, currencies } of lookups) {
    const matches = indexRows.filter((row) => currencies.includes(row.currency)
      && (candidates.includes(row.baseSku) || row.sku === exactSku));
    const sellerItems = matches.length
      ? matches.map((row) => ({
          sellerId: row.seller,
          sellerName: sellerNameMap.get(String(row.seller)) || String(row.seller),
          itemId: row.itemId,
          sku: cleanSku(row.sku),
          title: row.title || '',
          price: row.price ?? null,
          currency: normalizeCurrency(row.currency),
          quantityZeroStatus: 'not_needed'
        }))
      : (item.sellerItems || []).map((row) => ({ ...row, sku: item.sku }));
    // Exact-SKU rows first, then variants, then by seller — as the verify panel.
    sellerItems.sort((a, b) => (
      (a.sku === item.sku ? 0 : 1) - (b.sku === item.sku ? 0 : 1)
      || String(a.sku).localeCompare(String(b.sku))
      || String(a.sellerName).localeCompare(String(b.sellerName))
    ));
    result.set(String(item._id), sellerItems);
  }
  return result;
}

// Status buckets the Excluded Brands page counts and filters by. Anything else
// (error, no_asin, queued) never has a brand recorded, so never matches.
const EXCLUDED_BRAND_STATUSES = ['in_stock', 'in_stock_unconfirmed', 'low_stock', 'out_of_stock', 'unknown_stock_text'];

// The brand match is an unindexable regex scan of a whole run (the $or over
// amazonBrandKey/amazonSoldByKey), plus the amazonBrand $exists count — and the
// page polls every ~15s on ~160k-item runs. Cache the heavy, filter-independent
// block per (run, seller, block-list signature) so repeat polls in a window
// share one scan. Stale by at most BRANDS_CACHE_TTL_MS, which is fine for this
// read-only analytics view; the run metadata and the notAmazon page rows are
// still read live outside the cache. The block-list signature is part of the
// key, so editing the Excluded Brands list busts it immediately.
const BRANDS_CACHE_TTL_MS = 30_000;
const BRANDS_CACHE_MAX_ENTRIES = 200;
const excludedBrandsHeavyCache = new Map();

function getCachedBrandsHeavy(key) {
  const entry = excludedBrandsHeavyCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > BRANDS_CACHE_TTL_MS) {
    excludedBrandsHeavyCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedBrandsHeavy(key, value) {
  const now = Date.now();
  for (const [k, entry] of excludedBrandsHeavyCache) {
    if (now - entry.at > BRANDS_CACHE_TTL_MS) excludedBrandsHeavyCache.delete(k);
  }
  // Map preserves insertion order, so the first key is the oldest.
  while (excludedBrandsHeavyCache.size >= BRANDS_CACHE_MAX_ENTRIES) {
    excludedBrandsHeavyCache.delete(excludedBrandsHeavyCache.keys().next().value);
  }
  excludedBrandsHeavyCache.set(key, { at: now, value });
}

// The expensive, filter-independent part of the Excluded Brands response: the
// run-wide counts and the brand-match scan + its derived breakdown. Depends
// only on (run, seller, block list), so it is what the cache above stores.
async function computeExcludedBrandsHeavy({ scopeQuery, notAmazonQuery, pattern, blockList }) {
  // Items that have each field at all — zero on runs from before it was
  // recorded, which the page explains rather than showing an empty table.
  // The shipper counts are written to be answered from the
  // { run, amazonShippedByAmazon, amazonShipsFrom, sku } index alone (hence
  // $in rather than $exists) — runs are ~160k items and this is polled.
  const [scannedCount, shipperScannedCount, notAmazonCount, shipperUnknownCount] = await Promise.all([
    AmazonStockCheckItem.countDocuments({ ...scopeQuery, amazonBrand: { $exists: true } }),
    AmazonStockCheckItem.countDocuments({ ...scopeQuery, amazonShippedByAmazon: { $in: [true, false] } }),
    AmazonStockCheckItem.countDocuments(notAmazonQuery),
    AmazonStockCheckItem.countDocuments({ ...notAmazonQuery, amazonShipsFrom: '' })
  ]);

  // The database narrows the run to items with any hit; findBlockedBrand then
  // says which entry and field, exactly as the precheck reports it.
  const candidates = pattern
    ? await AmazonStockCheckItem.find({
        ...scopeQuery,
        $or: [{ amazonBrandKey: pattern }, { amazonSoldByKey: pattern }]
      })
        .select('sku status amazonBrand amazonSoldBy')
        .lean()
    : [];

  const keyByDisplay = new Map(blockList.map((entry) => [entry.display, entry.key]));
  const matched = [];
  for (const item of candidates) {
    const hit = findBlockedBrand({ brand: item.amazonBrand, soldBy: item.amazonSoldBy }, blockList);
    if (!hit) continue;
    matched.push({ ...item, matchedBrand: hit.display, matchedBrandKey: keyByDisplay.get(hit.display) || '', matchedOn: hit.field });
  }

  const counts = { all: matched.length, brand: 0, soldBy: 0 };
  for (const status of EXCLUDED_BRAND_STATUSES) counts[status] = 0;
  const brandMap = new Map();
  for (const item of matched) {
    counts[item.matchedOn] += 1;
    if (item.status in counts) counts[item.status] += 1;
    const entry = brandMap.get(item.matchedBrandKey) || { key: item.matchedBrandKey, display: item.matchedBrand, count: 0 };
    entry.count += 1;
    brandMap.set(item.matchedBrandKey, entry);
  }
  const brands = [...brandMap.values()].sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));

  const notAmazonCounts = {
    all: notAmazonCount,
    thirdParty: notAmazonCount - shipperUnknownCount,
    unknown: shipperUnknownCount
  };

  return { scannedCount, shipperScannedCount, matched, counts, brands, notAmazonCounts };
}

// GET /amazon-stock-checks/runs/:runId/excluded-brands
// Two views of one run, both read-only (the run itself never looks at brands
// or shippers):
//
// view=brands (default) — SKUs whose Amazon brand or buy-box seller is on the
// Excluded Brands list (the ASIN precheck's list, same whole-word rule, brand
// checked before seller). Matched against the list as it is now, so a brand
// added after the run still shows up.
//
// view=notAmazon — SKUs whose buy-box "Ships from" is not Amazon, the ASIN
// precheck's "Not shipped by Amazon" rule (a blank Ships From counts too).
// Fixed when the SKU was checked, like the stock status.
//
// Query: view, status (one of EXCLUDED_BRAND_STATUSES or 'all'), brand (a list
// entry's normalised key) and matchedOn ('brand' | 'soldBy') for the brands
// view, shipper ('thirdParty' | 'unknown') for the notAmazon view, sellerId,
// page, limit. Counts and the per-brand breakdown honour sellerId only, like
// the stock check page's cards, so they don't change as filters are clicked.
// Every row carries both flags whichever view it was listed in.
// ---------------------------------------------------------------------------
// RESUME POINTS
//
// Where to pick up in one seller's verify list: the furthest row (in list
// order) whose listing was ended from that page — by anyone, under any run —
// so a big list can be worked through over several days and by several
// people. Derived from EndListingLog rather than stored, so there is nothing
// to keep in sync. Ended rows stay in the lists, so row numbers hold between
// visits.
//
// Only ends logged with the page's own source count (amazon_stock_check for
// the stock check pages, excluded_brand for Excluded Brands), so a Keyword End
// Listing or VeRO cleanup late in the list doesn't move the resume point past
// rows nobody has checked. Any run counts: listings ended just before a run
// started, while the index still had them, are still in its lists.
//
// A row's listings are the run snapshot's plus whatever the SKU index carries
// for its base SKU now (what the verify panel shows), for the selected seller.
// Item ids are unique per listing.
//
// Alongside it: how many rows still have a live listing (one the page lists
// with no end log from any source — the table's Live Listings count) and which
// is first, so rows skipped on the way past the resume point aren't lost.
//
// Seller-scoped only: without a seller, lists are a whole run (~160k rows).
// ---------------------------------------------------------------------------

// Rows are read from the end of the list backwards, this many at a time.
const RESUME_SCAN_BATCH = 500;
// The live-row count needs every row checked, so it is only worked out for
// lists up to this size; past it, the scan stops at the resume point.
const RESUME_LIVE_COUNT_MAX_ROWS = 5000;
// Wall-clock cap on one scan; past it the answer is whatever was found so far
// (no live count, since that needs the whole list).
const RESUME_SCAN_MAX_MS = 8000;

const toListRow = (item, position) => ({ itemId: String(item._id), sku: item.sku, position });

const toResumePoint = (item, position, log) => ({
  ...toListRow(item, position),
  endedAt: log?.endedAt || null,
  endedBy: log?.endedBy?.username || log?.endedBy?.name || log?.endedBy?.email || null
});

// For each row of a batch: its latest end log from `source` (any of its
// listings, snapshot or live) and whether a live listing with no end log from
// any source is left.
async function readRowEndStates(rows, sellerId, source) {
  const forSeller = (list) => list.filter((row) => String(row.sellerId) === String(sellerId));
  const live = await loadLiveSellerItems(rows, { withNames: false });
  const liveIdsByRow = rows.map((row) => forSeller(live.get(String(row._id)) || []).map((listing) => listing.itemId).filter(Boolean));
  const allIdsByRow = rows.map((row, index) => [...new Set([
    ...forSeller(row.sellerItems || []).map((listing) => listing.itemId).filter(Boolean),
    ...liveIdsByRow[index]
  ])]);
  const allItemIds = [...new Set(allIdsByRow.flat())];

  const logs = allItemIds.length
    ? await EndListingLog.find({ itemId: { $in: allItemIds } })
        .select('itemId source endedAt endedBy')
        .populate('endedBy', 'username name email')
        .sort({ endedAt: -1 })
        .lean()
    : [];
  const endedItemIds = new Set(logs.map((log) => log.itemId));
  const latestPageEndByItemId = new Map();
  for (const log of logs) {
    if (log.source === source && !latestPageEndByItemId.has(log.itemId)) latestPageEndByItemId.set(log.itemId, log);
  }

  return rows.map((row, index) => {
    const rowLogs = allIdsByRow[index].map((itemId) => latestPageEndByItemId.get(itemId)).filter(Boolean);
    rowLogs.sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
    return {
      log: rowLogs[0] || null,
      hasLive: liveIdsByRow[index].some((itemId) => !endedItemIds.has(itemId))
    };
  });
}

// One query read once, in reverse list order, handed out RESUME_SCAN_BATCH
// rows at a time. The scan usually stops early, and Mongoose's cursor doesn't
// close itself when a for-await loop is left early (it has no return()), so
// it is closed here — otherwise MongoDB holds it open until its idle timeout.
async function* reverseBatches(query, sort) {
  const cursor = AmazonStockCheckItem.find(query)
    .sort(sort)
    .select(RESUME_ROW_FIELDS)
    .lean()
    .cursor({ batchSize: RESUME_SCAN_BATCH });
  try {
    let batch = [];
    for await (const doc of cursor) {
      batch.push(doc);
      if (batch.length === RESUME_SCAN_BATCH) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length) yield batch;
  } finally {
    await cursor.close();
  }
}

// Walks a list (or one segment of one) of `total` rows backwards; batches
// yields rows in reverse list order. positionOffset is the rows listed before
// this segment. Stops at the first ended row unless counting live rows.
async function scanForResume({ total, batches, sellerId, source, positionOffset = 0, state }) {
  let fromEnd = 0;
  for await (const rows of batches) {
    if (Date.now() > state.deadline) {
      state.timedOut = true;
      return;
    }
    const states = await readRowEndStates(rows, sellerId, source);
    for (let index = 0; index < rows.length; index += 1) {
      const position = positionOffset + total - fromEnd - index;
      if (!state.resumePoint && states[index].log) {
        state.resumePoint = toResumePoint(rows[index], position, states[index].log);
        if (!state.countLive) return;
      }
      if (state.countLive && states[index].hasLive) {
        state.liveCount += 1;
        state.firstLive = toListRow(rows[index], position); // walking backwards, so the last one seen is first
      }
    }
    fromEnd += rows.length;
  }
}

const newResumeState = (total) => ({
  resumePoint: null,
  countLive: total <= RESUME_LIVE_COUNT_MAX_ROWS,
  liveCount: 0,
  firstLive: null,
  deadline: Date.now() + RESUME_SCAN_MAX_MS,
  timedOut: false
});

const resumeResponse = (state) => ({
  resumePoint: state.resumePoint,
  live: state.countLive && !state.timedOut ? { count: state.liveCount, first: state.firstLive } : null
});

const NO_RESUME = { resumePoint: null, live: null };

const RESUME_ROW_FIELDS = '_id sku currency sellerItems.sellerId sellerItems.itemId';

// GET /amazon-stock-checks/runs/:runId/resume-point?filter=&sellerId=
// For the Amazon Stock Check list (sorted status, SKU, _id). sellerId is
// required; without it the answer is empty.
router.get('/runs/:runId/resume-point', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), requireObjectId('runId'), asyncHandler(async (req, res) => {
  const runId = new mongoose.Types.ObjectId(req.params.runId);
  const filter = String(req.query.filter || 'actionable').trim();
  if (!mongoose.Types.ObjectId.isValid(String(req.query.sellerId || ''))) return res.json(NO_RESUME);
  const sellerId = new mongoose.Types.ObjectId(String(req.query.sellerId));

  const listQuery = buildItemFilterQuery(runId, filter, sellerId);
  const total = await AmazonStockCheckItem.countDocuments(listQuery);
  const state = newResumeState(total);
  await scanForResume({
    total,
    sellerId,
    source: 'amazon_stock_check',
    state,
    batches: reverseBatches(listQuery, { status: -1, sku: -1, _id: -1 })
  });
  res.json(resumeResponse(state));
}));

// GET /amazon-stock-checks/runs/:runId/excluded-brands/resume-point
// Same params as the Excluded Brands list (view, status, brand, matchedOn,
// shipper, sellerId). sellerId is required; without it the answer is empty.
router.get('/runs/:runId/excluded-brands/resume-point', requireAuth, requirePageAccess(EXCLUDED_BRANDS_PAGES), requireObjectId('runId'), asyncHandler(async (req, res) => {
  const params = readExcludedBrandsParams(req);
  const { runId, view, statusFilter, shipperFilter, sellerId } = params;
  if (!sellerId) return res.json(NO_RESUME);

  const blockList = await loadPrecheckBlockList();
  const { heavy, notAmazonQuery } = await loadExcludedBrandsHeavy({ runId, sellerId, blockList });

  if (view !== 'notAmazon') {
    // The brands view's rows are already ordered in memory; read each batch's
    // listings by id.
    const rows = filterExcludedBrandRows(heavy.matched, params);
    const state = newResumeState(rows.length);
    async function* brandBatches() {
      for (let end = rows.length; end > 0; end -= RESUME_SCAN_BATCH) {
        const ids = rows.slice(Math.max(0, end - RESUME_SCAN_BATCH), end).reverse().map((row) => row._id);
        const docs = await AmazonStockCheckItem.find({ _id: { $in: ids } }).select(RESUME_ROW_FIELDS).lean();
        const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
        yield ids.map((id) => byId.get(String(id))).filter(Boolean);
      }
    }
    await scanForResume({ total: rows.length, sellerId, source: 'excluded_brand', state, batches: brandBatches() });
    return res.json(resumeResponse(state));
  }

  // notAmazon: segments are listed one after another, so walk them last to
  // first; a row's position adds the rows of the segments before its own.
  const segments = await buildNotAmazonSegments({ notAmazonQuery, notAmazonCounts: heavy.notAmazonCounts, statusFilter, shipperFilter });
  const state = newResumeState(segments.reduce((sum, segment) => sum + segment.total, 0));
  for (let segIndex = segments.length - 1; segIndex >= 0; segIndex -= 1) {
    if ((state.resumePoint && !state.countLive) || state.timedOut) break;
    const segment = segments[segIndex];
    await scanForResume({
      total: segment.total,
      sellerId,
      source: 'excluded_brand',
      state,
      positionOffset: segments.slice(0, segIndex).reduce((sum, seg) => sum + seg.total, 0),
      batches: reverseBatches(segment.query, { amazonShipsFrom: -1, sku: -1 })
    });
  }
  res.json(resumeResponse(state));
}));

// The list parameters shared by the Excluded Brands list and its resume point.
function readExcludedBrandsParams(req) {
  return {
    runId: new mongoose.Types.ObjectId(req.params.runId),
    view: req.query.view === 'notAmazon' ? 'notAmazon' : 'brands',
    statusFilter: EXCLUDED_BRAND_STATUSES.includes(req.query.status) ? req.query.status : 'all',
    brandFilter: String(req.query.brand || '').trim(),
    matchedOnFilter: ['brand', 'soldBy'].includes(req.query.matchedOn) ? req.query.matchedOn : '',
    shipperFilter: ['thirdParty', 'unknown'].includes(req.query.shipper) ? req.query.shipper : '',
    sellerId: mongoose.Types.ObjectId.isValid(String(req.query.sellerId || ''))
      ? new mongoose.Types.ObjectId(String(req.query.sellerId))
      : null
  };
}

// Heavy, filter-independent block (run-wide counts + the brand-match scan and
// its breakdown), cached per (run, seller, block-list signature). pattern.source
// encodes every list entry, so editing the Excluded Brands list changes the key
// and busts the cache.
async function loadExcludedBrandsHeavy({ runId, sellerId, blockList }) {
  const scopeQuery = { run: runId };
  if (sellerId) scopeQuery['sellerItems.sellerId'] = sellerId;
  const notAmazonQuery = { ...scopeQuery, amazonShippedByAmazon: false };
  const pattern = buildBlockListPattern(blockList);
  const cacheKey = `${runId}:${sellerId || ''}:${blockList.length}:${pattern ? pattern.source : 'none'}`;
  let heavy = getCachedBrandsHeavy(cacheKey);
  if (!heavy) {
    heavy = await computeExcludedBrandsHeavy({ scopeQuery, notAmazonQuery, pattern, blockList });
    setCachedBrandsHeavy(cacheKey, heavy);
  }
  return { heavy, notAmazonQuery };
}

// The brands view's rows, in list order.
function filterExcludedBrandRows(matched, { statusFilter, brandFilter, matchedOnFilter }) {
  return matched
    .filter((item) => statusFilter === 'all' || item.status === statusFilter)
    .filter((item) => !brandFilter || item.matchedBrandKey === brandFilter)
    .filter((item) => !matchedOnFilter || item.matchedOn === matchedOnFilter)
    .sort((a, b) => a.matchedBrand.localeCompare(b.matchedBrand) || String(a.sku).localeCompare(String(b.sku)));
}

// The notAmazon view is paged in the database, not in memory — a run can have
// tens of thousands of these. Named third-party shippers first (by shipper,
// then SKU, the index order), blanks last: two segments, read in turn.
async function buildNotAmazonSegments({ notAmazonQuery, notAmazonCounts, statusFilter, shipperFilter }) {
  const listQuery = statusFilter === 'all' ? notAmazonQuery : { ...notAmazonQuery, status: statusFilter };
  const segments = [];
  if (shipperFilter !== 'unknown') {
    segments.push({ query: { ...listQuery, amazonShipsFrom: { $ne: '' } }, total: statusFilter === 'all' ? notAmazonCounts.thirdParty : null });
  }
  if (shipperFilter !== 'thirdParty') {
    segments.push({ query: { ...listQuery, amazonShipsFrom: '' }, total: statusFilter === 'all' ? notAmazonCounts.unknown : null });
  }
  await Promise.all(segments.map(async (segment) => {
    if (segment.total === null) segment.total = await AmazonStockCheckItem.countDocuments(segment.query);
  }));
  return segments;
}

router.get('/runs/:runId/excluded-brands', requireAuth, requirePageAccess(EXCLUDED_BRANDS_PAGES), requireObjectId('runId'), asyncHandler(async (req, res) => {
  const params = readExcludedBrandsParams(req);
  const { runId, view, statusFilter, shipperFilter, sellerId } = params;
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10));
  const limit = Math.min(200, Math.max(10, Number.parseInt(req.query.limit || '50', 10)));

  const [run, blockList] = await Promise.all([
    AmazonStockCheckRun.findById(runId).populate('requestedBy', 'username name email').lean(),
    loadPrecheckBlockList()
  ]);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  // The per-request filters, paging and row hydration below run live off the
  // cached heavy block.
  const { heavy, notAmazonQuery } = await loadExcludedBrandsHeavy({ runId, sellerId, blockList });
  const { scannedCount, shipperScannedCount, matched, counts, brands, notAmazonCounts } = heavy;
  const brandMatchById = new Map(matched.map((item) => [String(item._id), item]));

  let total;
  let pageRows;
  if (view === 'notAmazon') {
    const segments = await buildNotAmazonSegments({ notAmazonQuery, notAmazonCounts, statusFilter, shipperFilter });
    total = segments.reduce((sum, segment) => sum + segment.total, 0);

    pageRows = [];
    let skip = (page - 1) * limit;
    for (const segment of segments) {
      const remaining = limit - pageRows.length;
      if (remaining <= 0) break;
      if (skip >= segment.total) {
        skip -= segment.total;
        continue;
      }
      const rows = await AmazonStockCheckItem.find(segment.query)
        .sort({ amazonShipsFrom: 1, sku: 1 })
        .skip(skip)
        .limit(remaining)
        .select('_id')
        .lean();
      pageRows.push(...rows);
      skip = 0;
    }
  } else {
    const filtered = filterExcludedBrandRows(matched, params);
    total = filtered.length;
    pageRows = filtered.slice((page - 1) * limit, page * limit);
  }

  const orderById = new Map(pageRows.map((item, index) => [String(item._id), index]));

  const docs = pageRows.length
    ? await AmazonStockCheckItem.find({ _id: { $in: pageRows.map((item) => item._id) } })
        .select('-scraperResponseSummary -previousStatus -scraperStatusCode -amazonBrandKey -amazonSoldByKey')
        .lean()
    : [];

  // Seller listings, live from the SKU index, with their end/revise badges
  // and order history, scoped to the filtered seller when there is one.
  const liveSellerItems = await loadLiveSellerItems(docs);
  const sellerItemsFor = (doc) => (liveSellerItems.get(String(doc._id)) || [])
    .filter((row) => !sellerId || String(row.sellerId) === String(sellerId));
  const itemIds = [...new Set(docs.flatMap((doc) => sellerItemsFor(doc).map((row) => row.itemId)).filter(Boolean))];
  const history = await loadListingHistory(itemIds);
  const runSellerId = run.seller ? String(run.seller) : null;

  const items = docs
    .map((doc) => {
      const match = brandMatchById.get(String(doc._id));
      return {
        ...doc,
        matchedBrand: match?.matchedBrand || '',
        matchedBrandKey: match?.matchedBrandKey || '',
        matchedOn: match?.matchedOn || '',
        sellerItems: attachListingHistory(sellerItemsFor(doc), history, {
          fallbackSku: doc.sku,
          fallbackCurrency: doc.currency,
          runSellerId
        })
      };
    })
    .sort((a, b) => orderById.get(String(a._id)) - orderById.get(String(b._id)));

  res.json({
    run,
    view,
    blockListSize: blockList.length,
    scannedCount,
    shipperScannedCount,
    counts,
    notAmazonCounts,
    brands,
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit))
    }
  });
}));

router.post('/items/:itemId/set-quantity-zero', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), asyncHandler(async (req, res) => {
  const item = await AmazonStockCheckItem.findById(req.params.itemId).lean();
  if (!item) return res.status(404).json({ error: 'Item result not found' });

  const sellerItem = item.sellerItems.find((row) => String(row.itemId) === String(req.body?.itemId));
  if (!sellerItem) return res.status(404).json({ error: 'Seller item not found on this result' });

  const result = await reviseInventoryQuantity({
    sellerId: sellerItem.sellerId,
    itemId: sellerItem.itemId,
    quantity: 0,
    runId: item.run,
    itemDocId: item._id,
    sku: item.sku,
    asin: item.asin,
    requestedBy: req.user?.userId || null
  });

  await AmazonStockCheckItem.updateOne(
    { _id: item._id, 'sellerItems.itemId': sellerItem.itemId },
    {
      $set: {
        'sellerItems.$.quantityZeroStatus': result.ok ? 'success' : 'failed',
        'sellerItems.$.quantityZeroError': result.error || ''
      }
    }
  );

  res.status(result.ok ? 200 : 500).json({
    ...result,
    message: result.ok
      ? `Quantity set to zero for item ${sellerItem.itemId}`
      : result.error || `Failed to set quantity to zero for item ${sellerItem.itemId}`
  });
}));

router.post('/items/:itemId/set-quantity-one', requireAuth, requirePageAccess(STOCK_CHECK_PAGES), asyncHandler(async (req, res) => {
  const item = await AmazonStockCheckItem.findById(req.params.itemId).lean();
  if (!item) return res.status(404).json({ error: 'Item result not found' });

  const sellerItem = item.sellerItems.find((row) => String(row.itemId) === String(req.body?.itemId));
  if (!sellerItem) return res.status(404).json({ error: 'Seller item not found on this result' });

  const result = await reviseInventoryQuantity({
    sellerId: sellerItem.sellerId,
    itemId: sellerItem.itemId,
    quantity: 1,
    runId: item.run,
    itemDocId: item._id,
    sku: item.sku,
    asin: item.asin,
    requestedBy: req.user?.userId || null
  });

  if (result.ok) {
    await AmazonStockCheckItem.updateOne(
      { _id: item._id, 'sellerItems.itemId': sellerItem.itemId },
      {
        $set: {
          'sellerItems.$.quantityZeroStatus': 'not_needed',
          'sellerItems.$.quantityZeroError': ''
        }
      }
    );
  }

  res.status(result.ok ? 200 : 500).json({
    ...result,
    message: result.ok
      ? `Quantity set to one for item ${sellerItem.itemId}`
      : result.error || `Failed to set quantity to one for item ${sellerItem.itemId}`
  });
}));

// POST /amazon-stock-checks/revise-listing
// Revises title/price for one item ID on eBay. Self-contained (not scoped to
// a specific AmazonStockCheckItem/run) so it works from the verify panel
// regardless of which run or seller the item was found under — same pattern
// as /ebay/end-item.
router.post('/revise-listing', requireAuth, requirePageAccess(LISTING_ACTION_PAGES), async (req, res) => {
  try {
    const { sellerId, itemId, title, price, previousTitle, previousPrice, sku, asin } = req.body || {};
    if (!sellerId || !itemId) {
      return res.status(400).json({ error: 'sellerId and itemId are required.' });
    }

    const newTitle = typeof title === 'string' ? title.trim() : '';
    const newPrice = price !== undefined && price !== null && price !== '' ? Number(price) : null;
    if (!newTitle && newPrice == null) {
      return res.status(400).json({ error: 'Provide a title and/or price to revise.' });
    }
    if (newPrice != null && !Number.isFinite(newPrice)) {
      return res.status(400).json({ error: 'Price must be a number.' });
    }

    const result = await reviseListingDetails({
      sellerId,
      itemId,
      title: newTitle || undefined,
      price: newPrice,
      previousTitle: previousTitle || '',
      previousPrice: previousPrice ?? null,
      sku: sku || '',
      asin: asin || '',
      requestedBy: req.user?.userId || null
    });

    res.status(result.ok ? 200 : 500).json({
      ...result,
      message: result.ok ? `Revised item ${itemId}` : result.error || `Failed to revise item ${itemId}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to revise listing' });
  }
});

// ---------------------------------------------------------------------------
// Revise onto a new ASIN
//
// Repoints a live eBay listing at a different Amazon product: the ItemID never
// changes, but its SKU, title, description, price, pictures and item specifics
// are all replaced with template-generated content for the new ASIN.
//
// In the database this is a NEW listing, not an edit. The row describing the
// old ASIN is left exactly as it is — history — and a fresh templatelistings
// row is inserted for the new ASIN under its own ASIN-derived SKU. Nothing ties
// the two together in that collection (the system is keyed on SKU end to end);
// the link lives in ListingRevision.
// ---------------------------------------------------------------------------

const ASIN_PATTERN = /^B[0-9A-Z]{9}$/;

// Every core column on TemplateListing. The generated listing is copied field
// by field rather than spread wholesale: the payload comes from the browser
// after the user has edited it, and spreading it would let a crafted request
// set status, downloadBatchId, deletedAt or any other bookkeeping field.
const TEMPLATE_LISTING_CORE_FIELDS = [
  'action', 'categoryId', 'categoryName', 'title', 'relationship', 'relationshipDetails',
  'upc', 'epid', 'startPrice', 'quantity', 'itemPhotoUrl', 'videoId', 'conditionId',
  'description', 'format', 'duration', 'buyItNowPrice', 'bestOfferEnabled',
  'bestOfferAutoAcceptPrice', 'minimumBestOfferPrice', 'immediatePayRequired', 'location',
  'shippingService1Option', 'shippingService1Cost', 'shippingService1Priority',
  'shippingService2Option', 'shippingService2Cost', 'shippingService2Priority',
  'maxDispatchTime', 'returnsAcceptedOption', 'returnsWithinOption', 'refundOption',
  'returnShippingCostPaidBy', 'shippingProfileName', 'returnProfileName', 'paymentProfileName'
];

function asXmlArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// GetItem returns money and other attributed elements as { _: value, $: {...} }
// under explicitArray:false, but as a bare string when there are no attributes.
function readXmlValue(node) {
  if (node === undefined || node === null) return '';
  if (typeof node === 'object') return node._ ?? '';
  return String(node);
}

/**
 * What is actually live on this listing right now.
 *
 * Read from eBay rather than from templatelistings because the two can differ —
 * a listing may have been revised by hand in Seller Hub — and a snapshot that
 * describes something other than what was overwritten is worse than none.
 */
async function getListingSnapshot(token, itemId) {
  const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
  <OutputSelector>Item.ItemID</OutputSelector>
  <OutputSelector>Item.Title</OutputSelector>
  <OutputSelector>Item.SKU</OutputSelector>
  <OutputSelector>Item.StartPrice</OutputSelector>
  <OutputSelector>Item.Currency</OutputSelector>
  <OutputSelector>Item.Description</OutputSelector>
  <OutputSelector>Item.PictureDetails</OutputSelector>
  <OutputSelector>Item.PrimaryCategory</OutputSelector>
  <OutputSelector>Item.ItemSpecifics</OutputSelector>
</GetItemRequest>`;

  const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'Content-Type': 'text/xml'
    },
    timeout: 45000
  });

  const parsed = await parseStringPromise(response.data, { explicitArray: false });
  const body = parsed?.GetItemResponse;
  if (body?.Ack === 'Failure') {
    const errors = asXmlArray(body.Errors);
    throw new Error(errors[0]?.LongMessage || 'GetItem failed');
  }

  const item = body?.Item || {};
  const rawPrice = readXmlValue(item.StartPrice);
  const parsedPrice = rawPrice === '' ? null : Number(rawPrice);

  return {
    sku: item.SKU || '',
    title: item.Title || '',
    price: Number.isFinite(parsedPrice) ? parsedPrice : null,
    currency: item.StartPrice?.$?.currencyID || item.Currency || '',
    description: item.Description || '',
    images: asXmlArray(item.PictureDetails?.PictureURL).filter(Boolean),
    itemSpecifics: asXmlArray(item.ItemSpecifics?.NameValueList).map((nv) => ({
      name: nv?.Name || '',
      value: asXmlArray(nv?.Value).filter(Boolean).join(', ')
    })).filter((nv) => nv.name),
    categoryId: item.PrimaryCategory?.CategoryID || '',
    categoryName: item.PrimaryCategory?.CategoryName || ''
  };
}

function buildItemSpecificsXml(specifics) {
  if (!specifics.length) return '';
  const entries = specifics
    .map((s) => `<NameValueList><Name>${escapeXmlText(s.name)}</Name><Value>${escapeXmlText(s.value)}</Value></NameValueList>`)
    .join('');
  return `<ItemSpecifics>${entries}</ItemSpecifics>`;
}

/**
 * Replace a live listing's content with the new ASIN's.
 *
 * The picture list is always sent whole: eBay treats a partial PictureDetails
 * as the complete new set anyway, and rejects one that mixes its own hosted
 * pictures with external URLs (20004). hostsAreUniform is the last line of
 * defence against sending such a list.
 */
async function reviseListingToNewAsin({ token, itemId, sku, title, price, description, images, specifics }) {
  if (images.length && !hostsAreUniform(images)) {
    throw new Error('Refusing to revise: the image list mixes eBay-hosted and external pictures, which eBay rejects (error 20004).');
  }

  let itemContent = `<ItemID>${itemId}</ItemID>`;
  if (sku) itemContent += `<SKU>${escapeXmlText(sku)}</SKU>`;
  if (title) itemContent += `<Title>${escapeXmlText(title)}</Title>`;
  if (price != null) itemContent += `<StartPrice>${Number(price).toFixed(2)}</StartPrice>`;
  if (description) {
    // CDATA keeps the generated HTML intact. A literal "]]>" inside the
    // description would close the section early and corrupt the request, so the
    // only sequence that can do that is neutralised.
    itemContent += `<Description><![CDATA[${String(description).replace(/]]>/g, ']]&gt;')}]]></Description>`;
  }
  if (images.length) {
    itemContent += `<PictureDetails>${images.map((url) => `<PictureURL>${escapeXmlText(url)}</PictureURL>`).join('')}</PictureDetails>`;
  }
  itemContent += buildItemSpecificsXml(specifics);

  const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <RequesterCredentials><eBayAuthToken>${token}</eBayAuthToken></RequesterCredentials>
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>${itemContent}</Item>
</ReviseFixedPriceItemRequest>`;

  const response = await axios.post('https://api.ebay.com/ws/api.dll', xmlRequest, {
    headers: {
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1423',
      'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem',
      'Content-Type': 'text/xml'
    },
    timeout: 90000
  });

  const parsed = await parseStringPromise(response.data, { explicitArray: false });
  const body = parsed?.ReviseFixedPriceItemResponse;
  const ack = body?.Ack;

  if (ack !== 'Success' && ack !== 'Warning') {
    const errors = asXmlArray(body?.Errors);
    throw new Error(errors.map((e) => e.LongMessage).filter(Boolean).join('; ') || 'ReviseFixedPriceItem failed');
  }

  return {
    ack,
    warnings: asXmlArray(body?.Errors).map((e) => e.LongMessage).filter(Boolean)
  };
}

/**
 * The templatelistings row that currently describes a live listing.
 *
 * SKU is the only link templatelistings has to eBay — it stores no item id — so
 * this is the lookup, and it is read-only: the row is history and the revise
 * never writes to it.
 *
 * Collated to match the customLabel index, because a SKU imported from eBay
 * need not carry the casing this flow generates, and sorted newest-first so a
 * label that appears under more than one template resolves the same way twice.
 */
async function findListingRowForSku(sellerId, sku) {
  if (!sku) return null;
  return TemplateListing.findOne({ sellerId, customLabel: sku, deletedAt: null })
    .select('+_asinReference')
    .collation({ locale: 'en', strength: 2 })
    .sort({ createdAt: -1 })
    .lean();
}

/**
 * Shared setup for both halves of the flow: validate the request, load the
 * seller, the effective template and the seller's pricing config, and get a
 * token. Returns { error } for the caller to surface, or the loaded context.
 */
async function loadReviseContext({ sellerId, itemId, asin, templateId }) {
  if (!mongoose.Types.ObjectId.isValid(String(sellerId || '')) || !String(itemId || '').trim()) {
    return { error: 'sellerId and itemId are required.', status: 400 };
  }

  const cleanAsinValue = String(asin || '').trim().toUpperCase();
  if (!ASIN_PATTERN.test(cleanAsinValue)) {
    return { error: 'A valid 10-character ASIN is required.', status: 400 };
  }

  if (!mongoose.Types.ObjectId.isValid(String(templateId || ''))) {
    return { error: 'A template must be selected.', status: 400 };
  }

  const seller = await Seller.findById(sellerId);
  if (!seller) return { error: 'Seller not found.', status: 404 };

  const template = await getEffectiveTemplate(templateId, sellerId);
  if (!template) return { error: 'Template not found.', status: 404 };
  if (!template.asinAutomation?.enabled) {
    return { error: `ASIN automation is not enabled for template "${template.name}".`, status: 400 };
  }

  // Seller-specific pricing overrides the template default, same precedence as
  // the bulk listing pipeline.
  const sellerConfig = await SellerPricingConfig.findOne({ sellerId, templateId });
  const pricingConfig = sellerConfig ? sellerConfig.pricingConfig : template.pricingConfig;

  const token = await ensureValidToken(seller);

  return { seller, template, pricingConfig, token, asin: cleanAsinValue };
}

/**
 * POST /amazon-stock-checks/revise-listing/preview
 *
 * Generates what the listing would become, and reads what it is now. Writes
 * nothing anywhere — the user reviews and edits the result before any of it
 * reaches eBay.
 */
router.post('/revise-listing/preview', requireAuth, requirePageAccess(LISTING_ACTION_PAGES), async (req, res) => {
  try {
    const { sellerId, itemId, asin, templateId, currency, overlayBadgeId = '' } = req.body || {};

    const context = await loadReviseContext({ sellerId, itemId, asin, templateId });
    if (context.error) return res.status(context.status).json({ error: context.error });

    const { seller, template, pricingConfig, token } = context;
    const region = regionForCurrency(currency);

    const [snapshot, generated, skuResult] = await Promise.all([
      getListingSnapshot(token, String(itemId).trim()),
      generateListingFromAsin({
        asin: context.asin,
        template,
        seller,
        pricingConfig,
        region,
        overlayBadgeId,
        usageContext: buildReviseUsageContext(req, templateId, sellerId),
        ensureValidToken
      }),
      resolveAvailableSku({ asin: context.asin, sellerId })
    ]);

    const previousListing = await findListingRowForSku(sellerId, snapshot.sku);

    const warnings = [...generated.warnings];
    if (skuResult.bumped) {
      warnings.push(`SKU ${skuResult.sku} was chosen because earlier suffixes are already in use.`);
    }
    // Stated rather than left implicit: a revise that leaves pictures on Amazon
    // depends on eBay fetching each one while the listing is live, and a fetch
    // that fails strands the previous product's photo on the listing.
    if (generated.generatedListing.itemPhotoUrl && !generated.imagesHosted) {
      warnings.push('Pictures are not hosted on eBay — they will be sent as Amazon URLs for eBay to fetch.');
    }
    if (template.categoryId && snapshot.categoryId && String(template.categoryId) !== String(snapshot.categoryId)) {
      warnings.push(`This listing sits in eBay category ${snapshot.categoryId} (${snapshot.categoryName || 'unnamed'}) but the template targets ${template.categoryId}. The category is not changed by a revise.`);
    }
    if (!previousListing) {
      warnings.push(`No listing row found for SKU "${snapshot.sku}" — the old details cannot be linked to this revision.`);
    }

    res.json({
      itemId: String(itemId).trim(),
      asin: context.asin,
      region,
      // Echoed back so the apply call is bound to the template this preview was
      // actually generated from, rather than whatever the picker holds by then.
      templateId,
      newSku: skuResult.sku,
      imagesHosted: generated.imagesHosted,
      before: {
        ...snapshot,
        asin: previousListing?._asinReference || '',
        listingId: previousListing?._id || null
      },
      after: generated.generatedListing,
      sourceData: generated.sourceData,
      pricingCalculation: generated.pricingCalculation,
      overlayApplied: generated.overlayApplied,
      templateColumns: (template.customColumns || []).map((col) => ({
        name: col.name,
        displayName: col.displayName,
        dataType: col.dataType
      })),
      warnings,
      errors: generated.errors
    });
  } catch (error) {
    console.error('[revise-listing/preview] failed:', error.message);
    res.status(500).json({ error: error.message || 'Failed to build revise preview' });
  }
});

/**
 * POST /amazon-stock-checks/revise-listing/apply
 *
 * Pushes the reviewed content onto the live listing, then records the new ASIN
 * as its own listing row.
 *
 * Ordering matters: the before-snapshot is persisted BEFORE the eBay call, so a
 * crash in between still leaves a record the listing can be restored from —
 * the same discipline ListingOverlayItem uses.
 */
router.post('/revise-listing/apply', requireAuth, requirePageAccess(LISTING_ACTION_PAGES), async (req, res) => {
  let revision = null;

  try {
    const { sellerId, itemId, asin, templateId, listing = {} } = req.body || {};

    const context = await loadReviseContext({ sellerId, itemId, asin, templateId });
    if (context.error) return res.status(context.status).json({ error: context.error });

    const { template, token } = context;
    const cleanItemId = String(itemId).trim();

    const title = String(listing.title || '').trim();
    const price = listing.startPrice === '' || listing.startPrice == null ? null : Number(listing.startPrice);
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    if (price == null || !Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ error: 'A valid start price is required.' });
    }
    if (title.length > 80) return res.status(400).json({ error: 'Title must be 80 characters or fewer.' });

    // Read the live state and re-resolve the SKU server-side. Both were shown in
    // the preview, but either may have moved since — a concurrent revise, or a
    // bulk save that claimed the SKU.
    const [snapshot, skuResult] = await Promise.all([
      getListingSnapshot(token, cleanItemId),
      resolveAvailableSku({ asin: context.asin, sellerId })
    ]);

    const previousListing = await findListingRowForSku(sellerId, snapshot.sku);

    // Last guarantee that the pictures are eBay-hosted. A pure no-op when the
    // preview already hosted them — hostImagesOnEbay returns early once every
    // URL is on ebayimg.com — so the happy path costs nothing, and the only
    // time it does work is when hosting failed during preview and the reviewer
    // went ahead regardless.
    const requestedImages = splitImageList(listing.itemPhotoUrl || '');
    const hostResult = await hostImagesOnEbay(requestedImages, { sellerId: context.seller._id, token });
    const images = hostResult.applied ? hostResult.images : requestedImages;

    // The description embeds these same URLs. If hosting only happened just
    // now, rewrite them there too, or the gallery would sit on EPS while the
    // description still pointed at Amazon. Positional because hostImagesOnEbay
    // preserves order one-for-one; a literal split/join avoids having to escape
    // the URLs into a regex.
    let description = listing.description || '';
    if (hostResult.applied) {
      requestedImages.forEach((originalUrl, index) => {
        const hostedUrl = hostResult.images[index];
        if (hostedUrl && hostedUrl !== originalUrl) {
          description = description.split(originalUrl).join(hostedUrl);
        }
      });
    }

    const specifics = buildItemSpecifics(listing.customFields || {}, template.customColumns || []);

    revision = await ListingRevision.create({
      seller: sellerId,
      itemId: cleanItemId,
      templateId,
      previousAsin: previousListing?._asinReference || '',
      previousSku: snapshot.sku || '',
      previousListing: previousListing?._id || null,
      newAsin: context.asin,
      newSku: skuResult.sku,
      before: snapshot,
      after: {
        sku: skuResult.sku,
        title,
        price,
        currency: snapshot.currency,
        description,
        images,
        itemSpecifics: specifics.map((s) => ({ name: s.name, value: s.value })),
        categoryId: snapshot.categoryId,
        categoryName: snapshot.categoryName
      },
      status: 'pending',
      requestedBy: req.user?.userId || null
    });

    let ebayResult;
    try {
      ebayResult = await reviseListingToNewAsin({
        token,
        itemId: cleanItemId,
        sku: skuResult.sku,
        title,
        price,
        description,
        images,
        specifics
      });
    } catch (ebayError) {
      await ListingRevision.findByIdAndUpdate(revision._id, {
        status: 'failed',
        error: ebayError.message || 'Revise failed'
      });
      await AmazonStockActionLog.create({
        sku: snapshot.sku || '',
        asin: context.asin,
        seller: sellerId,
        itemId: cleanItemId,
        actionType: 'revise_listing',
        requestedBy: req.user?.userId || null,
        status: 'failed',
        requestPayload: { mode: 'asin_swap', newAsin: context.asin, newSku: skuResult.sku, revisionId: String(revision._id) },
        error: ebayError.message || 'Revise failed'
      });
      return res.status(502).json({ error: ebayError.message || 'eBay rejected the revise.' });
    }

    // eBay is committed from here on. Anything that fails below leaves a live
    // listing whose database row is missing, so it is reported as a distinct
    // state rather than rolled into a plain failure — the revise itself worked.
    try {
      const newListing = new TemplateListing({
        templateId,
        sellerId,
        customLabel: skuResult.sku,
        customFields: new Map(Object.entries(listing.customFields || {})),
        status: 'active',
        createdBy: req.user?.userId || null,
        aiRunId: listing._aiRunId || null,
        _asinReference: context.asin,
        _amazonSourcePrice: listing._amazonSourcePrice || null,
        // Already live on eBay, so it must never reach the CSV exporter — an
        // export would re-list it as a second listing carrying the same SKU.
        // The Active Batch view uses this same filter, so it stays out of there
        // too, while remaining visible under All batches.
        downloadBatchId: `revise-${revision._id}`,
        downloadedAt: new Date(),
        pendingRedownload: false,
        downloadBatchNumber: null,
        scheduleTime: ''
      });

      for (const field of TEMPLATE_LISTING_CORE_FIELDS) {
        if (listing[field] !== undefined && listing[field] !== null && listing[field] !== '') {
          newListing[field] = listing[field];
        }
      }
      // What eBay was actually given, which is not necessarily what the browser
      // sent: the hosting step above may have moved the pictures to EPS and
      // rewritten the description to match. The row has to record what is live.
      newListing.title = title;
      newListing.startPrice = price;
      newListing.description = description;
      if (images.length) newListing.itemPhotoUrl = images.join(IMAGE_LIST_SEPARATOR);

      await newListing.save();

      await ListingRevision.findByIdAndUpdate(revision._id, {
        status: 'success',
        newListing: newListing._id,
        appliedAt: new Date()
      });

      await AmazonStockActionLog.create({
        sku: skuResult.sku,
        asin: context.asin,
        seller: sellerId,
        itemId: cleanItemId,
        actionType: 'revise_listing',
        requestedBy: req.user?.userId || null,
        status: 'success',
        requestPayload: {
          mode: 'asin_swap',
          title,
          price,
          previousTitle: snapshot.title,
          previousPrice: snapshot.price,
          previousAsin: previousListing?._asinReference || '',
          previousSku: snapshot.sku || '',
          newAsin: context.asin,
          newSku: skuResult.sku,
          revisionId: String(revision._id)
        },
        responseSummary: { ack: ebayResult.ack, warnings: ebayResult.warnings }
      });

      res.json({
        ok: true,
        itemId: cleanItemId,
        newSku: skuResult.sku,
        newAsin: context.asin,
        previousSku: snapshot.sku || '',
        previousAsin: previousListing?._asinReference || '',
        listingId: newListing._id,
        revisionId: revision._id,
        warnings: ebayResult.warnings,
        message: `Item ${cleanItemId} now lists ${context.asin} as ${skuResult.sku}`
      });
    } catch (bookkeepingError) {
      console.error('[revise-listing/apply] eBay revised but bookkeeping failed:', bookkeepingError.message);
      await ListingRevision.findByIdAndUpdate(revision._id, {
        status: 'success',
        appliedAt: new Date(),
        bookkeepingError: bookkeepingError.message || 'Failed to save the new listing row'
      });
      res.status(500).json({
        error: `eBay item ${cleanItemId} was revised to ${context.asin}, but saving the new listing row failed: ${bookkeepingError.message}. The listing is live — add the row manually or retry.`,
        ebayRevised: true,
        revisionId: revision._id
      });
    }
  } catch (error) {
    console.error('[revise-listing/apply] failed:', error.message);
    if (revision) {
      await ListingRevision.findByIdAndUpdate(revision._id, {
        status: 'failed',
        error: error.message || 'Revise failed'
      }).catch(() => {});
    }
    res.status(500).json({ error: error.message || 'Failed to revise listing' });
  }
});

/**
 * GET /amazon-stock-checks/revisions
 *
 * The ASIN-swap history, newest first. Descriptions and image lists are left
 * out — they are the bulk of a revision document and are only ever read one at
 * a time, from the detail route below.
 */
router.get('/revisions', requireAuth, requirePageAccess(LISTING_REVISION_PAGES), async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const filter = {};

    if (['pending', 'success', 'failed'].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (mongoose.Types.ObjectId.isValid(String(req.query.sellerId || ''))) {
      filter.seller = req.query.sellerId;
    }

    // One box for every identifier on the row — an item id, either SKU or
    // either ASIN — because none of them is worth its own input when they never
    // overlap in shape.
    const search = String(req.query.search || '').trim();
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { itemId: rx }, { previousSku: rx }, { newSku: rx },
        { previousAsin: rx }, { newAsin: rx }
      ];
    }

    const [rows, total] = await Promise.all([
      ListingRevision.find(filter)
        .select('-before.description -after.description -before.images -after.images -before.itemSpecifics -after.itemSpecifics')
        .populate({ path: 'seller', populate: { path: 'user', select: 'username name email' } })
        .populate('requestedBy', 'username name email')
        .populate('templateId', 'name')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      ListingRevision.countDocuments(filter)
    ]);

    res.json({
      total,
      page,
      limit,
      rows: rows.map((row) => ({
        _id: row._id,
        itemId: row.itemId,
        sellerName: row.seller?.user?.username || row.seller?.user?.name || row.seller?.user?.email || '',
        templateName: row.templateId?.name || '',
        previousAsin: row.previousAsin,
        previousSku: row.previousSku,
        newAsin: row.newAsin,
        newSku: row.newSku,
        previousTitle: row.before?.title || '',
        newTitle: row.after?.title || '',
        previousPrice: row.before?.price ?? null,
        newPrice: row.after?.price ?? null,
        currency: row.before?.currency || '',
        status: row.status,
        error: row.error || '',
        bookkeepingError: row.bookkeepingError || '',
        requestedBy: row.requestedBy?.username || row.requestedBy?.name || row.requestedBy?.email || '',
        appliedAt: row.appliedAt,
        createdAt: row.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load listing revisions' });
  }
});

// GET /amazon-stock-checks/revisions/:id — one revision in full, including the
// before/after descriptions, pictures and item specifics.
router.get('/revisions/:id', requireAuth, requirePageAccess(LISTING_REVISION_PAGES), requireObjectId(), async (req, res) => {
  try {
    const revision = await ListingRevision.findById(req.params.id)
      .populate({ path: 'seller', populate: { path: 'user', select: 'username name email' } })
      .populate('requestedBy', 'username name email')
      .populate('templateId', 'name')
      .lean();

    if (!revision) return res.status(404).json({ error: 'Revision not found' });

    res.json({
      ...revision,
      sellerName: revision.seller?.user?.username || revision.seller?.user?.name || revision.seller?.user?.email || '',
      templateName: revision.templateId?.name || '',
      requestedByName: revision.requestedBy?.username || revision.requestedBy?.name || revision.requestedBy?.email || ''
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load the revision' });
  }
});

export default router;
