import mongoose from 'mongoose';
import TemplateListing from '../models/TemplateListing.js';
import AsinDirectory from '../models/AsinDirectory.js';
import SellerSkuIndex from '../models/SellerSkuIndex.js';
import { fetchAmazonData, applyFieldConfigs } from './asinAutofill.js';
import { generateSKUWithCount } from './skuGenerator.js';
import { buildRequestUsageContext } from './clientIp.js';
import {
  hostImagesOnEbay,
  isAlreadyOverlaid,
  replaceImages,
  resolveEffectiveBadgeKey,
  resolveTemplateOverlay,
  withOverlaidImages
} from './overlayImage.js';

/**
 * Shared generation half of the Amazon Stock Check "revise onto a new ASIN"
 * flow: ASIN + template -> the eBay-side fields, exactly as ASIN Precheck ->
 * ASIN Review produces them.
 *
 * Lives here rather than in routes/templateListings.js so that adding a second
 * caller cannot regress the bulk listing pipeline. The primitives underneath
 * (fetchAmazonData, applyFieldConfigs, withOverlaidImages) are the same ones
 * that pipeline uses, so both paths stay in step by construction.
 */

// The stock check records a currency per SKU; fetchAmazonData wants a region.
const CURRENCY_TO_REGION = { USD: 'US', GBP: 'UK', CAD: 'CA', AUD: 'AU' };

export function regionForCurrency(currency) {
  return CURRENCY_TO_REGION[String(currency || '').toUpperCase()] || 'US';
}

// A revise's AI calls have to land in the same usage report as a bulk run's,
// so the request half of the context comes from the shared resolver.
export function buildReviseUsageContext(req, templateId, sellerId) {
  const startedAt = new Date();
  return {
    ...buildRequestUsageContext(req),
    templateId,
    sellerId,
    aiRunId: `revise-${startedAt.getTime()}-${new mongoose.Types.ObjectId().toString()}`,
    aiRunStartedAt: startedAt
  };
}

function buildAmazonSourceData(amazonData) {
  return {
    title: amazonData.title,
    secondaryTitle: amazonData.secondaryTitle || '',
    brand: amazonData.brand,
    detectedBrand: amazonData.detectedBrand || amazonData.rawData?.detectedBrand || '',
    price: amazonData.price,
    description: amazonData.description,
    images: amazonData.images,
    color: amazonData.color,
    compatibility: amazonData.compatibility,
    productInfo: amazonData.productInfo || null
  };
}

/**
 * Badge the images if the template asks for it. Templates with no badge are the
 * common case, so this is only half the story — hostListingImages below is what
 * guarantees the pictures end up on EPS either way.
 */
async function applyOverlay(amazonData, template, seller, badgeKey, ensureValidToken) {
  const { badgeKey: effectiveKey, optedOut } = resolveEffectiveBadgeKey(template, badgeKey);
  if (optedOut || !effectiveKey) return { data: amazonData, applied: false };

  const overlay = resolveTemplateOverlay(template, effectiveKey);
  if (!overlay) {
    console.warn(`[revise] Overlay "${effectiveKey}" unavailable — continuing without it`);
    return { data: amazonData, applied: false };
  }

  try {
    const token = await ensureValidToken(seller);
    return await withOverlaidImages(amazonData, overlay, { sellerId: seller._id, token });
  } catch (error) {
    console.error(`[revise] Overlay skipped — no eBay token for seller ${seller._id}: ${error.message}`);
    return { data: amazonData, applied: false, warning: `Overlay skipped: ${error.message}` };
  }
}

/**
 * Put every picture on eBay Picture Services, badged or not.
 *
 * Only the badged path hosts pictures as a side effect of compositing, so a
 * template with no badge would otherwise revise a live listing to a set of
 * Amazon URLs and depend on eBay fetching each one. On a listing that stays
 * live while its product changes, a picture eBay fails to fetch leaves the
 * previous product's photo in place — so the upload happens here instead, where
 * a failure is visible before anything is published.
 *
 * Runs BEFORE applyFieldConfigs, because the description embeds image URLs via
 * processImagePlaceholders: hosting afterwards would leave the description
 * pointing at Amazon while itemPhotoUrl pointed at EPS.
 *
 * Non-fatal. A revise with the original URLs still succeeds, so a hosting
 * failure returns a warning for the reviewer rather than blocking the flow.
 */
async function hostListingImages(amazonData, seller, ensureValidToken) {
  const images = Array.isArray(amazonData?.images) ? amazonData.images : [];
  if (!images.length) return { data: amazonData, warning: null };

  try {
    const token = await ensureValidToken(seller);
    const result = await hostImagesOnEbay(images, { sellerId: seller._id, token });

    // applied:false with no warning means there was nothing to do — the badge
    // run already hosted them.
    if (!result.applied) return { data: amazonData, warning: result.warning || null };

    // A copy, never a write-through: fetchAmazonData hands back the live
    // asinCache object (useClones:false), and mutating it would leak these URLs
    // into every other consumer of that ASIN.
    return { data: replaceImages(amazonData, result.images), warning: null };
  } catch (error) {
    console.error(`[revise] Hosting pictures failed for ${amazonData?.asin}: ${error.message}`);
    return { data: amazonData, warning: `Pictures could not be hosted on eBay: ${error.message}` };
  }
}

