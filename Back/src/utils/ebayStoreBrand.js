import { normalizeCustomColumnKey } from './customColumnAmazonMapping.js';
import EbayStoreListerSettings, { DEFAULT_LISTER_SETTINGS } from '../models/EbayStoreListerSettings.js';

export const BRAND_MODES = {
  DOES_NOT_APPLY: 'does_not_apply',
  FROM_SCRAPER: 'from_scraper',
};

export const BRAND_MODE_LABELS = {
  [BRAND_MODES.DOES_NOT_APPLY]: 'Does Not Apply',
  [BRAND_MODES.FROM_SCRAPER]: 'From Amazon scraper',
};

export function normalizeBrandMode(value) {
  return String(value || '').trim() === BRAND_MODES.DOES_NOT_APPLY
    ? BRAND_MODES.DOES_NOT_APPLY
    : BRAND_MODES.FROM_SCRAPER;
}

export function findBrandFieldKey(customFields = {}, customColumns = []) {
  const column = (customColumns || []).find(
    (col) => normalizeCustomColumnKey(col?.name) === 'brand'
  );
  if (column?.name) return column.name;

  const existing = Object.keys(customFields || {}).find(
    (key) => normalizeCustomColumnKey(key) === 'brand'
  );
  return existing || 'C:Brand';
}

export function resolveStoreBrandValue(brandMode, amazonData = null, existingValue = '') {
  if (normalizeBrandMode(brandMode) === BRAND_MODES.DOES_NOT_APPLY) {
    return 'Does Not Apply';
  }

  const scraped = String(amazonData?.brand || '').trim();
  if (scraped) return scraped.length > 65 ? scraped.slice(0, 65) : scraped;

  const existing = String(existingValue || '').trim();
  if (existing && existing.toLowerCase() !== 'does not apply') return existing;

  return '';
}

export async function getStoreBrandMode(sellerId, region = 'US') {
  if (!sellerId) return DEFAULT_LISTER_SETTINGS.brandMode;

  const doc = await EbayStoreListerSettings.findOne({
    sellerId,
    supplier: 'amazon',
    region,
  }).lean();

  return normalizeBrandMode(doc?.lister?.brandMode);
}

export function stripBrandFromCustomFields(customFields = {}) {
  const out = { ...(customFields || {}) };
  for (const key of Object.keys(out)) {
    if (normalizeCustomColumnKey(key) === 'brand') {
      delete out[key];
    }
  }
  return out;
}

export function applyStoreBrandToListing(
  listingPayload = {},
  brandMode,
  amazonData = null,
  customColumns = []
) {
  const customFields = { ...(listingPayload.customFields || {}) };
  const brandKey = findBrandFieldKey(customFields, customColumns);
  const brandValue = resolveStoreBrandValue(
    brandMode,
    amazonData,
    customFields[brandKey]
  );

  if (brandValue) {
    customFields[brandKey] = brandValue;
  } else {
    delete customFields[brandKey];
  }

  return {
    listing: {
      ...listingPayload,
      customFields,
    },
    brandApplied: {
      mode: normalizeBrandMode(brandMode),
      value: brandValue || null,
      fieldKey: brandKey,
    },
  };
}
