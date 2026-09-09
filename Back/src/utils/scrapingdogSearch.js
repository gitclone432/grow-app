import axios from 'axios';
import { trackApiUsage } from './apiUsageTracker.js';

const SCRAPINGDOG_SEARCH_BASE = 'https://api.scrapingdog.com/amazon/search';
const ASIN_RE = /^[A-Z0-9]{10}$/;
const PAGE_TIMEOUT_MS = Math.max(15000, parseInt(process.env.SCRAPINGDOG_SEARCH_TIMEOUT_MS, 10) || 60000);
const PAGE_GAP_MS = Math.max(0, parseInt(process.env.SCRAPINGDOG_SEARCH_PAGE_GAP_MS, 10) || 300);

export const SEARCH_REGION_CONFIG = {
  US: { domain: 'com', country: 'us', credits: 1 },
  UK: { domain: 'co.uk', country: 'gb', credits: 1 },
  CA: { domain: 'ca', country: 'ca', credits: 1 },
  AU: { domain: 'com.au', country: 'au', credits: 1 }
};

export function getScrapingdogSearchApiKey() {
  const key = String(process.env.SCRAPINGDOG_API_KEY || '').trim()
    || (String(process.env.SCRAPER_PROVIDER || '').toLowerCase() === 'scrapingdog'
      ? String(process.env.SCRAPER_API_KEY || '').trim()
      : '');
  if (!key || key === 'your_api_key_here_after_signup') {
    throw new Error('SCRAPINGDOG_API_KEY is not configured (or set SCRAPER_PROVIDER=scrapingdog with SCRAPER_API_KEY)');
  }
  return key;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scraperErrorDetail(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.slice(0, 200);
  if (typeof data.message === 'string') return data.message;
  if (typeof data.title === 'string' && typeof data.detail === 'string') {
    return `${data.title}: ${data.detail}`.slice(0, 240);
  }
  if (typeof data.title === 'string') return data.title;
  return '';
}

function extractAsin(item) {
  const direct = String(item?.asin || item?.ASIN || '').trim().toUpperCase();
  if (ASIN_RE.test(direct)) return direct;
  const url = String(item?.optimized_url || item?.url || item?.link || item?.product_url || '');
  const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
  return match ? match[1].toUpperCase() : '';
}

function isSponsored(item) {
  return item?.sponsored === true
    || item?.is_sponsored === true
    || String(item?.type || '').toLowerCase().includes('sponsored');
}

function asBool(value) {
  return value === true || value === 'true';
}

function asText(value) {
  if (value == null || value === '') return '';
  return String(value).trim();
}

function normalizeProduct(item, page) {
  const asin = extractAsin(item);
  if (!asin) return null;
  const extractedPrice = Number(item?.extracted_price);
  const extractedOldPrice = Number(item?.extracted_old_price);
  const optimizedUrl = asText(item?.optimized_url)
    || (asin ? `https://www.amazon.com/dp/${asin}` : '');
  return {
    asin,
    title: asText(item?.title || item?.name),
    image: asText(item?.image || item?.thumbnail),
    hasPrime: asBool(item?.has_prime),
    isBestSeller: asBool(item?.is_best_seller),
    isAmazonChoice: asBool(item?.is_amazon_choice),
    limitedTimeDeal: asBool(item?.limited_time_deal),
    dealOfTheDay: asBool(item?.deal_of_the_day),
    stars: asText(item?.stars),
    totalReviews: asText(item?.total_reviews),
    url: asText(item?.url),
    optimizedUrl,
    sponsored: isSponsored(item),
    certification: asText(item?.certification),
    numberOfPeopleBought: asText(item?.number_of_people_bought),
    delivery: asText(item?.delivery),
    availabilityQuantity: item?.availability_quantity ?? null,
    price: asText(item?.price_string || item?.price),
    priceSymbol: asText(item?.price_symbol || item?.currency),
    extractedPrice: Number.isFinite(extractedPrice) ? extractedPrice : null,
    extractedOldPrice: Number.isFinite(extractedOldPrice) ? extractedOldPrice : null,
    currency: asText(item?.currency),
    moreBuyingChoices: asText(item?.more_buying_choices),
    moreBuyingChoicesLink: asText(item?.more_buying_choices_link),
    page
  };
}

function collectResultItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.search_results)) return payload.search_results;
  if (Array.isArray(payload.amazon_search_products)) return payload.amazon_search_products;
  if (Array.isArray(payload.products)) return payload.products;
  return [];
}

