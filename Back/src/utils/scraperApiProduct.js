import axios from 'axios';
import { trackApiUsage } from './apiUsageTracker.js';
import pLimit from 'p-limit';
import { scrapeAmazonPriceWithScraperAPI } from './scraperApiPrice.js';

/**
 * ScraperAPI - Complete Product Data Extraction
 * Uses Structured Data API endpoint for clean JSON extraction
 * 
 * Optimized with p-limit for concurrent requests
 * ScraperAPI Plan: 20 concurrent requests available
 */

const SCRAPER_API_BASE = 'https://api.scraperapi.com/structured/amazon/product/v1';

// Concurrency limiter - use 15 of 20 available concurrent requests
const CONCURRENT_REQUESTS = parseInt(process.env.SCRAPER_API_CONCURRENT) || 15;
const limit = pLimit(CONCURRENT_REQUESTS);

console.log(`[ScraperAPI] 🚀 Initialized with ${CONCURRENT_REQUESTS} concurrent request limit`);

/**
 * Get API key from environment
 */
function getApiKey() {
  const key = process.env.SCRAPER_API_KEY;
  if (!key || key === 'your_api_key_here_after_signup') {
    throw new Error('SCRAPER_API_KEY environment variable not set. Please add it to .env file.');
  }
  return key;
}

/**
 * Clean text by removing invisible characters and extra whitespace
 */
