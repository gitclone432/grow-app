import axios from 'axios';

/**
 * ScraperAPI - External scraping service with bot detection bypass
 * Fallback when PAAPI doesn't provide price data
 * 
 * Free tier: 5,000 requests/month
 * Sign up: https://www.scraperapi.com
 */

const SCRAPER_API_BASE = 'http://api.scraperapi.com';

// Rate limiting queue to prevent 429 errors
let requestQueue = Promise.resolve();
let lastRequestTime = 0;
const MIN_REQUEST_DELAY = 2000; // 2 seconds between requests

/**
 * Throttle function to ensure minimum delay between API calls
 */
async function throttledRequest(requestFn) {
  return new Promise((resolve, reject) => {
    requestQueue = requestQueue.then(async () => {
      // Calculate time since last request
      const now = Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      const delayNeeded = Math.max(0, MIN_REQUEST_DELAY - timeSinceLastRequest);
      
      if (delayNeeded > 0) {
        console.log(`[ScraperAPI] ⏱️ Rate limiting: waiting ${delayNeeded}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayNeeded));
      }
      
      lastRequestTime = Date.now();
      
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Get API key from environment (loaded lazily to ensure dotenv is initialized)
 */
function getApiKey() {
  const key = process.env.SCRAPER_API_KEY;
  if (!key || key === 'your_api_key_here_after_signup') {
    throw new Error('SCRAPER_API_KEY environment variable not set. Please add it to .env file.');
  }
  return key;
}

/**
 * Scrape Amazon product price using ScraperAPI
 * @param {string} asin - Amazon ASIN
 * @param {string} region - Amazon region (US, UK, CA, AU)
 * @param {number} retries - Number of retry attempts (default: 2)
 * @returns {Promise<string>} - Extracted price string
 */
export async function scrapeAmazonPriceWithScraperAPI(asin, region = 'US', retries = 2) {
  // Use throttling to prevent 429 rate limit errors
  return throttledRequest(async () => {
    const SCRAPER_API_KEY = getApiKey();

    const regionDomains = {
      US: 'amazon.com',
      UK: 'amazon.co.uk',
      CA: 'amazon.ca',
      AU: 'amazon.com.au'
    };

    const domain = regionDomains[region] || regionDomains.US;
    const url = `https://www.${domain}/dp/${asin}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`[ScraperAPI] 🔍 Scraping ASIN: ${asin}${attempt > 1 ? ` (attempt ${attempt}/${retries})` : ''}`);

        // Make request to ScraperAPI
        const response = await axios.get(SCRAPER_API_BASE, {
          params: {
            api_key: SCRAPER_API_KEY,
            url: url,
            // Enable JavaScript rendering (for dynamic content)
            render: 'false', // Set to 'true' if needed for JS-heavy pages
            // Residential proxy (more expensive but harder to detect)
            residential: 'false'
          },
          timeout: 30000
        });

        if (response.status !== 200) {
          throw new Error(`ScraperAPI returned status ${response.status}`);
        }

        const html = response.data;

        // Extract price from HTML
        const price = extractPriceFromHTML(html);

        if (!price) {
          if (attempt < retries) {
            console.warn(`[ScraperAPI] ⚠️ No price found for ${asin}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
            continue;
          }
          console.warn(`[ScraperAPI] ⚠️ No price found in HTML for ASIN: ${asin}`);
          throw new Error('NO_PRICE_FOUND');
        }

        console.log(`[ScraperAPI] ✅ Successfully scraped price for ${asin}: ${price}`);
        return price;
      } catch (error) {
        // Don't retry on 429 errors or NO_PRICE_FOUND (final attempt)
        if (error.response?.status === 429 || error.message === 'NO_PRICE_FOUND') {
          console.error(`[ScraperAPI] ❌ Failed to scrape ASIN ${asin}:`, error.message);
          throw error;
        }
        
        // Retry on other errors
        if (attempt < retries) {
          console.warn(`[ScraperAPI] ⚠️ Attempt ${attempt} failed for ${asin}: ${error.message}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
          continue;
        }
        
        console.error(`[ScraperAPI] ❌ Failed to scrape ASIN ${asin}:`, error.message);
        throw error;
      }
    }
  });
}

/**
 * Extract price from Amazon HTML
 * Uses same selectors as Puppeteer version
 */
function extractPriceFromHTML(html) {
  const cleanText = (str) => {
    return (str || '')
      .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '')
      .replace(/Â£/g, '£')
      .replace(/Â€/g, '€')
      .replace(/Â¥/g, '¥')
      .replace(/Â/g, '')
      .trim();
  };

  // Price selectors (same as Puppeteer)
  const selectors = [
    // Old layout
    /<span id="priceblock_ourprice"[^>]*>([^<]+)<\/span>/i,
    /<span id="priceblock_dealprice"[^>]*>([^<]+)<\/span>/i,
    /<span id="priceblock_saleprice"[^>]*>([^<]+)<\/span>/i,
    // New layout
    /<span class="a-offscreen">([^<]+)<\/span>/i,
    /<span[^>]*class="[^"]*a-price[^"]*"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/i,
    // Buybox price
    /<div id="corePrice_feature_div"[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/i,
    // Desktop display
    /<div id="corePriceDisplay_desktop_feature_div"[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/i,
    // Generic price
    /<span data-a-color="price"[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/i
  ];

  for (const selector of selectors) {
    const match = html.match(selector);
    if (match && match[1]) {
      const rawPrice = cleanText(match[1]);
      // Extract just the price (remove currency, etc)
      const cleaned = rawPrice.replace(/^[^\d]+/, '').trim();
      if (cleaned && /[\d.,]+/.test(cleaned)) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Batch scrape multiple ASINs with rate limiting
 */
export async function batchScrapeAmazonPricesWithScraperAPI(asins, region = 'US', delayMs = 1000) {
  const results = [];

  console.log(`[ScraperAPI] 📦 Starting batch scrape for ${asins.length} ASINs`);

  for (let i = 0; i < asins.length; i++) {
    const asin = asins[i];

    try {
      const price = await scrapeAmazonPriceWithScraperAPI(asin, region);
      results.push({
        asin,
        price,
        status: 'success'
      });
    } catch (error) {
      results.push({
        asin,
        price: '',
        status: 'failed',
        error: error.message
      });
    }

    // Delay between requests
    if (i < asins.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  const successful = results.filter(r => r.status === 'success').length;
  console.log(`[ScraperAPI] ✅ Batch complete: ${successful}/${asins.length} successful`);

  return results;
}
