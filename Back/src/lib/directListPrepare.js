import TemplateListing from '../models/TemplateListing.js';
import SellerPricingConfig from '../models/SellerPricingConfig.js';
import { fetchAmazonData, applyFieldConfigs } from '../utils/asinAutofill.js';
import { enrichListingItemSpecifics } from '../utils/ebayItemSpecificsEnrichment.js';
import { mergeItemPhotoUrls, joinItemPhotoUrls } from '../utils/itemPhotoUrls.js';
import { applyStoreListerSettings, stripStoreControlledListingFields } from '../utils/ebayStoreListerDefaults.js';
import { applyStoreBrandToListing, getStoreBrandMode, stripBrandFromCustomFields } from '../utils/ebayStoreBrand.js';
import { generateSKUFromASIN } from '../utils/skuGenerator.js';
import { getEffectiveTemplate } from '../utils/templateMerger.js';
import { addFixedPriceItemListing } from './ebayTradingDirectList.js';

const REQUIRED_FIELDS = ['customLabel', 'title', 'startPrice', 'categoryId', 'itemPhotoUrl'];
const STORE_LISTER_REGION = 'US';

export function parseDirectListAsins(value) {
  return [...new Set(
    String(value || '')
      .split(/[\s,;\n\r]+/)
      .map((asin) => asin.trim().toUpperCase())
      .filter((asin) => /^[A-Z0-9]{10}$/.test(asin))
  )];
}

export function getDirectListMissingFields(listingPayload = {}) {
  return REQUIRED_FIELDS.filter((key) => !String(listingPayload[key] ?? '').trim());
}

function resolveAutofillCustomColumns(template) {
  return (Array.isArray(template?.customColumns) ? template.customColumns : [])
    .map((col) => (typeof col?.toObject === 'function' ? col.toObject() : col));
}

function resolveAutofillFieldConfigs(template) {
  const raw = Array.isArray(template?.asinAutomation?.fieldConfigs)
    ? template.asinAutomation.fieldConfigs
    : [];
  return raw.map((config) => (typeof config?.toObject === 'function' ? config.toObject() : config));
}

function mergeReviewIntoCustomFields(customFields = {}, coreFields = {}, customColumns = []) {
  const reviewCol = customColumns.find(
    (col) => String(col?.name || '').trim().toLowerCase() === 'c:review'
  );
  if (!reviewCol?.name) return customFields;
  const reviewText = String(coreFields?.review || customFields[reviewCol.name] || '').trim();
  if (!reviewText) return customFields;
  return { ...customFields, [reviewCol.name]: reviewText };
}

function mergeTemplateCoreFields(coreFieldDefaults = {}, autoCoreFields = {}, amazonData = {}) {
  const merged = {
    ...(coreFieldDefaults || {}),
    ...(autoCoreFields || {}),
  };

  if (!String(merged.title || '').trim() && String(amazonData?.title || '').trim()) {
    merged.title = String(amazonData.title).trim().slice(0, 80);
  }

  if (!String(merged.itemPhotoUrl || '').trim() && Array.isArray(amazonData?.images) && amazonData.images.length) {
    merged.itemPhotoUrl = joinItemPhotoUrls(amazonData.images);
  }

  if (merged.startPrice === undefined || merged.startPrice === null || merged.startPrice === '') {
    const priceText = String(amazonData?.price || '').replace(/[$€£¥,\s]/g, '');
    const parsed = Number.parseFloat(priceText);
    merged.startPrice = Number.isFinite(parsed) ? parsed.toFixed(2) : '0.01';
  }

  if (!String(merged.description || '').trim()) {
    const fromDefaults = String(coreFieldDefaults?.description || '').trim();
    const fromAmazon = String(amazonData?.description || '').trim();
    if (fromDefaults) merged.description = coreFieldDefaults.description;
    else if (fromAmazon) merged.description = fromAmazon;
  }

  return merged;
}

export function formatListingSummary(listingPayload = {}, asin = null) {
  return {
    customLabel: listingPayload.customLabel,
    title: listingPayload.title,
    startPrice: listingPayload.startPrice,
    quantity: listingPayload.quantity ?? '1',
    categoryId: listingPayload.categoryId,
    categoryName: listingPayload.categoryName || null,
    asin: listingPayload._asinReference || asin || null,
    location: listingPayload.location || null,
    country: listingPayload.country || null,
    postalCode: listingPayload.postalCode || null,
    photoCount: String(listingPayload.itemPhotoUrl || '')
      .split(/\s*\|\s*|\s*,\s*|\n+/)
      .map((url) => url.trim())
      .filter(Boolean)
      .length,
    itemSpecifics: Object.fromEntries(
      Object.entries(listingPayload.customFields || {}).map(([key, value]) => [
        String(key).replace(/^C:/i, '').trim(),
        value,
      ])
    ),
  };
}

