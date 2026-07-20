import axios from 'axios';
import { trackApiUsage } from './apiUsageTracker.js';
import pLimit from 'p-limit';

/**
 * Scrapingdog - Complete Product Data Extraction
 * Uses the Amazon Product API endpoint for clean JSON extraction
 *
 * Returns the exact same object shape as scrapeAmazonProductWithScraperAPI
 * (scraperApiProduct.js) so fetchAmazonData can switch providers via the
 * AMAZON_PRODUCT_PROVIDER env var with zero downstream changes.
 *
 * IMPORTANT: the Scrapingdog account concurrency cap (~50) is SHARED with the
 * Amazon Stock Check feature (SCRAPINGDOG_CONCURRENT, default 40, whose runs
 * last days). Keep this pool small so precheck/preview traffic doesn't starve
 * a live stock check run (and vice versa).
 */

const SCRAPINGDOG_PRODUCT_BASE = 'https://api.scrapingdog.com/amazon/product';

const CONCURRENT_REQUESTS = parseInt(process.env.SCRAPINGDOG_PRODUCT_CONCURRENT) || 40;
const limit = pLimit(CONCURRENT_REQUESTS);

console.log(`[Scrapingdog] 🚀 Initialized with ${CONCURRENT_REQUESTS} concurrent request limit`);

// Delay before the single fresh re-fetch when a priced product's response is
// missing ALL stock/delivery info (Amazon's buy-box widgets sometimes don't
// render before the page is captured — same phenomenon as the stock check's
// unknown_stock_text case, where one delayed retry usually resolves it).
const AVAILABILITY_RETRY_DELAY_MS = Math.max(500, parseInt(process.env.SCRAPINGDOG_AVAILABILITY_RETRY_DELAY_MS) || 5000);

// Scrapingdog keys requests by domain + country (not tld). Credits mirror the
// per-country cost table used by amazonStockChecks.js.
const REGION_CONFIG = {
  US: { domain: 'com', country: 'us', credits: 1 },
  UK: { domain: 'co.uk', country: 'gb', credits: 5 },
  CA: { domain: 'ca', country: 'ca', credits: 5 },
  AU: { domain: 'com.au', country: 'au', credits: 5 }
};

/**
 * Get API key from environment
 */
function getApiKey() {
  const key = process.env.SCRAPINGDOG_API_KEY;
  if (!key) {
    throw new Error('SCRAPINGDOG_API_KEY environment variable not set. Please add it to .env file.');
  }
  return key;
}

/**
 * Clean text by removing invisible characters and extra whitespace
 */