async function fetchSearchPage({ apiKey, query, domain, country, page }) {
  const started = Date.now();
  try {
    const response = await axios.get(SCRAPINGDOG_SEARCH_BASE, {
      params: {
        api_key: apiKey,
        query,
        domain,
        page: String(page),
        country
      },
      timeout: PAGE_TIMEOUT_MS
    });
    const items = collectResultItems(response.data);
    return {
      items,
      raw: response.data,
      httpStatus: response.status,
      responseTime: Date.now() - started,
      rawMessage: String(response.data?.search_message || '')
    };
  } catch (err) {
    const status = err?.response?.status;
    const detail = scraperErrorDetail(err?.response?.data);
    const suffix = detail ? ` — ${detail}` : '';
    let message;
    if (status === 401) {
      message = `ScrapingDog search 401: check SCRAPINGDOG_API_KEY / SCRAPER_API_KEY${suffix}`;
    } else if (status === 429) {
      message = `ScrapingDog search rate limit (429). Retry in a minute.${suffix}`;
    } else if (err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message || '')) {
      message = `ScrapingDog search timed out on page ${page}${suffix}`;
    } else {
      message = err?.message ? `${err.message}${suffix}` : `ScrapingDog search failed on page ${page}${suffix}`;
    }
    const wrapped = new Error(message);
    wrapped.response = err.response;
    wrapped.status = status;
    throw wrapped;
  }
}

/**
 * Single-page ScrapingDog Amazon search with raw payload (for Scraper Tester).
 */
export async function searchAmazonRawPage({ query, region = 'US', page = 1 } = {}) {
  const trimmedQuery = String(query || '').trim();
  if (trimmedQuery.length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }

  const regionKey = String(region || 'US').trim().toUpperCase();
  const config = SEARCH_REGION_CONFIG[regionKey] || SEARCH_REGION_CONFIG.US;
  const pageNum = Math.min(20, Math.max(1, parseInt(page, 10) || 1));
  const apiKey = getScrapingdogSearchApiKey();

  const result = await fetchSearchPage({
    apiKey,
    query: trimmedQuery,
    domain: config.domain,
    country: config.country,
    page: pageNum
  });

  const seen = new Set();
  const products = [];
  for (const item of result.items) {
    const product = normalizeProduct(item, pageNum);
    if (!product || seen.has(product.asin)) continue;
    seen.add(product.asin);
    products.push(product);
  }

  return {
    query: trimmedQuery,
    region: SEARCH_REGION_CONFIG[regionKey] ? regionKey : 'US',
    domain: config.domain,
    country: config.country,
    page: pageNum,
    creditsUsed: config.credits,
    responseTime: result.responseTime,
    httpStatus: result.httpStatus || 200,
    products,
    asins: products.map((p) => p.asin),
    hasMore: products.length > 0 && pageNum < 20,
    raw: result.raw
  };
}

/**
 * Fetch multiple Amazon search pages in one run (1 credit per page).
 * Stops early when a page returns no products.
 */
