import TemplateListing from '../models/TemplateListing.js';
import SellerPricingConfig from '../models/SellerPricingConfig.js';
import { fetchAmazonData, applyFieldConfigs } from '../utils/asinAutofill.js';
import {
  ensureCustomColumnFieldConfigs,
  filterAutofillConfigsForColumnDefaults,
  filterAutofillConfigsForCoreFieldDefaults,
  filterCustomFieldsToTemplateColumns,
  applyEbayCountryOfOriginOverride,
} from '../utils/customColumnAmazonMapping.js';
import {
  mergeTemplateCoreFields,
  resolveEffectiveCoreFieldDefaults,
} from '../utils/templateCoreFieldMerge.js';
import { enrichListingItemSpecifics, applyCustomColumnDefaults } from '../utils/ebayItemSpecificsEnrichment.js';
import { mergeItemPhotoUrls, joinItemPhotoUrls } from '../utils/itemPhotoUrls.js';
import {
  applyStoreListerSettings,
  buildStoreListerAppliedSummary,
  stripStoreControlledListingFields,
  STORE_CONTROLLED_LISTING_FIELDS,
} from '../utils/ebayStoreListerDefaults.js';
import { applyStoreBrandToListing, getStoreBrandMode, stripBrandFromCustomFields } from '../utils/ebayStoreBrand.js';
import { generateSKUFromASIN } from '../utils/skuGenerator.js';
import { getEffectiveTemplate } from '../utils/templateMerger.js';
import { addFixedPriceItemListing } from './ebayTradingDirectList.js';
import { buildAmazonSupplierLink } from '../utils/supplierLinkFromListings.js';
import { attachAmazonScrapedPrice } from '../utils/amazonScrapedPrice.js';
import { amazonSourceSnapshotFields, buildListingReuseContext } from '../utils/listingDatabaseAmazonCache.js';
import {
  applyDescriptionTemplatePlaceholders,
  hasUnsubstitutedPlaceholders,
} from '../utils/descriptionTemplatePlaceholders.js';
import { resolveTemplateEbayMarketplace } from '../utils/ebayActionField.js';

const REQUIRED_FIELDS = ['customLabel', 'title', 'startPrice', 'categoryId', 'itemPhotoUrl'];

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

function resolveAutofillFieldConfigs(template, coreFieldDefaults = {}) {
  const raw = Array.isArray(template?.asinAutomation?.fieldConfigs)
    ? template.asinAutomation.fieldConfigs
    : [];
  const customColumns = resolveAutofillCustomColumns(template);
  const merged = ensureCustomColumnFieldConfigs(
    raw.map((config) => (typeof config?.toObject === 'function' ? config.toObject() : config)),
    customColumns
  );
  const columnFiltered = filterAutofillConfigsForColumnDefaults(merged, customColumns);
  return filterAutofillConfigsForCoreFieldDefaults(columnFiltered, coreFieldDefaults);
}

function resolveDescriptionAiAutofillConfig(template) {
  const raw = Array.isArray(template?.asinAutomation?.fieldConfigs)
    ? template.asinAutomation.fieldConfigs
    : [];
  const customColumns = resolveAutofillCustomColumns(template);
  const merged = ensureCustomColumnFieldConfigs(
    raw.map((config) => (typeof config?.toObject === 'function' ? config.toObject() : config)),
    customColumns
  );
  const columnFiltered = filterAutofillConfigsForColumnDefaults(merged, customColumns);
  return columnFiltered.find((cfg) => {
    const ebayField = String(cfg?.ebayField || '').trim().toLowerCase();
    const source = String(cfg?.source || '').trim().toLowerCase();
    return cfg?.enabled && ebayField === 'description' && source === 'ai';
  }) || null;
}

function templateDescriptionNeedsAiAutofill(coreFieldDefaults = {}) {
  const desc = String(coreFieldDefaults?.description || '').trim();
  if (!desc || !hasUnsubstitutedPlaceholders(desc)) return false;
  return /\{\{AI_FEATURE_BULLETS\}\}|\{\{AI_DESCRIPTION\}\}/i.test(desc);
}