function cleanText(str) {
  return (str || '')
    .replace(/[‎‏‪-‮﻿]/g, '')
    .replace(/Â£/g, '£')
    .replace(/Â€/g, '€')
    .replace(/Â¥/g, '¥')
    .replace(/Â/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scrapingdog's product_information keys are Title Case with spaces
 * ("Compatible Phone Models", "Model Number", "Enclosure Material").
 * Normalize them to snake_case so one fallback chain covers both this
 * naming family and ScraperAPI-style keys.
 */
function normalizeProductInformation(productInformation) {
  if (!productInformation || typeof productInformation !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(productInformation)) {
    normalized[key.toLowerCase().replace(/\s+/g, '_')] = value;
  }
  return normalized;
}

/**
 * Extract price from Scrapingdog response.
 *
 * Scrapingdog's price can be polluted text like "$16.94 with 15 percent
 * savings" — even their own extracted_price naively globs the "15" into
 * 16.9415. Take only the FIRST currency-amount token, so downstream
 * parseFloat(price.replace(...)) stays correct. Returns a symbol-less
 * numeric string ("16.94"), matching the ScraperAPI contract.
 */
function extractPrice(data) {
  const candidates = [
    data.price,
    data.purchase_options?.single_offer?.price,
    data.previous_price
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const match = String(candidate).match(/\d[\d,]*(?:\.\d{1,2})?/);
    if (!match) continue;
    const price = match[0].replace(/,/g, '');
    if (price && !isNaN(parseFloat(price))) {
      return price;
    }
  }

  return '';
}

/**
 * Extract product images from Scrapingdog response.
 *
 * data.images is a whole-page harvest (can be 200+ URLs including unrelated
 * products) — the actual product gallery is images_of_specified_asin. Only
 * fall back to main_image / images when that is missing.
 */
function extractImages(data) {
  if (Array.isArray(data.images_of_specified_asin) && data.images_of_specified_asin.length > 0) {
    return data.images_of_specified_asin.slice(0, 6);
  }
  if (data.main_image) {
    return [data.main_image];
  }
  if (Array.isArray(data.images) && data.images.length > 0) {
    return data.images.slice(0, 6);
  }
  return [];
}

/**
 * Extract color from normalized product_information / customization_options
 */
function extractColor(info, data) {
  if (info.color) return String(info.color);
  if (info.colour) return String(info.colour);

  if (Array.isArray(data.customization_options?.color)) {
    const selected = data.customization_options.color.find(c => c.is_selected);
    if (selected?.value) return selected.value;
  }
  if (Array.isArray(data.customization_options?.colour_name)) {
    const selected = data.customization_options.colour_name.find(c => c.is_selected);
    if (selected?.value) return selected.value;
  }

  return '';
}

/**
 * Extract compatibility from normalized product_information
 */
function extractCompatibility(info) {
  const candidates = [
    info.compatible_phone_models,
    info.compatible_devices,
    info.compatible_cellular_phone_models,
    info.compatibility
  ];
  for (const v of candidates) {
    if (v) return Array.isArray(v) ? v.join(', ') : String(v);
  }
  return '';
}

/**
 * Extract model number from normalized product_information
 */
function extractModel(info) {
  const candidates = [
    info.model_number,
    info.model_name,
    info.mfr_part_number,
    info.item_model_number,
    info.manufacturer_part_number
  ];
  for (const v of candidates) {
    if (v) return String(v);
  }
  return '';
}

/**
 * Extract material from normalized product_information
 */
function extractMaterial(info) {
  const candidates = [
    info.enclosure_material,
    info.material,
    info.material_type,
    info.material_composition,
    info.outer_material
  ];
  for (const v of candidates) {
    if (v) return String(v);
  }
  return '';
}

/**
 * Extract special features from normalized product_information
 */
function extractSpecialFeatures(info) {
  const candidates = [info.additional_features, info.special_features, info.special_feature];
  for (const v of candidates) {
    if (v) return Array.isArray(v) ? v.join(', ') : String(v);
  }
  return '';
}

/**
 * Extract size from normalized product_information / customization_options
 */
function extractSize(info, data) {
  const candidates = [info.screen_size, info.size, info.item_size, info.item_dimensions];
  for (const v of candidates) {
    if (v) return String(v);
  }
  if (Array.isArray(data.customization_options?.size)) {
    const selected = data.customization_options.size.find(s => s.is_selected);
    if (selected?.value) return selected.value;
  }
  return '';
}

/**
 * Slim the raw response before caching/returning. Scrapingdog responses are
 * much larger than ScraperAPI's (page-wide images array, aplus media blocks,
 * review snippets) and rawData flows into the in-memory ASIN cache and SSE
 * preview payloads. Everything read downstream (product_information,
 * average_rating, total_reviews, availability_status, shipping_info,
 * delivery) is kept.
 */
function slimRawData(data) {
  const slim = { ...data };
  delete slim.images;
  delete slim.aplus;
  delete slim.aplus_images;
  delete slim.brand_images;
  delete slim.media_block;
  delete slim.customer_reviews;

  // rawData.product_information is consumed downstream against the ScraperAPI
  // shape (snake_case keys, nested customer_reviews.{stars, ratings_count}):
  // AsinReviewModal's Product Information panel + its skip-key set, the Rating
  // row, and the AI prompt placeholder in asinAutofill. Rewrite it to that
  // shape so both providers look identical past this point.
  const info = normalizeProductInformation(slim.product_information);
  // "Customer Reviews" usually normalizes to the right nested object already
  // ({stars, ratings_count}); synthesize it from the top-level fields when
  // product_information is missing or carries a different shape
  if (!(info.customer_reviews && typeof info.customer_reviews === 'object' && info.customer_reviews.stars)
      && (data.average_rating || data.total_reviews || data.total_ratings)) {
    info.customer_reviews = {
      stars: data.average_rating ?? null,
      ratings_count: data.total_reviews ?? data.total_ratings ?? null
    };
  }
  if (Object.keys(info).length > 0) {
    slim.product_information = info;
  }

  return slim;
}

/**
 * True when the response carries COMPLETE availability information:
 * - stock text present (availability_status / single_offer.stock), AND
 * - delivery info present (shipping_info / delivery) — except for
 *   out-of-stock products, where Amazon's page legitimately shows no
 *   delivery date, so stock text alone is complete.
 * Anything less on a priced product means a buy-box widget didn't render in
 * time — worth one fresh re-fetch before showing "Unknown" in the precheck.
 */
function hasAvailabilitySignals(data) {
  const stockText = String(
    data?.availability_status || data?.purchase_options?.single_offer?.stock || ''
  ).trim().toLowerCase();
  if (!stockText) return false;

  const outOfStock = stockText.includes('unavailable') || stockText.includes('out of stock');
  if (outOfStock) return true;

  return Boolean(
    data?.shipping_info
    || (Array.isArray(data?.delivery) && data.delivery.length > 0)
    || (Array.isArray(data?.purchase_options?.single_offer?.delivery) && data.purchase_options.single_offer.delivery.length > 0)
  );
}

/**
 * Main function - Scrape complete Amazon product data using Scrapingdog
 * With intelligent retry and exponential backoff
 * @param {string} asin - Amazon ASIN
 * @param {string} region - Amazon region (US, UK, CA, AU)
 * @param {number} retries - Retry attempts (default: 2)
 * @returns {Promise<Object>} - Complete product data (same shape as ScraperAPI client)
 */
export async function scrapeAmazonProductWithScrapingdog(asin, region = 'US', retries = 2) {
  return limit(async () => {
    const apiKey = getApiKey();
    const regionConfig = REGION_CONFIG[region] || REGION_CONFIG.US;
    // Short timeouts proved to cause false failures at scale — keep generous.
    const timeout = parseInt(process.env.SCRAPINGDOG_PRODUCT_TIMEOUT_MS) || 45000;
    const maxRetries = parseInt(process.env.SCRAPINGDOG_PRODUCT_MAX_RETRIES) || retries;

    // One-shot fresh re-fetch when stock/delivery info is missing — tracked
    // outside the loop so it can only ever fire once per ASIN.
    let availabilityRetryAttempted = false;
    let availabilityRetryBilled = false;
    let availabilityRetrySucceeded = false;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        console.log(`[Scrapingdog] 🔍 Scraping ASIN: ${asin}${attempt > 1 ? ` (attempt ${attempt}/${maxRetries})` : ''}`);

        // NEVER send postal_code: it was the confirmed root cause of a mass
        // 400-error wave on the stock check flow (Scrapingdog support advised
        // removing it). Params stay api_key/domain/country/asin only.
        const response = await axios.get(SCRAPINGDOG_PRODUCT_BASE, {
          params: {
            api_key: apiKey,
            domain: regionConfig.domain,
            country: regionConfig.country,
            asin: asin
          },
          timeout
        });

        if (response.status !== 200) {
          throw new Error(`Scrapingdog returned status ${response.status}`);
        }

        let data = response.data;

        // A priced product with NO availability_status / stock / shipping /
        // delivery at all = the buy-box widgets didn't render before capture
        // (the precheck would show Unknown). Re-fetch once after a short
        // delay and prefer the retry only if it actually has the signals.
        // This client sits BELOW the ASIN cache, so this is always a real
        // Scrapingdog call, never a cached response.
        if (!availabilityRetryAttempted
            && !hasAvailabilitySignals(data)
            && (data.price || data.purchase_options?.single_offer?.price)) {
          availabilityRetryAttempted = true;
          console.log(`[Scrapingdog] 🔄 Missing stock and/or delivery info for ${asin} — refetching once after ${AVAILABILITY_RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, AVAILABILITY_RETRY_DELAY_MS));
          try {
            const retryResponse = await axios.get(SCRAPINGDOG_PRODUCT_BASE, {
              params: {
                api_key: apiKey,
                domain: regionConfig.domain,
                country: regionConfig.country,
                asin: asin
              },
              timeout
            });
            if (retryResponse.status === 200) {
              availabilityRetryBilled = true;
              if (hasAvailabilitySignals(retryResponse.data)) {
                data = retryResponse.data;
                availabilityRetrySucceeded = true;
                console.log(`[Scrapingdog] ✅ Stock/delivery info found for ${asin} on retry`);
              } else {
                console.warn(`[Scrapingdog] ⚠️ Still no stock/delivery info for ${asin} after retry — keeping first response`);
              }
            }
          } catch (retryError) {
            console.warn(`[Scrapingdog] ⚠️ Availability retry failed for ${asin}: ${retryError.message} — keeping first response`);
          }
        }

        const responseTime = Date.now() - startTime;

        // Extract product data (brand/product_information are absent on some
        // products, e.g. unavailable listings — all extractors tolerate that)
        const info = normalizeProductInformation(data.product_information);
        const title = cleanText(data.title || '');
        // Top-level brand is often missing even when product_information.Brand
        // exists (e.g. B01N5IB20Q) — fall back so we don't report 'Unbranded'
        // where ScraperAPI reports the real brand
        const rawBrand = data.brand || info.brand || '';
        const brand = cleanText(String(rawBrand).replace(/^Visit the /, '').replace(/ Store$/, '').replace(/^Brand:\s*/i, ''));
        const price = extractPrice(data);

        // feature_bullets first (matches ScraperAPI), then the prose
        // description field — mirrors ScraperAPI's full_description fallback
        const features = data.feature_bullets || [];
        let description = features.join('\n');
        if (!description) {
          if (data.description) {
            description = cleanText(String(data.description));
            console.log(`[Scrapingdog] ℹ️ Used fallback description for ${asin}`);
          } else {
            console.warn(`[Scrapingdog] ⚠️ No description found for ${asin}. Top-level keys: ${Object.keys(data).join(', ')}`);
          }
        }

        const color = extractColor(info, data);
        const compatibility = extractCompatibility(info);
        const model = extractModel(info);
        const material = extractMaterial(info);
        const specialFeatures = extractSpecialFeatures(info);
        const size = extractSize(info, data);
        const images = extractImages(data);

        // Validate critical fields
        if (!price) {
          if (attempt < maxRetries) {
            const backoffDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
            console.warn(`[Scrapingdog] ⚠️ No price found for ${asin}, retrying after ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          }
          console.warn(`[Scrapingdog] ⚠️ No price found for ASIN: ${asin}`);
          throw new Error('NO_PRICE_FOUND');
        }

        console.log(`[Scrapingdog] ✅ Title found for ${asin}: "${title.substring(0, 60)}..."`);
        console.log(`[Scrapingdog] ✅ Brand found for ${asin}: "${brand}"`);
        console.log(`[Scrapingdog] ✅ Description found for ${asin}: ${features.length} features`);
        console.log(`[Scrapingdog] ✅ Images found for ${asin}: ${images.length} images`);
        if (color) console.log(`[Scrapingdog] ✅ Color found for ${asin}: "${color}"`);
        if (compatibility) console.log(`[Scrapingdog] ✅ Compatibility found for ${asin}: "${compatibility}"`);
        if (images.length > 0) {
          console.log(`[Scrapingdog] 🖼️ First image: ${images[0].substring(0, 80)}...`);
        }

        // Track successful usage
        const extractedFields = ['price', 'title', 'brand', 'description', 'images'];
        if (color) extractedFields.push('color');
        if (compatibility) extractedFields.push('compatibility');
        if (model) extractedFields.push('model');
        if (material) extractedFields.push('material');
        if (specialFeatures) extractedFields.push('specialFeatures');
        if (size) extractedFields.push('size');

        trackApiUsage({
          service: 'Scrapingdog',
          asin,
          creditsUsed: regionConfig.credits * (availabilityRetryBilled ? 2 : 1),
          success: true,
          responseTime,
          extractedFields
        }).catch(err => console.error('[Usage Tracker] Failed to track:', err.message));

        console.log(`[Scrapingdog] ✅ Successfully scraped all data for ${asin} in ${responseTime}ms`);

        return {
          asin,
          title: title || 'Unknown Product',
          price: price || '',
          brand: brand || 'Unbranded',
          description: description || '',
          // Present only when the missing-stock-info re-fetch ran — lets the
          // precheck flow count retries and their success rate.
          availabilityRetry: availabilityRetryAttempted
            ? { attempted: true, succeeded: availabilityRetrySucceeded }
            : null,
          images: images,
          color: color || '',
          compatibility: compatibility || '',
          model: model || '',
          material: material || '',
          specialFeatures: specialFeatures || '',
          size: size || '',
          rawData: slimRawData(data)
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;

        // 400/404/410 are permanent (bad request / product gone), 429 is the
        // account concurrency/credit cap (retrying just burns credits — same
        // policy as the ScraperAPI client). Timeouts and 5xx are retryable.
        const status = error.response?.status;
        const isRetryable = ![400, 404, 410, 429].includes(status) && error.message !== 'NO_PRICE_FOUND';

        if (isRetryable && attempt < maxRetries) {
          const backoffDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          console.warn(`[Scrapingdog] ⚠️ Attempt ${attempt} failed for ${asin}: ${error.message}`);
          console.log(`[Scrapingdog] 🔄 Retrying after ${backoffDelay}ms (exponential backoff)...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }

        // Track failed usage
        trackApiUsage({
          service: 'Scrapingdog',
          asin,
          creditsUsed: regionConfig.credits,
          success: false,
          errorMessage: error.message,
          responseTime,
          extractedFields: []
        }).catch(err => console.error('[Usage Tracker] Failed to track:', err.message));

        console.error(`[Scrapingdog] ❌ Failed to scrape ASIN ${asin} after ${attempt} attempt(s):`, error.message);
        throw error;
      }
    }
  });
}