function formatAmazonSource(amazonData) {
  if (!amazonData) return null;
  return {
    title: amazonData.title || null,
    brand: amazonData.brand || null,
    price: amazonData.price || null,
    imageCount: Array.isArray(amazonData.images) ? amazonData.images.length : 0,
  };
}

export async function loadDirectListContext(templateId, sellerId) {
  const [template, sellerConfig] = await Promise.all([
    getEffectiveTemplate(templateId, sellerId),
    SellerPricingConfig.findOne({ sellerId, templateId }),
  ]);

  if (!template) {
    const error = new Error('Template not found');
    error.statusCode = 404;
    throw error;
  }

  let pricingConfig = template.pricingConfig;
  if (sellerConfig) pricingConfig = sellerConfig.pricingConfig;

  return {
    template,
    fieldConfigs: resolveAutofillFieldConfigs(template),
    customColumns: resolveAutofillCustomColumns(template),
    pricingConfig,
  };
}

export async function prepareDirectListPayload({
  templateId,
  sellerId,
  listing = null,
  asin = null,
  region = 'US',
  defaults = {},
  context = null,
}) {
  const ctx = context || await loadDirectListContext(templateId, sellerId);
  const { template, fieldConfigs, customColumns, pricingConfig } = ctx;

  let listingPayload = listing;
  let amazonData = null;
  const normalizedAsin = String(asin || listing?._asinReference || '').trim().toUpperCase() || null;

  if (!listingPayload && normalizedAsin) {
    amazonData = await fetchAmazonData(normalizedAsin, region);
    const { coreFields, customFields } = await applyFieldConfigs(
      amazonData,
      fieldConfigs,
      pricingConfig,
      customColumns
    );
    const mergedCoreFields = mergeTemplateCoreFields(template.coreFieldDefaults, coreFields, amazonData);
    if (amazonData?.images?.length) {
      mergedCoreFields.itemPhotoUrl = mergeItemPhotoUrls(mergedCoreFields.itemPhotoUrl, amazonData.images);
    }
    const customFieldsMerged = mergeReviewIntoCustomFields(customFields, mergedCoreFields, customColumns);

    listingPayload = enrichListingItemSpecifics(
      stripStoreControlledListingFields({
        ...mergedCoreFields,
        customLabel: generateSKUFromASIN(normalizedAsin),
        customFields: customFieldsMerged,
        _asinReference: normalizedAsin,
      }),
      customColumns,
      amazonData
    );
  }

  if (!listingPayload || typeof listingPayload !== 'object') {
    const error = new Error('listing object or asin is required');
    error.statusCode = 400;
    throw error;
  }

  listingPayload = stripStoreControlledListingFields(listingPayload);

  if (!amazonData && normalizedAsin) {
    try {
      amazonData = await fetchAmazonData(normalizedAsin, region);
    } catch (fetchErr) {
      console.warn('[Direct List] Could not fetch Amazon data for item specifics:', fetchErr.message);
    }
  }

  listingPayload = enrichListingItemSpecifics(listingPayload, customColumns, amazonData);
  if (amazonData?.images?.length) {
    listingPayload.itemPhotoUrl = mergeItemPhotoUrls(listingPayload.itemPhotoUrl, amazonData.images);
  }

  listingPayload = await applyStoreListerSettings(listingPayload, sellerId, STORE_LISTER_REGION);

  listingPayload = {
    ...listingPayload,
    customFields: stripBrandFromCustomFields(listingPayload.customFields),
  };

  const brandMode = await getStoreBrandMode(sellerId, STORE_LISTER_REGION);
  const brandResult = applyStoreBrandToListing(
    listingPayload,
    brandMode,
    amazonData,
    customColumns
  );
  listingPayload = brandResult.listing;

  console.log('[Direct List] Applied store lister settings:', {
    sellerId: String(sellerId),
    location: listingPayload.location,
    country: listingPayload.country,
    postalCode: listingPayload.postalCode,
    brandMode: brandResult.brandApplied.mode,
    brand: brandResult.brandApplied.value,
  });

  const missing = getDirectListMissingFields(listingPayload);
  if (missing.length > 0) {
    const error = new Error(`Missing required listing fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    error.missing = missing;
    throw error;
  }

  return { listingPayload, amazonData, template, context: ctx, storeListerApplied: {
    location: listingPayload.location || '',
    country: listingPayload.country || '',
    postalCode: listingPayload.postalCode || '',
    shippingProfileName: listingPayload.shippingProfileName || '',
    returnProfileName: listingPayload.returnProfileName || '',
    paymentProfileName: listingPayload.paymentProfileName || '',
    brandMode: brandResult.brandApplied.mode,
    brand: brandResult.brandApplied.value,
  } };
}

export async function submitDirectListPayload({
  token,
  listingPayload,
  verifyOnly = false,
  templateId,
  sellerId,
  asin = null,
  storeListerApplied = null,
}) {
  const ebayResult = await addFixedPriceItemListing(token, listingPayload, { verifyOnly: Boolean(verifyOnly) });

  if (!verifyOnly && ebayResult.itemId) {
    await TemplateListing.findOneAndUpdate(
      { templateId, sellerId, customLabel: listingPayload.customLabel },
      {
        $set: {
          templateId,
          sellerId,
          ...listingPayload,
          customFields: listingPayload.customFields || {},
          status: 'active',
          ebayItemId: ebayResult.itemId,
          ebayListingUrl: ebayResult.listingUrl,
          ebayPublishedAt: new Date(),
          _asinReference: listingPayload._asinReference || asin || '',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  return {
    success: true,
    itemId: ebayResult.itemId,
    listingUrl: ebayResult.listingUrl,
    ack: ebayResult.ack,
    fees: ebayResult.fees,
    warnings: ebayResult.warnings,
    verifiedOnly: ebayResult.verifiedOnly,
    listing: formatListingSummary(listingPayload, asin),
    storeListerApplied,
    message: verifyOnly
      ? 'Listing validated with eBay (VerifyAddFixedPriceItem) — not published.'
      : 'Listing published on eBay via Trading API.',
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runner() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () => runner());
  await Promise.all(runners);
  return results;
}

export async function previewDirectListPayload({
  templateId,
  sellerId,
  listing = null,
  asin = null,
  region = 'US',
  defaults = {},
}) {
  const normalizedAsin = String(asin || listing?._asinReference || '').trim().toUpperCase() || null;
  const { listingPayload, amazonData, storeListerApplied } = await prepareDirectListPayload({
    templateId,
    sellerId,
    listing,
    asin: normalizedAsin,
    region,
    defaults,
  });

  return {
    success: true,
    listing: formatListingSummary(listingPayload, normalizedAsin),
    storeListerApplied,
    amazonSource: formatAmazonSource(amazonData),
    message: 'Listing prepared for review — not submitted to eBay.',
  };
}

export async function previewDirectListBulk({
  templateId,
  sellerId,
  asins = [],
  region = 'US',
  defaults = {},
  concurrency = 2,
}) {
  const context = await loadDirectListContext(templateId, sellerId);
  const results = await runWithConcurrency(asins, concurrency, async (asin) => {
    try {
      const { listingPayload, storeListerApplied } = await prepareDirectListPayload({
        templateId,
        sellerId,
        asin,
        region,
        defaults,
        context,
      });
      return {
        asin,
        status: 'ready',
        sku: listingPayload.customLabel,
        listing: formatListingSummary(listingPayload, asin),
        storeListerApplied,
      };
    } catch (error) {
      return {
        asin,
        status: 'error',
        sku: generateSKUFromASIN(asin),
        error: error.message || 'Failed to prepare listing',
        missing: error.missing || undefined,
      };
    }
  });

  const ready = results.filter((row) => row.status === 'ready').length;
  const failed = results.length - ready;

  return {
    success: failed === 0,
    total: results.length,
    ready,
    failed,
    results,
    message: `Prepared ${ready}/${results.length} listing(s) for review.`,
  };
}

export async function processDirectListBulk({
  templateId,
  sellerId,
  asins = [],
  region = 'US',
  verifyOnly = false,
  defaults = {},
  token,
  concurrency = 2,
}) {
  const context = await loadDirectListContext(templateId, sellerId);
  const results = await runWithConcurrency(asins, concurrency, async (asin) => {
    try {
      const { listingPayload, storeListerApplied } = await prepareDirectListPayload({
        templateId,
        sellerId,
        asin,
        region,
        defaults,
        context,
      });
      const outcome = await submitDirectListPayload({
        token,
        listingPayload,
        verifyOnly,
        templateId,
        sellerId,
        asin,
        storeListerApplied,
      });
      return {
        asin,
        status: 'success',
        sku: listingPayload.customLabel,
        ...outcome,
      };
    } catch (error) {
      return {
        asin,
        status: 'error',
        sku: generateSKUFromASIN(asin),
        error: error.message || 'Failed to list on eBay',
        missing: error.missing || undefined,
      };
    }
  });

  const successful = results.filter((row) => row.status === 'success').length;
  const failed = results.length - successful;

  return {
    success: failed === 0,
    total: results.length,
    successful,
    failed,
    verifyOnly: Boolean(verifyOnly),
    results,
    message: verifyOnly
      ? `Validated ${successful}/${results.length} listing(s) on eBay (dry run).`
      : `Published ${successful}/${results.length} listing(s) on eBay.`,
  };
}