async function resolveDescriptionAiText(amazonData, template, pricingConfig, customColumns, coreFieldDefaults, reuseOptions = {}) {
  if (!amazonData || !templateDescriptionNeedsAiAutofill(coreFieldDefaults)) return '';

  const descriptionAiConfig = resolveDescriptionAiAutofillConfig(template);
  if (!descriptionAiConfig) return '';

  try {
    const { coreFields } = await applyFieldConfigs(
      amazonData,
      [descriptionAiConfig],
      pricingConfig,
      customColumns,
      reuseOptions
    );
    return String(coreFields?.description || '').trim();
  } catch (error) {
    console.warn('[Direct List] Description AI autofill failed:', error.message);
    return '';
  }
}

function applyDescriptionPlaceholdersIfNeeded(listingPayload, amazonData, aiDescription = '') {
  const templateHtml = String(listingPayload?.description || '').trim();
  if (!templateHtml || !hasUnsubstitutedPlaceholders(templateHtml)) {
    return listingPayload;
  }

  return {
    ...listingPayload,
    description: applyDescriptionTemplatePlaceholders(
      templateHtml,
      listingPayload,
      amazonData,
      aiDescription
    ),
  };
}

function finalizeListingCustomFields(customFields = {}, customColumns = [], brandApplied = null) {
  let filtered = filterCustomFieldsToTemplateColumns(customFields, customColumns);
  if (brandApplied?.fieldKey && brandApplied?.value) {
    filtered = { ...filtered, [brandApplied.fieldKey]: brandApplied.value };
  }
  filtered = applyEbayCountryOfOriginOverride(filtered, customColumns);
  return filtered;
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

function hasNonEmptyCustomFields(customFields) {
  if (!customFields || typeof customFields !== 'object') return false;
  const entries = customFields instanceof Map
    ? [...customFields.entries()]
    : Object.entries(customFields);
  return entries.some(([, value]) => String(value ?? '').trim() !== '');
}

function mergeClientListingOverrides(prepared, client) {
  if (!client || typeof client !== 'object') return prepared;

  const overrides = {};
  for (const key of ['customLabel', 'title', 'startPrice', 'quantity', 'categoryId', 'categoryName', 'itemPhotoUrl']) {
    const value = client[key];
    if (value != null && String(value).trim() !== '') {
      overrides[key] = value;
    }
  }

  const description = String(client.description || '').trim();
  if (description) {
    overrides.description = client.description;
  }

  let customFields = prepared.customFields || {};
  if (hasNonEmptyCustomFields(client.customFields)) {
    const clientFields = client.customFields instanceof Map
      ? Object.fromEntries(client.customFields)
      : { ...client.customFields };
    customFields = { ...customFields, ...clientFields };
  }

  return {
    ...prepared,
    ...overrides,
    customFields,
  };
}

export function toCustomFieldsMap(customFields) {
  if (!customFields) return new Map();
  if (customFields instanceof Map) return customFields;
  if (typeof customFields === 'object') {
    return new Map(Object.entries(customFields));
  }
  return new Map();
}

const PERSIST_SKIP_KEYS = new Set([
  '_id',
  '__v',
  'sellerId',
  'templateId',
  'customFields',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdBy',
  'status',
  'ebayItemId',
  'ebayListingUrl',
  'ebayPublishedAt',
  'amazonSourceSnapshot',
  'amazonSourceRegion',
]);

function buildPersistableListingFields(listingPayload = {}, storeListerApplied = null) {
  const merged = { ...(listingPayload || {}) };
  if (storeListerApplied && typeof storeListerApplied === 'object') {
    for (const key of STORE_CONTROLLED_LISTING_FIELDS) {
      const value = storeListerApplied[key];
      if (value != null && String(value).trim() !== '') {
        merged[key] = value;
      }
    }
  }

  const out = {};
  for (const key of Object.keys(TemplateListing.schema.paths)) {
    if (PERSIST_SKIP_KEYS.has(key)) continue;
    if (merged[key] === undefined || merged[key] === null) continue;
    out[key] = merged[key];
  }
  return out;
}

/** Upsert full listing row to Listings Database (TemplateListing). */
export async function persistTemplateListingRecord({
  templateId,
  sellerId,
  listingPayload,
  storeListerApplied = null,
  status = 'draft',
  ebayResult = null,
  createdBy = null,
  amazonData = null,
  region = 'US',
}) {
  if (!templateId || !sellerId || !listingPayload?.customLabel) return null;

  const asinRef = String(listingPayload._asinReference || '').trim().toUpperCase();
  const persistFields = buildPersistableListingFields(listingPayload, storeListerApplied);

  const existing = await TemplateListing.findOne({
    templateId,
    sellerId,
    customLabel: listingPayload.customLabel,
  }).select('status ebayItemId').lean();

  let nextStatus = status;
  if (ebayResult?.itemId) {
    nextStatus = 'active';
  } else if (existing?.status === 'active' && existing?.ebayItemId) {
    nextStatus = 'active';
  }

  const $set = {
    templateId,
    sellerId,
    ...persistFields,
    customFields: toCustomFieldsMap(listingPayload.customFields || {}),
    status: nextStatus,
    updatedAt: new Date(),
  };

  if (asinRef) {
    $set._asinReference = asinRef;
    $set.amazonLink = listingPayload.amazonLink || buildAmazonSupplierLink(asinRef);
    Object.assign($set, amazonSourceSnapshotFields(amazonData, region));
  }

  if (ebayResult?.itemId) {
    $set.ebayItemId = String(ebayResult.itemId);
    $set.ebayListingUrl = ebayResult.listingUrl || '';
    $set.ebayPublishedAt = new Date();
  }

  const update = { $set };
  if (createdBy && !existing) {
    update.$setOnInsert = { createdBy };
  }

  return TemplateListing.findOneAndUpdate(
    { templateId, sellerId, customLabel: listingPayload.customLabel },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
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

  const ebayMarketplace = resolveTemplateEbayMarketplace(template);

  const effectiveCoreFieldDefaults = await resolveEffectiveCoreFieldDefaults(
    template,
    sellerId,
    ebayMarketplace.storeListerRegion
  );

  return {
    template,
    ebayMarketplace,
    effectiveCoreFieldDefaults,
    fieldConfigs: resolveAutofillFieldConfigs(template, effectiveCoreFieldDefaults),
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
  const {
    template,
    ebayMarketplace,
    fieldConfigs,
    customColumns,
    pricingConfig,
    effectiveCoreFieldDefaults,
  } = ctx;
  const storeListerRegion = ebayMarketplace.storeListerRegion;
  const coreFieldDefaults = effectiveCoreFieldDefaults || template.coreFieldDefaults || {};

  let listingPayload = listing;
  let amazonData = null;
  const normalizedAsin = String(asin || listing?._asinReference || '').trim().toUpperCase() || null;
  const clientListing = listing && typeof listing === 'object' ? listing : null;

  let aiDescription = '';
  let reusedFromDatabase = false;
  let listingReuseOptions = {};

  if (normalizedAsin) {
    const { reuseOptions, isReuse } = await buildListingReuseContext(normalizedAsin);
    listingReuseOptions = reuseOptions;
    reusedFromDatabase = isReuse;

    amazonData = await fetchAmazonData(normalizedAsin, region);

    const { coreFields, customFields, reusedFromDatabase: autofillReuse } = await applyFieldConfigs(
      amazonData,
      fieldConfigs,
      pricingConfig,
      customColumns,
      reuseOptions
    );
    reusedFromDatabase = autofillReuse || isReuse;

    if (templateDescriptionNeedsAiAutofill(coreFieldDefaults)) {
      aiDescription = await resolveDescriptionAiText(
        amazonData,
        template,
        pricingConfig,
        customColumns,
        coreFieldDefaults,
        reuseOptions
      );
    } else {
      aiDescription = String(coreFields?.description || '').trim();
    }

    const mergedCoreFields = mergeTemplateCoreFields(
      coreFieldDefaults,
      coreFields,
      amazonData,
      { reuseMode: reusedFromDatabase }
    );
    if (!reusedFromDatabase && amazonData?.images?.length) {
      mergedCoreFields.itemPhotoUrl = mergeItemPhotoUrls(mergedCoreFields.itemPhotoUrl, amazonData.images);
    }
    const customFieldsMerged = mergeReviewIntoCustomFields(customFields, mergedCoreFields, customColumns);
    if (!reusedFromDatabase) {
      applyCustomColumnDefaults(customFieldsMerged, customColumns);
    }

    const baseListing = {
      ...mergedCoreFields,
      customLabel: generateSKUFromASIN(normalizedAsin),
      customFields: customFieldsMerged,
      _asinReference: normalizedAsin,
    };

    const prepared = enrichListingItemSpecifics(
      stripStoreControlledListingFields(
        applyDescriptionPlaceholdersIfNeeded(baseListing, amazonData, aiDescription)
      ),
      customColumns,
      amazonData,
      { reuseMode: reusedFromDatabase }
    );

    listingPayload = clientListing
      ? mergeClientListingOverrides(prepared, clientListing)
      : prepared;
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

  listingPayload = enrichListingItemSpecifics(
    listingPayload,
    customColumns,
    amazonData,
    { reuseMode: reusedFromDatabase }
  );
  if (!reusedFromDatabase && amazonData?.images?.length) {
    listingPayload.itemPhotoUrl = mergeItemPhotoUrls(listingPayload.itemPhotoUrl, amazonData.images);
  }

  listingPayload = await applyStoreListerSettings(listingPayload, sellerId, storeListerRegion);

  listingPayload = {
    ...listingPayload,
    customFields: stripBrandFromCustomFields(listingPayload.customFields),
  };

  const brandMode = await getStoreBrandMode(sellerId, storeListerRegion);
  const brandResult = applyStoreBrandToListing(
    listingPayload,
    brandMode,
    amazonData,
    customColumns
  );
  listingPayload = {
    ...brandResult.listing,
    customFields: finalizeListingCustomFields(
      brandResult.listing.customFields,
      customColumns,
      brandResult.brandApplied
    ),
  };

  console.log('[Direct List] Applied store lister settings:', {
    sellerId: String(sellerId),
    ebaySite: ebayMarketplace.marketplaceLabel,
    ebaySiteId: ebayMarketplace.siteId,
    location: listingPayload.location,
    country: listingPayload.country,
    postalCode: listingPayload.postalCode,
    brandMode: brandResult.brandApplied.mode,
    brand: brandResult.brandApplied.value,
  });

  if (hasUnsubstitutedPlaceholders(listingPayload.description)) {
    if (!aiDescription && amazonData) {
      aiDescription = await resolveDescriptionAiText(
        amazonData,
        template,
        pricingConfig,
        customColumns,
        coreFieldDefaults,
        listingReuseOptions
      );
    }
    listingPayload = applyDescriptionPlaceholdersIfNeeded(listingPayload, amazonData, aiDescription);
  }

  const missing = getDirectListMissingFields(listingPayload);
  if (missing.length > 0) {
    const error = new Error(`Missing required listing fields: ${missing.join(', ')}`);
    error.statusCode = 400;
    error.missing = missing;
    throw error;
  }

  if (normalizedAsin) {
    listingPayload.amazonLink = buildAmazonSupplierLink(normalizedAsin, region);
    listingPayload._asinReference = normalizedAsin;
  }

  if (amazonData) {
    attachAmazonScrapedPrice(listingPayload, amazonData);
  }

  const storeListerApplied = await buildStoreListerAppliedSummary(
    sellerId,
    storeListerRegion,
    brandResult.brandApplied
  );

  return {
    listingPayload,
    amazonData,
    template,
    context: ctx,
    ebayMarketplace,
    storeListerApplied,
    reusedFromDatabase,
  };
}

export async function getDirectListStoreListerDefaults(sellerId, region = 'US') {
  return buildStoreListerAppliedSummary(sellerId, region);
}

export async function submitDirectListPayload({
  token,
  listingPayload,
  verifyOnly = false,
  templateId,
  sellerId,
  asin = null,
  storeListerApplied = null,
  createdBy = null,
  amazonData = null,
  region = 'US',
  ebayMarketplace = null,
}) {
  let marketplace = ebayMarketplace;
  if (!marketplace && templateId) {
    const template = await getEffectiveTemplate(templateId, sellerId);
    marketplace = resolveTemplateEbayMarketplace(template);
  }
  marketplace = marketplace || resolveTemplateEbayMarketplace(null);

  const ebayResult = await addFixedPriceItemListing(token, listingPayload, {
    verifyOnly: Boolean(verifyOnly),
    categoryMappingAllowed: false,
    siteId: marketplace.siteId,
    currency: marketplace.currency,
  });

  await persistTemplateListingRecord({
    templateId,
    sellerId,
    listingPayload,
    storeListerApplied,
    status: verifyOnly ? 'draft' : 'active',
    ebayResult: verifyOnly ? null : ebayResult,
    createdBy,
    amazonData,
    region,
  });

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
  createdBy = null,
}) {
  const normalizedAsin = String(asin || listing?._asinReference || '').trim().toUpperCase() || null;
  const {
    listingPayload,
    amazonData,
    storeListerApplied,
    reusedFromDatabase,
    ebayMarketplace,
  } = await prepareDirectListPayload({
    templateId,
    sellerId,
    listing,
    asin: normalizedAsin,
    region,
    defaults,
  });

  await persistTemplateListingRecord({
    templateId,
    sellerId,
    listingPayload,
    storeListerApplied,
    status: 'draft',
    createdBy,
    amazonData,
    region,
  });

  return {
    success: true,
    listing: formatListingSummary(listingPayload, normalizedAsin),
    storeListerApplied,
    ebayMarketplace,
    amazonSource: formatAmazonSource(amazonData),
    reusedFromDatabase: Boolean(reusedFromDatabase),
    message: reusedFromDatabase
      ? 'Listing prepared from Listings Database (title/description rephrased only) and saved as draft.'
      : 'Listing prepared for review and saved to Listings Database (draft).',
  };
}

export async function previewDirectListBulk({
  templateId,
  sellerId,
  asins = [],
  region = 'US',
  defaults = {},
  concurrency = 2,
  createdBy = null,
}) {
  const context = await loadDirectListContext(templateId, sellerId);
  const { ebayMarketplace } = context;
  const results = await runWithConcurrency(asins, concurrency, async (asin) => {
    try {
      const { listingPayload, storeListerApplied, amazonData } = await prepareDirectListPayload({
        templateId,
        sellerId,
        asin,
        region,
        defaults,
        context,
      });
      await persistTemplateListingRecord({
        templateId,
        sellerId,
        listingPayload,
        storeListerApplied,
        status: 'draft',
        createdBy,
        amazonData,
        region,
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
    ebayMarketplace,
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
  createdBy = null,
}) {
  const context = await loadDirectListContext(templateId, sellerId);
  const { ebayMarketplace } = context;
  const results = await runWithConcurrency(asins, concurrency, async (asin) => {
    try {
      const { listingPayload, storeListerApplied, amazonData, ebayMarketplace } = await prepareDirectListPayload({
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
        createdBy,
        amazonData,
        region,
        ebayMarketplace,
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
    ebayMarketplace,
    message: verifyOnly
      ? `Validated ${successful}/${results.length} listing(s) on eBay (dry run).`
      : `Published ${successful}/${results.length} listing(s) on eBay.`,
  };
}
