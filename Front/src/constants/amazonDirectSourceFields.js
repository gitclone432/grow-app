/**
 * Keys on `amazonData` from the backend ScraperAPI scrape — use for ASIN Auto-Fill direct mapping.
 * Keep in sync with `Back/src/utils/asinAutofill.js` / `scraperApiProduct.js`.
 */
export const AMAZON_DIRECT_SOURCE_OPTIONS = [
  { value: 'asin', label: 'Amazon ASIN' },
  { value: 'title', label: 'Amazon Title' },
  { value: 'price', label: 'Amazon Price' },
  { value: 'brand', label: 'Amazon Brand' },
  { value: 'description', label: 'Amazon Description' },
  { value: 'images', label: 'Amazon Images' },
  { value: 'color', label: 'Amazon Color' },
  { value: 'compatibility', label: 'Amazon Compatibility' },
  { value: 'model', label: 'Amazon Model' },
  { value: 'material', label: 'Amazon Material' },
  { value: 'specialFeatures', label: 'Amazon Special Features' },
  { value: 'size', label: 'Amazon Size' },
  { value: 'formFactor', label: 'Amazon Form Factor' },
  { value: 'screenSize', label: 'Amazon Screen Size' },
  { value: 'bandMaterial', label: 'Amazon Band Material' },
  { value: 'bandWidth', label: 'Amazon Band Width' },
  { value: 'bandColor', label: 'Amazon Band Color' }
];

/** Placeholders supported in AI prompts (subset of amazonData + joined images). */
export const AMAZON_AI_PLACEHOLDER_CHIPS = [
  '{title}',
  '{brand}',
  '{description}',
  '{price}',
  '{asin}',
  '{images}',
  '{color}',
  '{compatibility}',
  '{model}',
  '{material}',
  '{specialFeatures}',
  '{size}',
  '{screenSize}',
  '{formFactor}',
  '{bandMaterial}',
  '{bandWidth}',
  '{bandColor}'
];