export async function searchAmazonRawPages({ query, region = 'US', pages = 10 } = {}) {
  const pageCount = Math.min(20, Math.max(1, parseInt(pages, 10) || 10));
  const first = await searchAmazonRawPage({ query, region, page: 1 });
  const seen = new Set(first.asins);
  const products = [...first.products];
  const rawPages = [first.raw];
  let creditsUsed = first.creditsUsed;
  let pagesFetched = 1;
  let lastHasMore = first.hasMore && first.products.length > 0;

  for (let page = 2; page <= pageCount && lastHasMore; page += 1) {
    if (PAGE_GAP_MS) await sleep(PAGE_GAP_MS);
    const result = await searchAmazonRawPage({ query, region, page });
    pagesFetched += 1;
    creditsUsed += result.creditsUsed;
    rawPages.push(result.raw);
    for (const product of result.products) {
      if (seen.has(product.asin)) continue;
      seen.add(product.asin);
      products.push(product);
    }
    lastHasMore = Boolean(result.hasMore && result.products.length > 0);
  }

  return {
    query: first.query,
    region: first.region,
    domain: first.domain,
    country: first.country,
    pagesRequested: pageCount,
    pagesFetched,
    creditsUsed,
    products,
    asins: products.map((p) => p.asin),
    hasMore: lastHasMore && pagesFetched < 20,
    rawPages
  };
}

/**
 * Search Amazon via ScrapingDog and return unique product ASINs.
 */
export async function searchAmazonProducts({
  query,
  region = 'US',
  pages = 1,
  excludeSponsored = true,
  maxAsins = 40
} = {}) {
  const trimmedQuery = String(query || '').trim();
  if (trimmedQuery.length < 2) {
    throw new Error('Search query must be at least 2 characters');
  }

  const regionKey = String(region || 'US').trim().toUpperCase();
  const config = SEARCH_REGION_CONFIG[regionKey] || SEARCH_REGION_CONFIG.US;
  const pageCount = Math.min(5, Math.max(1, parseInt(pages, 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(maxAsins, 10) || 40));
  const apiKey = getScrapingdogSearchApiKey();

  const seen = new Set();
  const products = [];
  let skippedSponsored = 0;
  let skippedInvalid = 0;
  let pagesFetched = 0;
  let creditsUsed = 0;
  const warnings = [];

  for (let page = 1; page <= pageCount && products.length < limit; page += 1) {
    if (page > 1 && PAGE_GAP_MS) await sleep(PAGE_GAP_MS);

    const started = Date.now();
    let pageItems = [];
    try {
      const result = await fetchSearchPage({
        apiKey,
        query: trimmedQuery,
        domain: config.domain,
        country: config.country,
        page
      });
      pageItems = result.items;
      pagesFetched += 1;
      creditsUsed += config.credits;
      trackApiUsage({
        service: 'ScrapingDog',
        creditsUsed: config.credits,
        success: true,
        responseTime: Date.now() - started,
        extractedFields: ['amazon_search']
      }).catch((err) => console.error('[AmazonSearch] usage track:', err?.message));
    } catch (err) {
      trackApiUsage({
        service: 'ScrapingDog',
        creditsUsed: 0,
        success: false,
        errorMessage: err.message,
        responseTime: Date.now() - started,
        extractedFields: []
      }).catch((trackErr) => console.error('[AmazonSearch] usage track:', trackErr?.message));

      if (pagesFetched === 0) throw err;
      warnings.push(`Stopped after page ${pagesFetched}: ${err.message}`);
      break;
    }

    if (!pageItems.length) {
      warnings.push(`Page ${page} returned no products`);
      break;
    }

    for (const item of pageItems) {
      if (products.length >= limit) break;
      const product = normalizeProduct(item, page);
      if (!product) {
        skippedInvalid += 1;
        continue;
      }
      if (excludeSponsored && product.sponsored) {
        skippedSponsored += 1;
        continue;
      }
      if (seen.has(product.asin)) continue;
      seen.add(product.asin);
      products.push(product);
    }
  }

  return {
    query: trimmedQuery,
    region: SEARCH_REGION_CONFIG[regionKey] ? regionKey : 'US',
    domain: config.domain,
    pagesRequested: pageCount,
    pagesFetched,
    creditsUsed,
    excludeSponsored: Boolean(excludeSponsored),
    products,
    asins: products.map((p) => p.asin),
    skippedSponsored,
    skippedInvalid,
    warning: warnings.length ? warnings.join(' ') : undefined
  };
}