/**
 * Item specifics for the revise, from the template's custom columns.
 *
 * Custom column names double as File Exchange CSV headers, where item specifics
 * carry a `C:` prefix. The Trading API wants the bare specific name, so the
 * prefix is stripped when present — templates written either way work.
 *
 * Column order drives the output so specifics land in the order the template
 * declares. When a template has no custom columns the field keys are used
 * instead, which keeps a template that generates specifics without declaring
 * columns from silently producing none.
 */
export function buildItemSpecifics(customFields = {}, customColumns = []) {
  const columnNames = customColumns.length
    ? customColumns.map((col) => col.name)
    : Object.keys(customFields);

  const specifics = [];
  const seen = new Set();

  for (const columnName of columnNames) {
    const value = customFields[columnName];
    if (value === undefined || value === null || String(value).trim() === '') continue;

    const name = String(columnName).replace(/^c:\s*/i, '').trim();
    if (!name) continue;

    // eBay rejects a duplicated specific name, which two columns differing only
    // by their prefix would produce.
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    specifics.push({ name, value: String(value).trim() });
  }

  return specifics;
}

// Enough headroom to step past a run of taken suffixes without spinning.
const MAX_SKU_ATTEMPTS = 50;

/**
 * The SKU the revised listing will carry.
 *
 * The number comes from AsinDirectory.listingCount, read exactly the way the
 * ASIN Review path reads it (generateSKUWithCount) — but never written back,
 * because this flow must leave the ASIN Directory alone. Reading the same
 * source is what stops the two paths disagreeing about an ASIN's SKU.
 *
 * Since nothing increments the count here, the count alone cannot be trusted to
 * be free, so the candidate is checked and the suffix stepped until it is. The
 * check is seller-wide rather than per-template, and also consults the live SKU
 * index: the failure this prevents is two eBay listings sharing one SKU, and
 * the stock check resolves SKU -> item id per seller, not per template.
 */
export async function resolveAvailableSku({ asin, sellerId }) {
  const directoryDoc = await AsinDirectory.findOne({ asin }).select('listingCount').lean();
  const startCount = directoryDoc?.listingCount || 0;

  for (let attempt = 0; attempt < MAX_SKU_ATTEMPTS; attempt += 1) {
    const count = startCount + attempt;
    const candidate = generateSKUWithCount(asin, count);

    const [inDatabase, liveOnEbay] = await Promise.all([
      TemplateListing.exists({
        sellerId,
        customLabel: candidate,
        deletedAt: null,
        status: { $in: ['active', 'draft'] }
      }),
      SellerSkuIndex.exists({ seller: sellerId, sku: candidate })
    ]);

    if (!inDatabase && !liveOnEbay) {
      return { sku: candidate, count, bumped: attempt > 0 };
    }
  }

  throw new Error(`Could not find a free SKU for ${asin} after ${MAX_SKU_ATTEMPTS} attempts`);
}

/**
 * Scrape the ASIN and run the template over it.
 *
 * Deliberately forces a fresh scrape: a revise sets a live listing's price, and
 * a cached Amazon price could be hours old. The bulk preview can afford the
 * cache because its output is reviewed in bulk before anything goes live.
 */
export async function generateListingFromAsin({
  asin,
  template,
  seller,
  pricingConfig,
  region = 'US',
  overlayBadgeId = '',
  usageContext = {},
  ensureValidToken
}) {
  const amazonData = await fetchAmazonData(asin, region, { forceRefresh: true });

  const overlayResult = await applyOverlay(amazonData, template, seller, overlayBadgeId, ensureValidToken);
  const hosting = await hostListingImages(overlayResult.data, seller, ensureValidToken);
  const stagedData = hosting.data;

  const { coreFields, customFields, pricingCalculation, brandRemoval } = await applyFieldConfigs(
    stagedData,
    template.asinAutomation.fieldConfigs,
    pricingConfig,
    usageContext
  );

  // Template defaults fill anything the field configs left alone — same merge
  // order as the bulk preview, so a revised listing and a freshly listed one
  // come out identical for the same ASIN.
  const mergedCoreFields = { ...(template.coreFieldDefaults || {}), ...coreFields };

  for (const col of template.customColumns || []) {
    if (col.defaultValue && !customFields[col.name]) {
      customFields[col.name] = col.defaultValue;
    }
  }

  const stagedImages = Array.isArray(stagedData.images) ? stagedData.images : [];
  const imagesHosted = stagedImages.length > 0 && stagedImages.every(isAlreadyOverlaid);

  const warnings = [];
  const errors = [];
  if (overlayResult.warning) warnings.push(overlayResult.warning);
  if (hosting.warning) warnings.push(hosting.warning);
  if (!mergedCoreFields.title) errors.push('Missing required field: title');
  if (
    mergedCoreFields.startPrice === undefined
    || mergedCoreFields.startPrice === null
    || mergedCoreFields.startPrice === ''
  ) {
    errors.push('Missing required field: startPrice');
  }
  if (!mergedCoreFields.description) warnings.push('Missing description');
  if (!mergedCoreFields.itemPhotoUrl) warnings.push('Missing images');

  return {
    amazonData,
    sourceData: buildAmazonSourceData(stagedData),
    generatedListing: {
      ...mergedCoreFields,
      customFields,
      _asinReference: asin,
      _aiRunId: usageContext.aiRunId,
      _amazonSourcePrice: amazonData.price ? String(amazonData.price) : null
    },
    pricingCalculation,
    // What the brand safety net removed from the AI title/description, or null
    brandRemoval,
    overlayApplied: Boolean(overlayResult.applied),
    overlayWarning: overlayResult.warning || null,
    imagesHosted,
    warnings,
    errors
  };
}