function cleanText(str) {
  return (str || '')
    .replace(/[\u200e\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/Â£/g, '£')
    .replace(/Â€/g, '€')
    .replace(/Â¥/g, '¥')
    .replace(/Â/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeValue(value, separator = ', ') {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .join(separator);
  }
  if (typeof value === 'number') return String(value);
  return String(value).trim();
}

/**
 * ScraperAPI `small_description` sometimes includes a spec header and then
 * an "About this item" section separated by pipes.
 * Return only the human-readable bullets from that section, one per line.
 */
function extractDescriptionFromSmallDescription(smallDescription) {
  const raw = cleanText(smallDescription || '');
  if (!raw) return '';

  // Split into segments while preserving natural sentence spacing.
  const segments = raw
    .split('|')
    .map(s => cleanText(s))
    .filter(Boolean);
  if (!segments.length) return raw;

  const aboutIdx = segments.findIndex(s => /^about this item$/i.test(s));
  const fromAbout = aboutIdx >= 0 ? segments.slice(aboutIdx + 1) : segments;

  // Drop spec-like leading rows when "About this item" is missing.
  const content = aboutIdx >= 0
    ? fromAbout
    : fromAbout.filter(s => !/^[a-z][a-z0-9\s/_-]{1,60}:\s*.+/i.test(s));

  return content.join('\n').trim() || raw;
}

/** Top-line brand varies: "Visit the X Store", "Brand: X", or only product_information.brand_name */
function extractStructuredBrand(data) {
  if (!data) return '';
  let fromByline = data.brand || '';
  fromByline = fromByline
    .replace(/^Visit the /i, '')
    .replace(/ Store$/i, '')
    .replace(/^Brand:\s*/i, '')
    .trim();
  const cleaned = cleanText(fromByline);
  if (cleaned) return cleaned;
  return cleanText(
    data.product_information?.brand_name ||
      data.product_information?.brand ||
      ''
  );
}

/**
 * Extract price from structured API response
 */
function extractPriceFromStructured(data) {
  // Try pricing field first
  if (data.pricing) {
    const price = data.pricing.replace(/^\$/, '');
    if (price && !isNaN(parseFloat(price))) {
      return price;
    }
  }
  
  // Try list_price as fallback
  if (data.list_price) {
    const price = data.list_price.replace(/^\$/, '');
    if (price && !isNaN(parseFloat(price))) {
      return price;
    }
  }
  
  return '';
}

/**
 * Extract color from structured API response
 */
function extractColor(data) {
  if (!data) return '';

  // Prefer selected variant color (product_information.color is often a kit/SKU label)
  if (data.customization_options?.color && Array.isArray(data.customization_options.color)) {
    const selectedColor = data.customization_options.color.find(c => c.is_selected);
    if (selectedColor?.value) {
      return selectedColor.value;
    }
  }

  if (data.product_information?.color) {
    return String(data.product_information.color);
  }

  return '';
}

/**
 * Kit / bundle contents from structured API (product_information.included_components)
 */
function extractIncludedComponents(data) {
  if (!data) return '';
  const pi = data.product_information || {};
  const v = pi.included_components ?? pi.includedComponents;
  if (v == null || v === '') return '';
  return normalizeValue(v);
}

/**
 * Extract compatibility from structured API response
 */
function extractCompatibility(data) {
  if (!data) return '';

  if (data.product_information?.compatible_with_vehicle_type) {
    return normalizeValue(data.product_information.compatible_with_vehicle_type);
  }
  if (data.product_information?.fit_type) {
    return normalizeValue(data.product_information.fit_type);
  }
  if (data.product_information?.automotive_fit_type) {
    return normalizeValue(data.product_information.automotive_fit_type);
  }
  // Try dedicated compatible_devices / compatible_phone_models fields
  if (data.product_information?.compatible_devices) {
    const v = data.product_information.compatible_devices;
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  if (data.product_information?.compatible_phone_models) {
    const v = data.product_information.compatible_phone_models;
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  if (data.product_information?.compatibility) {
    return String(data.product_information.compatibility);
  }

  // Title fallback (common for automotive accessories)
  const nameText = normalizeValue(data.name || '');
  const compatibleWithMatch = nameText.match(/compatible with\s+(.+?)(?:,|\(|-|\||$)/i);
  if (compatibleWithMatch?.[1]) {
    return compatibleWithMatch[1].trim();
  }

  // Prose fallback (common on automotive/covers/accessories)
  const text = normalizeValue(
    data.small_description || data.full_description || data.name || ''
  ).toLowerCase();
  if (text.includes('universal fit')) return 'Universal Fit';
  if (text.includes('universal compatibility')) return 'Universal';

  return '';
}

/**
 * Extract model number from structured API response
 */
function extractModel(data) {
  if (!data) return '';

  if (data.product_information?.model_number) {
    return String(data.product_information.model_number);
  }
  // Most reliable: product_information.item_model_number
  if (data.product_information?.item_model_number) {
    return String(data.product_information.item_model_number);
  }
  // Top-level model field
  if (data.model) {
    return String(data.model);
  }
  // MPN as fallback
  if (data.product_information?.manufacturer_part_number) {
    return String(data.product_information.manufacturer_part_number);
  }

  return '';
}

/**
 * Extract material from structured API response
 */
function extractMaterial(data) {
  if (!data) return '';

  if (data.product_information?.material) {
    return String(data.product_information.material);
  }
  if (data.product_information?.material_type) {
    return String(data.product_information.material_type);
  }
  if (data.product_information?.material_composition) {
    return String(data.product_information.material_composition);
  }
  if (data.product_information?.outer_material) {
    return String(data.product_information.outer_material);
  }
  if (data.product_information?.enclosure_material) {
    return String(data.product_information.enclosure_material);
  }

  // Fallback for categories where material is only mentioned in prose.
  const materialText = normalizeValue(
    data.small_description || data.full_description || data.name || ''
  ).toLowerCase();
  const materialMatch = materialText.match(
    /\b(leather|genuine leather|crazy horse leather|oxford fabric|nylon|silicone|rubber|stainless steel|canvas|metal|carbon fiber|fiberglass)\b/
  );
  if (materialMatch) {
    return materialMatch[0];
  }

  return '';
}

/**
 * Extract special features from structured API response
 */
function extractSpecialFeatures(data) {
  if (!data) return '';

  if (data.product_information?.additional_features) {
    return normalizeValue(data.product_information.additional_features);
  }
  if (data.product_information?.special_features) {
    const v = data.product_information.special_features;
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  if (data.product_information?.special_feature) {
    const v = data.product_information.special_feature;
    return Array.isArray(v) ? v.join(', ') : String(v);
  }
  if (data.product_information?.other_special_features_of_the_product) {
    return normalizeValue(data.product_information.other_special_features_of_the_product);
  }

  // Category-specific specs (automotive, covers, etc.) — Amazon key names vary by vertical
  const pi = data.product_information || {};
  const parts = [];
  if (pi.item_type_name) parts.push(String(pi.item_type_name));
  if (pi.closure_type) parts.push(`Closure: ${pi.closure_type}`);
  if (pi.fit_type) parts.push(`Fit: ${pi.fit_type}`);
  if (pi.automotive_fit_type && pi.automotive_fit_type !== pi.fit_type) {
    parts.push(`Automotive fit: ${pi.automotive_fit_type}`);
  }
  if (pi.ultraviolet_light_protection) parts.push(`UV: ${pi.ultraviolet_light_protection}`);
  if (pi.water_resistance_level) parts.push(`Water: ${pi.water_resistance_level}`);
  if (parts.length) return parts.join(' | ');

  // Sporting / fishing — Amazon uses fishing_* keys on rod & reel listings
  if (pi.fishing_technique || pi.fishing_rod_power || pi.target_species) {
    const fp = [];
    if (pi.fishing_technique) fp.push(`Technique: ${pi.fishing_technique}`);
    if (pi.target_species) fp.push(`Target: ${pi.target_species}`);
    if (pi.fishing_rod_power) fp.push(`Rod power: ${pi.fishing_rod_power}`);
    if (pi.rod_length) fp.push(`Rod length: ${pi.rod_length}`);
    if (pi.line_weight) fp.push(`Line weight: ${pi.line_weight}`);
    if (pi.fishing_line_type) fp.push(`Line type: ${pi.fishing_line_type}`);
    if (pi.line_capacity) fp.push(`Line capacity: ${pi.line_capacity}`);
    if (pi.gearbox_ratio) fp.push(`Gear ratio: ${pi.gearbox_ratio}`);
    if (pi.hand_orientation) fp.push(`Hand: ${pi.hand_orientation}`);
    if (fp.length) return fp.join(' | ');
  }

  return '';
}

/**
 * Extract size from structured API response
 */
function extractSize(data) {
  if (!data) return '';

  if (data.product_information?.size) {
    return String(data.product_information.size);
  }
  if (data.product_information?.item_size) {
    return String(data.product_information.item_size);
  }
  if (data.product_information?.coverage) {
    return String(data.product_information.coverage);
  }
  if (data.product_information?.item_dimensions) {
    return String(data.product_information.item_dimensions);
  }
  if (data.product_information?.item_dimensions_l_x_w_x_h) {
    return String(data.product_information.item_dimensions_l_x_w_x_h);
  }
  if (data.product_information?.product_dimensions) {
    return String(data.product_information.product_dimensions);
  }
  // Customization size option (variant selector)
  if (data.customization_options?.size && Array.isArray(data.customization_options.size)) {
    const selected = data.customization_options.size.find(s => s.is_selected);
    if (selected?.value) return selected.value;
  }

  // Some categories (e.g. grill covers) store variant size text in "style".
  if (data.customization_options?.style && Array.isArray(data.customization_options.style)) {
    const styleOptions = data.customization_options.style;
    const selectedStyle =
      styleOptions.find(s => s.is_selected && s?.value) ||
      styleOptions.find(s => s?.asin && data.asin && s.asin === data.asin && s?.value);
    if (selectedStyle?.value) return selectedStyle.value;
  }

  // Some products expose size ranges only in title/small_description.
  const sizeText = normalizeValue(data.small_description || data.name || '');
  const mmRange = sizeText.match(/\b\d{1,2}\s*mm(?:[^\n]{0,40}\b\d{1,2}\s*mm)+\b/i);
  if (mmRange) {
    return mmRange[0].replace(/\s+/g, ' ').trim();
  }

  return '';
}

function extractFormFactor(data) {
  if (!data) return '';
  return normalizeValue(data.product_information?.form_factor);
}

function extractScreenSize(data) {
  if (!data) return '';
  return normalizeValue(data.product_information?.screen_size);
}

function extractBandColor(data) {
  if (!data) return '';
  const color = extractColor(data);
  if (color) return color;
  return normalizeValue(data.product_information?.band_color);
}

function extractBandMaterial(data) {
  if (!data) return '';
  const pi = data.product_information || {};
  if (pi.band_material_type) return normalizeValue(pi.band_material_type);
  if (pi.band_material) return normalizeValue(pi.band_material);
  return extractMaterial(data);
}

function extractBandWidth(data) {
  if (!data) return '';
  const pi = data.product_information || {};
  if (pi.band_width) return normalizeValue(pi.band_width);
  if (pi.band_size) return normalizeValue(pi.band_size);

  // Common watch-band fallback from title/short text (e.g., 14mm ... 24mm)
  const text = normalizeValue(data.small_description || data.name || '');
  const rangeMatch = text.match(/\b\d{1,2}\s*mm(?:[^\n]{0,40}\b\d{1,2}\s*mm)+\b/i);
  if (rangeMatch) return rangeMatch[0].replace(/\s+/g, ' ').trim();
  const singleMatch = text.match(/\b\d{1,2}\s*mm\b/i);
  if (singleMatch) return singleMatch[0].replace(/\s+/g, ' ').trim();
  return '';
}

/**
 * Extract title from Amazon HTML (DEPRECATED - now using structured API)
 */
function extractTitle(html, asin) {
  const selectors = [
    // Primary - most common
    /<span id="productTitle"[^>]*>([^<]+)<\/span>/i,
    // Fallbacks
    /<h1[^>]*id="title"[^>]*>([^<]+)<\/h1>/i,
    /<span[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)<\/span>/i,
    // Mobile layout
    /<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)<\/h1>/i
  ];
  
  for (const selector of selectors) {
    const match = html.match(selector);
    if (match && match[1]) {
      const title = cleanText(match[1]);
      if (title.length > 5) {
        console.log(`[ScraperAPI] ✅ Title found for ${asin}: "${title.substring(0, 60)}..."`);
        return title;
      }
    }
  }
  
  console.warn(`[ScraperAPI] ⚠️ No title found for ${asin}`);
  return 'Unknown Product';
}

/**
 * Extract brand from Amazon HTML
 */
function extractBrand(html, asin) {
  const selectors = [
    // bylineInfo link - most common
    /<a id="bylineInfo"[^>]*>(?:Visit the )?([^<]+?)(?:\s+(?:Store|Storefront))?<\/a>/i,
    // Brand in product details table
    /<tr[^>]*class="[^"]*po-brand[^"]*"[\s\S]{0,200}<td[^>]*class="a-span9"[^>]*>([^<]+)<\/td>/i,
    // Inline brand
    /<span>Brand:\s*<strong>([^<]+)<\/strong><\/span>/i,
    // Meta tag
    /<meta[^>]*property="og:brand"[^>]*content="([^"]+)"/i,
    // Alternative byline format
    /<span[^>]*class="[^"]*author[^"]*"[^>]*>(?:by\s+)?([^<]+)<\/span>/i
  ];
  
  for (const selector of selectors) {
    const match = html.match(selector);
    if (match && match[1]) {
      const brand = cleanText(match[1]);
      if (brand.length > 0 && !brand.toLowerCase().includes('unknown')) {
        console.log(`[ScraperAPI] ✅ Brand found for ${asin}: "${brand}"`);
        return brand;
      }
    }
  }
  
  console.warn(`[ScraperAPI] ⚠️ No brand found for ${asin}`);
  return 'Unbranded';
}

/**
 * Extract description/features from Amazon HTML
 */
function extractDescription(html, asin) {
  const features = [];
  
  // Method 1: Feature bullets (most common)
  const featureBulletsRegex = /<div id="feature-bullets"[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i;
  const bulletsMatch = html.match(featureBulletsRegex);
  
  if (bulletsMatch && bulletsMatch[1]) {
    const listItems = bulletsMatch[1].match(/<li[^>]*>[\s\S]*?<span[^>]*class="a-list-item"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/gi);
    if (listItems) {
      listItems.forEach(li => {
        const textMatch = li.match(/<span[^>]*class="a-list-item"[^>]*>([\s\S]*?)<\/span>/i);
        if (textMatch && textMatch[1]) {
          const feature = cleanText(textMatch[1].replace(/<[^>]+>/g, ''));
          if (feature.length > 5 && !feature.toLowerCase().includes('see more product details')) {
            features.push(feature);
          }
        }
      });
    }
  }
  
  // Method 2: Alternative bullet format
  if (features.length === 0) {
    const altBulletsRegex = /<div[^>]*class="[^"]*a-section[^"]*feature[^"]*"[^>]*>[\s\S]*?<ul>([\s\S]*?)<\/ul>/i;
    const altMatch = html.match(altBulletsRegex);
    if (altMatch && altMatch[1]) {
      const listItems = altMatch[1].match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
      if (listItems) {
        listItems.forEach(li => {
          const feature = cleanText(li.replace(/<[^>]+>/g, ''));
          if (feature.length > 5) {
            features.push(feature);
          }
        });
      }
    }
  }
  
  // Method 3: Product description paragraph (fallback)
  if (features.length === 0) {
    const descRegex = /<div id="productDescription"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i;
    const descMatch = html.match(descRegex);
    if (descMatch && descMatch[1]) {
      const desc = cleanText(descMatch[1].replace(/<[^>]+>/g, ''));
      if (desc.length > 10) {
        features.push(desc);
      }
    }
  }
  
  const description = features.join('\n');
  console.log(`[ScraperAPI] ✅ Description found for ${asin}: ${features.length} features`);
  return description || '';
}

/**
 * Extract images from Amazon HTML
 */
function extractImages(html, asin) {
  let images = [];
  
  // Method 1: Extract from 'colorImages' JSON in script tag (best quality, all gallery images)
  const colorImagesRegex = /"colorImages":\s*\{[^}]*?"initial":\s*\[([\s\S]*?)\]\s*\}/i;
  const colorMatch = html.match(colorImagesRegex);
  if (colorMatch && colorMatch[1]) {
    console.log(`[ScraperAPI] 🔍 Found colorImages JSON for ${asin}`);
    // Try hiRes first (highest quality)
    const hiResMatches = colorMatch[1].matchAll(/"hiRes":\s*"([^"]+)"/gi);
    for (const match of hiResMatches) {
      const imageUrl = match[1];
      if (imageUrl && imageUrl.startsWith('http') && !images.includes(imageUrl)) {
        images.push(imageUrl);
      }
    }
    console.log(`[ScraperAPI] 📸 Extracted ${images.length} images from hiRes`);
    
    // If no hiRes, try 'large'
    if (images.length === 0) {
      const largeMatches = colorMatch[1].matchAll(/"large":\s*"([^"]+)"/gi);
      for (const match of largeMatches) {
        const imageUrl = match[1];
        if (imageUrl && imageUrl.startsWith('http') && !images.includes(imageUrl)) {
          images.push(imageUrl);
        }
      }
      console.log(`[ScraperAPI] 📸 Extracted ${images.length} images from large`);
    }
  }
  
  // Method 2: Extract from 'imageGalleryData' JSON (newer format)
  if (images.length === 0) {
    const galleryRegex = /"imageGalleryData":\s*\[([\s\S]*?)\]/i;
    const galleryMatch = html.match(galleryRegex);
    if (galleryMatch && galleryMatch[1]) {
      console.log(`[ScraperAPI] 🔍 Found imageGalleryData JSON for ${asin}`);
      const mainUrlMatches = galleryMatch[1].matchAll(/"mainUrl":\s*"([^"]+)"/gi);
      for (const match of mainUrlMatches) {
        const imageUrl = match[1].replace(/\\u0026/g, '&').replace(/\\\//g, '/');
        if (imageUrl && imageUrl.startsWith('http') && !images.includes(imageUrl)) {
          images.push(imageUrl);
        }
      }
      console.log(`[ScraperAPI] 📸 Extracted ${images.length} images from imageGalleryData`);
    }
  }
  
  // Method 3: Extract from altImages carousel (main product only)
  if (images.length === 0) {
    // Only extract from #altImages div (main product carousel)
    const altImagesRegex = /<div[^>]*id="altImages"[^>]*>([\s\S]*?)<\/div>/i;
    const altImagesMatch = html.match(altImagesRegex);
    
    if (altImagesMatch && altImagesMatch[1]) {
      console.log(`[ScraperAPI] 🔍 Found altImages section for ${asin}`);
      const imageMatches = altImagesMatch[1].matchAll(/data-old-hires="([^"]+)"/gi);
      for (const match of imageMatches) {
        const imageUrl = match[1];
        if (imageUrl && imageUrl.startsWith('http') && !images.includes(imageUrl)) {
          images.push(imageUrl);
        }
      }
      console.log(`[ScraperAPI] 📸 Extracted ${images.length} images from altImages`);
    }
  }
  
  // Method 4: Extract data-a-dynamic-image from MAIN PRODUCT GALLERY ONLY
  if (images.length === 0) {
    console.log(`[ScraperAPI] 🔍 Trying data-a-dynamic-image for ${asin}`);
    
    // CRITICAL: Only extract from main product image containers to avoid related products
    // Find the start of image block containers and search a reasonable scope from there
    const imageBlockStart = html.search(/<div[^>]*id="(?:altImages|imageBlock|imageBlock_feature_div|main-image-container)"/i);
    
    let searchScope = html; // Default to full HTML if no container found
    if (imageBlockStart !== -1) {
      // Search from container start to next 50000 characters (enough for image gallery, not entire page)
      searchScope = html.substring(imageBlockStart, imageBlockStart + 50000);
      console.log(`[ScraperAPI] 🎯 Scoped to main product image container area`);
    } else {
      console.log(`[ScraperAPI] ⚠️ No image container found, searching full HTML (may include related products)`);
    }
    
    const dynamicImageRegex = /data-a-dynamic-image="({[^"]+})"/gi;
    let dynamicMatch;
    const imagesByKey = new Map(); // Track unique image IDs
    
    while ((dynamicMatch = dynamicImageRegex.exec(searchScope)) !== null) {
      try {
        const imageData = JSON.parse(dynamicMatch[1].replace(/&quot;/g, '"'));
        for (const imageUrl of Object.keys(imageData)) {
          if (imageUrl && imageUrl.startsWith('http')) {
            // Extract image ID from URL (e.g., "71ToyHTZUQL" from "...I/71ToyHTZUQL._AC_...")
            const imageIdMatch = imageUrl.match(/\/images\/I\/([A-Za-z0-9+_-]+)\./);
            if (imageIdMatch) {
              const imageId = imageIdMatch[1];
              // Only keep the first URL for each unique image ID (usually highest quality)
              if (!imagesByKey.has(imageId)) {
                imagesByKey.set(imageId, imageUrl);
              }
            }
          }
        }
      } catch (e) {
        // Skip invalid JSON
      }
    }
    
    images = Array.from(imagesByKey.values());
    console.log(`[ScraperAPI] 📸 Extracted ${images.length} unique images from data-a-dynamic-image`);
  }
  
  // Method 5: Landing image with data-old-hires
  if (images.length === 0) {
    const landingImageRegex = /<img[^>]*id="landingImage"[^>]*data-old-hires="([^"]+)"/i;
    const landingMatch = html.match(landingImageRegex);
    if (landingMatch && landingMatch[1]) {
      images.push(landingMatch[1]);
      console.log(`[ScraperAPI] 📸 Extracted 1 image from landingImage`);
    }
  }
  
  // Method 6: Alternative main image src
  if (images.length === 0) {
    const imgSrcRegex = /<img[^>]*id="landingImage"[^>]*src="([^"]+)"/i;
    const imgMatch = html.match(imgSrcRegex);
    if (imgMatch && imgMatch[1]) {
      const imgUrl = imgMatch[1];
      if (imgUrl.startsWith('http') && !imgUrl.includes('data:image')) {
        images.push(imgUrl);
        console.log(`[ScraperAPI] 📸 Extracted 1 image from landingImage src`);
      }
    }
  }
  
  // Limit to first 6 images (Amazon product pages typically show 6 main images)
  if (images.length > 6) {
    images = images.slice(0, 6);
  }
  
  console.log(`[ScraperAPI] ✅ Images found for ${asin}: ${images.length} images`);
  if (images.length === 0) {
    console.warn(`[ScraperAPI] ⚠️ No images extracted for ${asin} - HTML might have different structure`);
  } else {
    console.log(`[ScraperAPI] 🖼️ First image: ${images[0].substring(0, 80)}...`);
    if (images.length > 1) {
      console.log(`[ScraperAPI] 🖼️ Last image: ${images[images.length - 1].substring(0, 80)}...`);
    }
  }
  return images;
}

