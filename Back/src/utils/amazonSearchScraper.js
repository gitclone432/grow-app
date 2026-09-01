import axios from 'axios';
import { getScraperProvider } from './scraperApiProduct.js';

/**
 * Amazon SEARCH RESULTS scraping (keyword -> list of ASINs), for the
 * "Template + Account" sourcing flow. Separate from scraperApiProduct.js,
 * which only fetches a single product's detail page by ASIN.
 */

const SCRAPER_API_SEARCH_BASE = 'https://api.scraperapi.com/structured/amazon/search';
const SCRAPINGDOG_SEARCH_BASE = 'https://api.scrapingdog.com/amazon/search';

function regionToTld(region) {
  if (region === 'UK') return '.co.uk';
  if (region === 'CA') return '.ca';
  if (region === 'AU') return '.com.au';
  return '.com';
}

function regionToScrapingDogDomain(region) {
  if (region === 'UK') return 'co.uk';
  if (region === 'CA') return 'ca';
  if (region === 'AU') return 'com.au';
  return 'com';
}

function regionToScrapingDogCountry(region) {
  if (region === 'UK') return 'gb';
  if (region === 'CA') return 'ca';
  if (region === 'AU') return 'au';
  return 'us';
}

function getApiKey() {
  const key = process.env.SCRAPER_API_KEY;
  if (!key || key === 'your_api_key_here_after_signup') {
    throw new Error('SCRAPER_API_KEY environment variable not set. Please add it to .env file.');
  }
  return key;
}

function parseMoney(raw) {
  if (raw == null || raw === '') return null;
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : null;
}

function normalizeAsin(raw) {
  return String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** One search-result row, from either provider, → a common shape. */
function normalizeResultRow(row) {
  const asin = normalizeAsin(row.asin || row.ASIN);
  if (!asin || asin.length !== 10) return null;

  const title = row.title || row.name || '';
  const price = parseMoney(row.price ?? row.price_string ?? row.current_price);
  const image = row.image || row.thumbnail || row.image_url || '';
  const rating = row.rating != null ? parseFloat(String(row.stars || row.rating).replace(/[^\d.]/g, '')) : null;
  const url = row.url || row.link || (asin ? `https://www.amazon.com/dp/${asin}` : '');
  const sponsored = Boolean(row.sponsored || row.is_sponsored);

  return { asin, title, price, image, rating: Number.isFinite(rating) ? rating : null, url, sponsored };
}

async function searchWithScrapingDog(keyword, region, page) {
  const response = await axios.get(SCRAPINGDOG_SEARCH_BASE, {
    params: {
      api_key: getApiKey(),
      domain: regionToScrapingDogDomain(region),
      query: keyword,
      country: regionToScrapingDogCountry(region),
      page,
    },
    timeout: parseInt(process.env.SCRAPER_API_TIMEOUT_MS, 10) || 30000,
    validateStatus: (s) => s < 500,
  });

  if (response.status !== 200) {
    const err = new Error(`ScrapingDog search returned status ${response.status}`);
    err.response = response;
    throw err;
  }

  const body = response.data;
  const rows = Array.isArray(body)
    ? body
    : (body?.search_results || body?.results || body?.organic_results || []);

  return rows;
}

async function searchWithScraperApi(keyword, region, page) {
  const response = await axios.get(SCRAPER_API_SEARCH_BASE, {
    params: {
      api_key: getApiKey(),
      query: keyword,
      tld: regionToTld(region),
      page,
    },
    timeout: parseInt(process.env.SCRAPER_API_TIMEOUT_MS, 10) || 30000,
    validateStatus: (s) => s < 500,
  });

  if (response.status !== 200) {
    const err = new Error(`ScraperAPI search returned status ${response.status}`);
    err.response = response;
    throw err;
  }

  const body = response.data;
  const rows = Array.isArray(body) ? body : (body?.results || []);
  return rows;
}

/**
 * Fetches a single Amazon search-results page, normalized (no dedup/filter —
 * that's the caller's job). Used by lib/asinSourcingAutomation.js to page
 * incrementally (one new page per call) instead of re-fetching pages 1..N
 * on every call, so it can search far beyond searchAmazonAsins' 5-page cap
 * without wasting scraper API calls re-requesting pages it already has.
 */
export async function searchAmazonAsinsPage({ keyword, region = 'US', page = 1 }) {
  const trimmedKeyword = String(keyword || '').trim();
  if (!trimmedKeyword) {
    throw new Error('A search keyword is required');
  }

  const provider = getScraperProvider();
  const rawRows = provider === 'scrapingdog'
    ? await searchWithScrapingDog(trimmedKeyword, region, page)
    : await searchWithScraperApi(trimmedKeyword, region, page);

  if (!Array.isArray(rawRows)) return [];
  return rawRows.map((raw) => normalizeResultRow(raw || {})).filter(Boolean);
}

/**
 * Search Amazon for `keyword`, returning normalized rows across `pages`
 * pages of results (deduped by ASIN), optionally pre-filtered by price range.
 */
export async function searchAmazonAsins({ keyword, region = 'US', pages = 1, priceMin = null, priceMax = null }) {
  const trimmedKeyword = String(keyword || '').trim();
  if (!trimmedKeyword) {
    throw new Error('A search keyword is required');
  }

  const provider = getScraperProvider();
  const maxPages = Math.max(1, Math.min(Number(pages) || 1, 5));

  const seen = new Map();
  for (let page = 1; page <= maxPages; page++) {
    let rawRows = [];
    try {
      rawRows = provider === 'scrapingdog'
        ? await searchWithScrapingDog(trimmedKeyword, region, page)
        : await searchWithScraperApi(trimmedKeyword, region, page);
    } catch (err) {
      // Stop paging on failure but keep whatever we already collected.
      if (page === 1) throw err;
      break;
    }

    if (!Array.isArray(rawRows) || rawRows.length === 0) break;

    for (const raw of rawRows) {
      const normalized = normalizeResultRow(raw || {});
      if (!normalized || seen.has(normalized.asin)) continue;
      seen.set(normalized.asin, normalized);
    }
  }

  let rows = Array.from(seen.values());

  if (priceMin != null && Number.isFinite(Number(priceMin))) {
    rows = rows.filter((r) => r.price == null || r.price >= Number(priceMin));
  }
  if (priceMax != null && Number.isFinite(Number(priceMax))) {
    rows = rows.filter((r) => r.price == null || r.price <= Number(priceMax));
  }

  return rows;
}
