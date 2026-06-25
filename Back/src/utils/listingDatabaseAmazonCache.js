import TemplateListing from '../models/TemplateListing.js';

const REGION_SET = new Set(['US', 'UK', 'CA', 'AU']);

export function normalizeAmazonRegion(region = 'US') {
  const r = String(region || 'US').trim().toUpperCase();
  return REGION_SET.has(r) ? r : 'US';
}

export function normalizeAsinRef(asin) {
  return String(asin || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Strip bulky fields before persisting on TemplateListing rows. */
export function slimAmazonDataForSnapshot(amazonData = {}) {
  const {
    rawData: _rawData,
    ...rest
  } = amazonData || {};

  return {
    ...rest,
    asin: normalizeAsinRef(amazonData.asin || rest.asin),
    images: Array.isArray(amazonData.images) ? [...amazonData.images] : [],
    productInformation:
      amazonData.productInformation && typeof amazonData.productInformation === 'object'
        ? amazonData.productInformation
        : {},
  };
}

export function restoreAmazonDataFromSnapshot(snapshot, asin, region = 'US') {
  if (!snapshot || typeof snapshot !== 'object') return null;

  const images = Array.isArray(snapshot.images) ? snapshot.images : [];
  const title = String(snapshot.title || '').trim();
  const description = String(snapshot.description || '').trim();

  if (!title && images.length === 0 && !description) return null;

  return {
    ...snapshot,
    asin: normalizeAsinRef(snapshot.asin || asin),
    title,
    description,
    images,
    productInformation:
      snapshot.productInformation && typeof snapshot.productInformation === 'object'
        ? snapshot.productInformation
        : {},
    customerReviewCount: snapshot.customerReviewCount || 0,
    review: snapshot.review || '',
  };
}

function snapshotMatchesRegion(snapshotRegion, requestedRegion) {
  const snap = normalizeAmazonRegion(snapshotRegion || 'US');
  const req = normalizeAmazonRegion(requestedRegion);
  return snap === req;
}

/**
 * Reuse Amazon scrape from any Listings Database row for this ASIN (any seller/template).
 */
export async function getAmazonDataFromListingsDatabase(asin, region = 'US') {
  const normalizedAsin = normalizeAsinRef(asin);
  if (normalizedAsin.length !== 10) return null;

  const normalizedRegion = normalizeAmazonRegion(region);

  const listing = await TemplateListing.findOne({
    _asinReference: normalizedAsin,
    deletedAt: null,
    amazonSourceSnapshot: { $exists: true, $ne: null },
  })
    .sort({ updatedAt: -1 })
    .select('+amazonSourceSnapshot +_asinReference +amazonSourceRegion')
    .lean();

  if (!listing?.amazonSourceSnapshot) return null;
  if (!snapshotMatchesRegion(listing.amazonSourceRegion, normalizedRegion)) return null;

  const restored = restoreAmazonDataFromSnapshot(
    listing.amazonSourceSnapshot,
    normalizedAsin,
    normalizedRegion
  );
  if (!restored) return null;

  console.log(
    `[fetchAmazonData] 📚 Listings Database hit for ${normalizedAsin} (${normalizedRegion}) from listing ${listing._id}`
  );
  return restored;
}

/**
 * Store scrape snapshot on all existing rows for this ASIN so other stores can reuse it.
 */
export async function rememberAmazonSourceSnapshot(asin, region = 'US', amazonData = null) {
  const normalizedAsin = normalizeAsinRef(asin);
  if (normalizedAsin.length !== 10 || !amazonData) return 0;

  const normalizedRegion = normalizeAmazonRegion(region);
  const snapshot = slimAmazonDataForSnapshot(amazonData);
  if (!restoreAmazonDataFromSnapshot(snapshot, normalizedAsin, normalizedRegion)) return 0;

  const result = await TemplateListing.updateMany(
    { _asinReference: normalizedAsin, deletedAt: null },
    {
      $set: {
        amazonSourceSnapshot: snapshot,
        amazonSourceRegion: normalizedRegion,
      },
    }
  );

  if (result.modifiedCount > 0) {
    console.log(
      `[fetchAmazonData] 💾 Updated amazonSourceSnapshot on ${result.modifiedCount} listing(s) for ${normalizedAsin}`
    );
  }

  return result.modifiedCount;
}

export function amazonSourceSnapshotFields(amazonData, region = 'US') {
  if (!amazonData) return {};
  const snapshot = slimAmazonDataForSnapshot(amazonData);
  if (!restoreAmazonDataFromSnapshot(snapshot, amazonData.asin, region)) return {};
  return {
    amazonSourceSnapshot: snapshot,
    amazonSourceRegion: normalizeAmazonRegion(region),
  };
}

const REUSE_CORE_FIELD_KEYS = [
  'action',
  'categoryId',
  'categoryName',
  'startPrice',
  'quantity',
  'itemPhotoUrl',
  'videoId',
  'conditionId',
  'format',
  'duration',
  'buyItNowPrice',
  'bestOfferEnabled',
  'bestOfferAutoAcceptPrice',
  'minimumBestOfferPrice',
  'immediatePayRequired',
  'shippingService1Option',
  'shippingService1Cost',
  'shippingService1Priority',
  'shippingService2Option',
  'shippingService2Cost',
  'shippingService2Priority',
  'maxDispatchTime',
  'returnsAcceptedOption',
  'returnsWithinOption',
  'refundOption',
  'returnShippingCostPaidBy',
  'relationship',
  'relationshipDetails',
  'scheduleTime',
  'upc',
  'epid',
  'amazonScrapedPrice',
];

function mapCustomFieldsToObject(customFields) {
  if (!customFields) return {};
  if (customFields instanceof Map) return Object.fromEntries(customFields);
  if (typeof customFields === 'object') return { ...customFields };
  return {};
}

/** Latest Listings Database row for an ASIN (any seller/template). */
export async function getPriorListingForAsinReuse(asin) {
  const normalizedAsin = normalizeAsinRef(asin);
  if (normalizedAsin.length !== 10) return null;

  return TemplateListing.findOne({
    _asinReference: normalizedAsin,
    deletedAt: null,
  })
    .sort({ updatedAt: -1 })
    .select('+_asinReference +amazonSourceSnapshot')
    .lean();
}

export function extractReusableListingFields(priorListing) {
  if (!priorListing) return null;

  const customFields = mapCustomFieldsToObject(priorListing.customFields);
  const hasCustomFields = Object.values(customFields).some((v) => String(v ?? '').trim());
  const hasCore = REUSE_CORE_FIELD_KEYS.some((key) => {
    const value = priorListing[key];
    return value != null && value !== '';
  });
  const hasPhotos = String(priorListing.itemPhotoUrl || '').trim().length > 0;

  if (!hasCustomFields && !hasCore && !hasPhotos) return null;

  const coreFields = {};
  for (const key of REUSE_CORE_FIELD_KEYS) {
    const value = priorListing[key];
    if (value == null || value === '') continue;
    coreFields[key] = value;
  }

  return { coreFields, customFields };
}

/** When ASIN already exists in Listings Database, reuse listing fields and only rephrase title/description. */
export async function buildListingReuseContext(asin) {
  const priorListing = await getPriorListingForAsinReuse(asin);
  const reusable = extractReusableListingFields(priorListing);
  if (!reusable) {
    return { reuseOptions: {}, priorListing: null, isReuse: false };
  }
  return {
    reuseOptions: {
      reuseFromPriorListing: reusable,
      aiFieldsOnly: ['title', 'description'],
    },
    priorListing,
    isReuse: true,
  };
}

export function isAiFieldAllowedInReuse(config, aiFieldsOnly = []) {
  const field = String(config?.ebayField || '').trim();
  if (!field) return false;
  if (aiFieldsOnly.includes(field)) return true;
  const bare = field.replace(/^C:/i, '').trim().toLowerCase();
  return aiFieldsOnly.some((allowed) => allowed.replace(/^C:/i, '').trim().toLowerCase() === bare);
}