/**
 * Extract price from Amazon HTML
 * Reuses existing patterns from scraperApiPrice.js
 */
function extractPriceFromHTML(html) {
  // Price selectors (same as original)
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
      // Extract just the price (remove currency symbol)
      const cleaned = rawPrice.replace(/^[^\d]+/, '').trim();
      if (cleaned && /[\d.,]+/.test(cleaned)) {
        return cleaned;
      }
    }
  }

  return null;
}

/**
 * Extract all product data from Amazon HTML
 */
function extractProductDataFromHTML(html, asin) {
  return {
    title: extractTitle(html, asin),
    brand: extractBrand(html, asin),
    description: extractDescription(html, asin),
    images: extractImages(html, asin),
    price: extractPriceFromHTML(html)
  };
}

/**
 * Main function - Scrape complete Amazon product data using ScraperAPI
 * With intelligent retry and exponential backoff
 * @param {string} asin - Amazon ASIN
 * @param {string} region - Amazon region (US, UK, CA, AU)
 * @param {number} retries - Retry attempts (default: 2)
 * @returns {Promise<Object>} - Complete product data
 */
export async function scrapeAmazonProductWithScraperAPI(asin, region = 'US', retries = 2) {
  return limit(async () => {
    const SCRAPER_API_KEY = getApiKey();
    const timeout = parseInt(process.env.SCRAPER_API_TIMEOUT_MS) || 30000;
    const maxRetries = parseInt(process.env.SCRAPER_API_MAX_RETRIES) || retries;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        console.log(`[ScraperAPI] 🔍 Scraping ASIN: ${asin}${attempt > 1 ? ` (attempt ${attempt}/${maxRetries})` : ''}`);

        // Use Structured Data API endpoint for clean JSON extraction
        const response = await axios.get(SCRAPER_API_BASE, {
          params: {
            api_key: SCRAPER_API_KEY,
            asin: asin,
            tld: region === 'UK' ? '.co.uk' : region === 'CA' ? '.ca' : region === 'AU' ? '.com.au' : '.com'
          },
          timeout
        });

        if (response.status !== 200) {
          throw new Error(`ScraperAPI returned status ${response.status}`);
        }

        const data = response.data;
        const responseTime = Date.now() - startTime;

        // Extract product data from structured JSON
        const title = cleanText(data.name || '');
        const brand = extractStructuredBrand(data);
        const price = extractPriceFromStructured(data);
        
        // Extract description — layered fallback chain:
        // 1. feature_bullets (bulleted list, best source)
        // 2. small_description (if provided by scraper)
        // 3. full_description (prose text from product description section)
        // 3. empty string (logged for debugging)
        const features = data.feature_bullets || [];
        let description = features.join('\n');
        if (!description) {
          if (data.small_description) {
            description = extractDescriptionFromSmallDescription(data.small_description);
            console.log(`[ScraperAPI] ℹ️ Used fallback small_description for ${asin}`);
          } else if (data.full_description) {
            description = cleanText(data.full_description);
            console.log(`[ScraperAPI] ℹ️ Used fallback full_description for ${asin}`);
          } else {
            // Debug: surface available top-level keys to identify new fallback fields
            console.warn(`[ScraperAPI] ⚠️ No description found for ${asin}. Top-level keys: ${Object.keys(data).join(', ')}`);
          }
        }
        
        // Extract color, compatibility and enrichment fields
        const color = extractColor(data);
        const compatibility = extractCompatibility(data);
        const model = extractModel(data);
        const material = extractMaterial(data);
        const specialFeatures = extractSpecialFeatures(data);
        const size = extractSize(data);
        const formFactor = extractFormFactor(data);
        const screenSize = extractScreenSize(data);
        const bandMaterial = extractBandMaterial(data);
        const bandWidth = extractBandWidth(data);
        const bandColor = extractBandColor(data);
        const includedComponents = extractIncludedComponents(data);
        
        // Use high_res_images if available, otherwise fall back to regular images
        // Take ONLY first 6 images (main product images, not all variants)
        let images = [];
        if (data.high_res_images && data.high_res_images.length > 0) {
          images = data.high_res_images.slice(0, 6);
          console.log(`[ScraperAPI] 📸 Using ${images.length} high-res images`);
        } else if (data.images && data.images.length > 0) {
          images = data.images.slice(0, 6);
          console.log(`[ScraperAPI] 📸 Using ${images.length} standard images`);
        }

        // Validate critical fields
        // Some structured responses omit pricing fields; fall back to HTML price scraper.
        let resolvedPrice = price;
        if (!resolvedPrice) {
          try {
            resolvedPrice = await scrapeAmazonPriceWithScraperAPI(asin, region, 2);
            if (resolvedPrice) {
              console.log(`[ScraperAPI] ℹ️ Price fallback succeeded for ${asin}: ${resolvedPrice}`);
            }
          } catch (fallbackErr) {
            console.warn(`[ScraperAPI] ⚠️ Price fallback failed for ${asin}: ${fallbackErr.message}`);
          }
        }

        if (!resolvedPrice) {
          if (attempt < maxRetries) {
            const backoffDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
            console.warn(`[ScraperAPI] ⚠️ No price found for ${asin}, retrying after ${backoffDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          }
          console.warn(`[ScraperAPI] ⚠️ No price found for ASIN: ${asin}`);
          throw new Error('NO_PRICE_FOUND');
        }

        // Log extraction results
        console.log(`[ScraperAPI] ✅ Title found for ${asin}: "${title.substring(0, 60)}..."`);
        console.log(`[ScraperAPI] ✅ Brand found for ${asin}: "${brand}"`);
        console.log(`[ScraperAPI] ✅ Description found for ${asin}: ${features.length} features`);
        console.log(`[ScraperAPI] ✅ Images found for ${asin}: ${images.length} images`);
        if (color) console.log(`[ScraperAPI] ✅ Color found for ${asin}: "${color}"`);
        if (compatibility) console.log(`[ScraperAPI] ✅ Compatibility found for ${asin}: "${compatibility}"`);
        if (images.length > 0) {
          console.log(`[ScraperAPI] 🖼️ First image: ${images[0].substring(0, 80)}...`);
          if (images.length > 1) {
            console.log(`[ScraperAPI] 🖼️ Last image: ${images[images.length - 1].substring(0, 80)}...`);
          }
        }

        // Track successful usage
        const extractedFields = ['price', 'title', 'brand', 'description', 'images'];
        if (color) extractedFields.push('color');
        if (compatibility) extractedFields.push('compatibility');
        if (model) extractedFields.push('model');
        if (material) extractedFields.push('material');
        if (specialFeatures) extractedFields.push('specialFeatures');
        if (size) extractedFields.push('size');
        if (formFactor) extractedFields.push('formFactor');
        if (screenSize) extractedFields.push('screenSize');
        if (bandMaterial) extractedFields.push('bandMaterial');
        if (bandWidth) extractedFields.push('bandWidth');
        if (bandColor) extractedFields.push('bandColor');
        if (includedComponents) extractedFields.push('includedComponents');

        trackApiUsage({
          service: 'ScraperAPI',
          asin,
          creditsUsed: 1,
          success: true,
          responseTime,
          extractedFields
        }).catch(err => console.error('[Usage Tracker] Failed to track:', err.message));

        console.log(`[ScraperAPI] ✅ Successfully scraped all data for ${asin} in ${responseTime}ms`);
        
        return {
          asin,
          title: title || 'Unknown Product',
          price: resolvedPrice || '',
          brand: brand || 'Unbranded',
          description: description || '',
          images: images,
          color: color || '',
          compatibility: compatibility || '',
          model: model || '',
          material: material || '',
          specialFeatures: specialFeatures || '',
          size: size || '',
          formFactor: formFactor || '',
          screenSize: screenSize || '',
          bandMaterial: bandMaterial || '',
          bandWidth: bandWidth || '',
          bandColor: bandColor || '',
          includedComponents: includedComponents || '',
          rawData: data // Store full response for debugging
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        
        // Check if error is retryable
        const isRetryable = error.response?.status !== 429 && error.message !== 'NO_PRICE_FOUND';
        
        // Retry with exponential backoff for retryable errors
        if (isRetryable && attempt < maxRetries) {
          const backoffDelay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          console.warn(`[ScraperAPI] ⚠️ Attempt ${attempt} failed for ${asin}: ${error.message}`);
          console.log(`[ScraperAPI] 🔄 Retrying after ${backoffDelay}ms (exponential backoff)...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }
        
        // Track failed usage
        trackApiUsage({
          service: 'ScraperAPI',
          asin,
          creditsUsed: 1,
          success: false,
          errorMessage: error.message,
          responseTime,
          extractedFields: []
        }).catch(err => console.error('[Usage Tracker] Failed to track:', err.message));
        
        console.error(`[ScraperAPI] ❌ Failed to scrape ASIN ${asin} after ${attempt} attempt(s):`, error.message);
        throw error;
      }
    }
  });
}

/**
 * Batch scrape multiple ASINs in parallel (with concurrency limit)
 * @param {Array<string>} asins - Array of ASINs to scrape
 * @param {string} region - Amazon region
 * @returns {Promise<Array>} - Array of scraped product data
 */
export async function batchScrapeAmazonProductsWithScraperAPI(asins, region = 'US') {
  console.log(`[ScraperAPI] 📦 Batch scraping ${asins.length} ASINs in parallel (max ${CONCURRENT_REQUESTS} concurrent)...`);
  
  // Process all ASINs in parallel with concurrency limit
  const promises = asins.map(asin =>
    scrapeAmazonProductWithScraperAPI(asin, region)
      .then(data => ({ asin, data, success: true }))
      .catch(error => {
        console.error(`[ScraperAPI] ❌ Batch scrape failed for ${asin}:`, error.message);
        return { asin, data: null, success: false, error: error.message };
      })
  );
  
  const results = await Promise.all(promises);
  
  const successCount = results.filter(r => r.success).length;
  console.log(`[ScraperAPI] ✅ Batch complete: ${successCount}/${asins.length} successful`);
  
  return results;
}
