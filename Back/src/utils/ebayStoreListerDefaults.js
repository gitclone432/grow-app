import { normalizeStoreLocationForEbay } from './ebayTradingLocation.js';
import EbayStoreListerSettings, { DEFAULT_LISTER_SETTINGS } from '../models/EbayStoreListerSettings.js';

export const STORE_CONTROLLED_LISTING_FIELDS = [
  'location',
  'country',
  'postalCode',
  'shippingProfileName',
  'returnProfileName',
  'paymentProfileName',
];

export function stripStoreControlledListingFields(payload = {}) {
  const cleaned = { ...(payload || {}) };
  for (const key of STORE_CONTROLLED_LISTING_FIELDS) {
    delete cleaned[key];
  }
  return cleaned;
}

export function listerSettingsToDirectListDefaults(lister = {}) {
  const merged = { ...DEFAULT_LISTER_SETTINGS, ...(lister || {}) };
  const locationFields = normalizeStoreLocationForEbay({
    location: merged.defaultLocation || '',
    country: merged.defaultCountry || 'US',
    postalCode: merged.defaultPostalCode || '',
  });
  return {
    ...locationFields,
    shippingProfileName: merged.shippingProfileName || 'Shipping Policy',
    returnProfileName: merged.returnProfileName || 'Return Policy',
    paymentProfileName: merged.paymentProfileName || 'Payment Policy',
    brandMode: merged.brandMode === 'does_not_apply' ? 'does_not_apply' : 'from_scraper',
  };
}

export async function getEbayStoreListerDefaults(sellerId, region = 'US') {
  if (!sellerId) return null;

  const doc = await EbayStoreListerSettings.findOne({
    sellerId,
    supplier: 'amazon',
    region,
  }).lean();

  if (!doc) return null;
  return listerSettingsToDirectListDefaults(doc.lister || {});
}

export async function getStoreLocationDefaults(sellerId, region = 'US') {
  const storeDefaults = await getEbayStoreListerDefaults(sellerId, region);
  const fallback = listerSettingsToDirectListDefaults(DEFAULT_LISTER_SETTINGS);
  return {
    location: storeDefaults?.location || fallback.location,
    country: storeDefaults?.country || fallback.country,
    postalCode: storeDefaults?.postalCode || fallback.postalCode,
  };
}

export async function getStoreBusinessPolicies(sellerId, region = 'US') {
  const storeDefaults = await getEbayStoreListerDefaults(sellerId, region);
  const fallback = listerSettingsToDirectListDefaults(DEFAULT_LISTER_SETTINGS);
  return {
    shippingProfileName: storeDefaults?.shippingProfileName || fallback.shippingProfileName,
    returnProfileName: storeDefaults?.returnProfileName || fallback.returnProfileName,
    paymentProfileName: storeDefaults?.paymentProfileName || fallback.paymentProfileName,
  };
}

export async function applyStoreListerSettings(listingPayload = {}, sellerId, region = 'US') {
  const locationDefaults = await getStoreLocationDefaults(sellerId, region);
  const policyDefaults = await getStoreBusinessPolicies(sellerId, region);

  return {
    ...stripStoreControlledListingFields(listingPayload),
    ...locationDefaults,
    ...policyDefaults,
  };
}

/** Summary for Direct List UI — always sourced from store lister settings in Mongo. */
export async function buildStoreListerAppliedSummary(sellerId, region = 'US', brandApplied = {}) {
  const [locationDefaults, policyDefaults, storeDefaults] = await Promise.all([
    getStoreLocationDefaults(sellerId, region),
    getStoreBusinessPolicies(sellerId, region),
    getEbayStoreListerDefaults(sellerId, region),
  ]);

  return {
    ...locationDefaults,
    ...policyDefaults,
    brandMode: brandApplied.mode ?? storeDefaults?.brandMode ?? 'from_scraper',
    brand: brandApplied.value ?? '',
  };
}
