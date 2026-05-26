import { generateWithGemini, replacePlaceholders } from './gemini.js';
import { calculateStartPrice } from './pricingCalculator.js';
import { processImagePlaceholders } from './imageReplacer.js';
import { scrapeAmazonProductWithScraperAPI } from './scraperApiProduct.js';
import AmazonPiSourceColumn from '../models/AmazonPiSourceColumn.js';
import { augmentAmazonDataWithPiColumns } from './amazonPiSourceColumnUtils.js';
import { trackApiUsage } from './apiUsageTracker.js';
import { getCachedAsinData, setCachedAsinData } from './asinCache.js';
import { createEbayImageWithOverlay } from './imageProcessor.js';
import { getImageOverlayRuntimeConfig } from './overlaySettings.js';

/** Long Amazon descriptions can break or silently fail LLM calls; truncate only inside AI prompts */
const AI_PROMPT_DESCRIPTION_MAX_CHARS = Math.max(
  8000,
  Number.parseInt(process.env.AI_PROMPT_DESCRIPTION_MAX_CHARS || '14000', 10) || 14000
);

function truncateForAiPrompt(description) {
  const s = String(description || '');
  if (s.length <= AI_PROMPT_DESCRIPTION_MAX_CHARS) return s;
  return `${s.slice(0, AI_PROMPT_DESCRIPTION_MAX_CHARS)}\n\n[Truncated for AI prompt length (${s.length} chars total)]`;
}

const PI_SOURCE_COL_CACHE_MS = 60_000;
let piSourceColCache = { t: 0, rows: null };

async function loadAmazonPiSourceColumnsForAutofill() {
  if (piSourceColCache.rows && Date.now() - piSourceColCache.t < PI_SOURCE_COL_CACHE_MS) {
    return piSourceColCache.rows;
  }
  const rows = await AmazonPiSourceColumn.find({}).sort({ label: 1 }).lean();
  piSourceColCache = { t: Date.now(), rows };
  return rows;
}

/** Call after changing saved PI columns so the next autofill picks up new keys. */
export function invalidateAmazonPiSourceColumnsAutofillCache() {
  piSourceColCache = { t: 0, rows: null };
}

export async function applyOverlayToScrapedImages(imageUrls = []) {
  const overlayConfig = await getImageOverlayRuntimeConfig();
  if (!overlayConfig.enabled || !Array.isArray(imageUrls) || imageUrls.length === 0) {
    return Array.isArray(imageUrls) ? imageUrls : [];
  }

  if (!overlayConfig.imgbbConfigured) {
    console.warn(
      '[applyOverlayToScrapedImages] Overlay enabled but IMGBB_API_KEY is missing — skipping watermark.'
    );
    return imageUrls;
  }

  const badgeName = overlayConfig.activeBadge || 'usa-seller';
  const maxImages = Math.min(imageUrls.length, overlayConfig.maxImages || 3);

  const processed = [...imageUrls];
  const candidates = imageUrls.slice(0, maxImages);
  const overlayResults = await Promise.allSettled(
    candidates.map((url) => createEbayImageWithOverlay(url, badgeName))
  );

  overlayResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value) {
      processed[index] = result.value;
    } else {
      console.warn(`[fetchAmazonData] ⚠️ Overlay failed for image ${index + 1}, using original URL`);
    }
  });

  return processed;
}

/**
 * Fetch Amazon product data by ASIN
 * Uses ScraperAPI for ALL product data (Title, Brand, Description, Images, Price)
 * Replaces PAAPI entirely
 */
export async function fetchAmazonData(asin, region = 'US') {
  const startTime = Date.now();
  
  try {
    console.log(`[fetchAmazonData] 🔍 Fetching product data for ASIN: ${asin} (${region})`);
    
    // Check cache first
    const cached = getCachedAsinData(asin, region);
    if (cached) {
      const cacheTime = Date.now() - startTime;
      console.log(`[fetchAmazonData] ⚡ Cache hit for ${asin} (${region}, ${cacheTime}ms)`);
      return cached;
    }
    
    // Single ScraperAPI call for ALL data
    const scrapedData = await scrapeAmazonProductWithScraperAPI(asin, region);
    
    const responseTime = Date.now() - startTime;
    
    // Extract fields
    let {
      title,
      brand,
      price,
      description,
      images,
      color,
      compatibility,
      model,
      material,
      specialFeatures,
      size,
      formFactor,
      screenSize,
      bandMaterial,
      bandWidth,
      bandColor,
      includedComponents,
      productCategory,
      itemDimensions,
      waterResistanceLevel,
      availabilityStatus,
      soldBy,
      bestSellersRank,
      review,
      customerReviewCount,
      productInformation
    } = scrapedData;
    
    // Remove brand from title (maintain existing behavior)
    if (brand && brand !== 'Unbranded' && title.toLowerCase().includes(brand.toLowerCase())) {
      title = title.replace(new RegExp(brand, 'ig'), '').trim();
    }
    
    // Keep images as array (same as PAAPI format)
    const rawImagesArray = Array.isArray(images) ? images : [];
    const imagesArray = await applyOverlayToScrapedImages(rawImagesArray);
    
    console.log(`[fetchAmazonData] ✅ Successfully fetched data for ${asin} in ${responseTime}ms`);
    console.log(`[fetchAmazonData] 📊 Extracted fields: Title="${title.substring(0, 40)}...", Brand="${brand}", Price="${price}", Images=${imagesArray.length} URLs, Description=${description.split('\n').length} features`);
    if (color) console.log(`[fetchAmazonData] 🎨 Color: "${color}"`);
    if (compatibility) console.log(`[fetchAmazonData] 📱 Compatibility: "${compatibility}"`);
    if (review) {
      console.log(
        `[fetchAmazonData] ⭐ Customer reviews: ${customerReviewCount || 0} row(s), ${review.length} chars`
      );
    }
    console.log(`[fetchAmazonData] 🖼️ First image: ${imagesArray[0] || 'none'}`);
    
    const result = {
      asin,
      title,
      price,
      brand,
      description,
      images: imagesArray, // Return as array (same as PAAPI)
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
      productCategory: productCategory || '',
      itemDimensions: itemDimensions || '',
      waterResistanceLevel: waterResistanceLevel || '',
      availabilityStatus: availabilityStatus || '',
      soldBy: soldBy || '',
      bestSellersRank: bestSellersRank || '',
      review: review || '',
      customerReviewCount: customerReviewCount || 0,
      productInformation:
        productInformation && typeof productInformation === 'object' && !Array.isArray(productInformation)
          ? productInformation
          : {},
      rawData: scrapedData // Store scraped data for debugging
    };
    
    // Cache the result — skip if description is empty so the next request
    // triggers a fresh scrape rather than serving a stale empty-description entry
    if (result.description) {
      setCachedAsinData(asin, result, region);
    } else {
      console.log(`[fetchAmazonData] ⚠️ Skipping cache for ${asin} (no description) — will retry on next request`);
    }
    
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    console.error(`[fetchAmazonData] ❌ Failed to fetch data for ${asin}:`, error.message);
    throw error;
  }
}

/**
 * Apply field configurations to generate auto-fill data
 * Separates core eBay fields and custom columns
 * @param {Object} amazonData - Fetched Amazon product data
 * @param {Array} fieldConfigs - Field configuration array from template
 * @param {Object} pricingConfig - Optional pricing configuration for startPrice calculation
 * @returns {Object} { coreFields, customFields, pricingCalculation }
 */
export async function applyFieldConfigs(amazonData, fieldConfigs, pricingConfig = null) {
  const coreFields = {};
  const customFields = {};
  let pricingCalculation = null;

  const piSourceColumns = await loadAmazonPiSourceColumnsForAutofill();
  const amazonDataForMapping =
    piSourceColumns.length > 0 ? augmentAmazonDataWithPiColumns(amazonData, piSourceColumns) : amazonData;
  
  // DEBUG: Log all field configs received
  console.log(`\n🔍 [ASIN: ${amazonData.asin}] === FIELD CONFIG DEBUG START ===`);
  console.log(`📋 Total field configs received: ${fieldConfigs.length}`);
  console.log(`Field configs:`, JSON.stringify(fieldConfigs.map(c => ({
    ebayField: c.ebayField,
    fieldType: c.fieldType,
    source: c.source,
    enabled: c.enabled,
    hasPrompt: !!c.promptTemplate,
    promptLength: c.promptTemplate?.length || 0
  })), null, 2));
  
  // Placeholder data for AI prompts ({key} tokens in replacePlaceholders)
  const imagesJoined = Array.isArray(amazonDataForMapping.images) ? amazonDataForMapping.images.join(' | ') : '';
  const pi = amazonDataForMapping.productInformation;
  const productInformationStr =
    pi && typeof pi === 'object' && !Array.isArray(pi) && Object.keys(pi).length > 0
      ? JSON.stringify(pi, null, 2)
      : '';
  const placeholderData = {
    title: amazonDataForMapping.title || '',
    brand: amazonDataForMapping.brand || '',
    description: amazonDataForMapping.description || '',
    price: amazonDataForMapping.price || '',
    asin: amazonDataForMapping.asin || '',
    images: imagesJoined,
    color: amazonDataForMapping.color || '',
    compatibility: amazonDataForMapping.compatibility || '',
    model: amazonDataForMapping.model || '',
    material: amazonDataForMapping.material || '',
    specialFeatures: amazonDataForMapping.specialFeatures || '',
    size: amazonDataForMapping.size || '',
    screenSize: amazonDataForMapping.screenSize || '',
    formFactor: amazonDataForMapping.formFactor || '',
    bandMaterial: amazonDataForMapping.bandMaterial || '',
    bandWidth: amazonDataForMapping.bandWidth || '',
    bandColor: amazonDataForMapping.bandColor || '',
    includedComponents: amazonDataForMapping.includedComponents || '',
    productCategory: amazonDataForMapping.productCategory || '',
    itemDimensions: amazonDataForMapping.itemDimensions || '',
    waterResistanceLevel: amazonDataForMapping.waterResistanceLevel || '',
    availabilityStatus: amazonDataForMapping.availabilityStatus || '',
    soldBy: amazonDataForMapping.soldBy || '',
    bestSellersRank: amazonDataForMapping.bestSellersRank || '',
    review: amazonDataForMapping.review || '',
    customerReviews: amazonDataForMapping.review || '',
    productInformation: productInformationStr
  };
  for (const col of piSourceColumns) {
    placeholderData[col.key] = amazonDataForMapping[col.key] || '';
  }
  
  console.log(`📝 Placeholder data:`, JSON.stringify(placeholderData, null, 2));
  
  // Images are already an array (same as PAAPI format)
  const imagesArray = Array.isArray(amazonDataForMapping.images) ? amazonDataForMapping.images : [];
  
  // Separate configs by processing type for parallel execution
  const directConfigs = [];
  const aiConfigs = [];
  const disabledConfigs = [];
  
  for (const config of fieldConfigs) {
    if (!config.enabled) {
      disabledConfigs.push(config);
    } else if (config.source === 'direct') {
      // Process ALL direct mappings (both core and custom fields)
      directConfigs.push(config);
    } else if (config.source === 'ai') {
      // Process ALL AI configs (both core and custom fields)
      aiConfigs.push(config);
    }
  }
  
  console.log(`\n📊 Config categorization:`);
  console.log(`  ✅ Enabled Direct: ${directConfigs.length} (${directConfigs.map(c => c.ebayField).join(', ')})`);
  console.log(`  🤖 Enabled AI: ${aiConfigs.length} (${aiConfigs.map(c => c.ebayField).join(', ')})`);
  console.log(`  ⏸️  Disabled: ${disabledConfigs.length} (${disabledConfigs.map(c => c.ebayField).join(', ')})`);
  
  // Check if pricing calculator will override startPrice field config
  const startPriceConfig = fieldConfigs.find(c => c.ebayField === 'startPrice' && c.enabled);
  if (pricingConfig?.enabled && startPriceConfig) {
    console.log(`ℹ️ [ASIN: ${amazonData.asin}] Pricing calculator enabled - will override startPrice field config (${startPriceConfig.source})`);
  }
  
  // Process disabled configs (apply default values immediately)
  for (const config of disabledConfigs) {
    if (config.defaultValue) {
      const targetObject = config.fieldType === 'custom' ? customFields : coreFields;
      targetObject[config.ebayField] = config.defaultValue;
      console.log(`Applied default value for ${config.ebayField}: ${config.defaultValue}`);
    }
  }
  
  // Process direct mapping configs (fast, no API calls)
  for (const config of directConfigs) {
    const targetObject = config.fieldType === 'custom' ? customFields : coreFields;
    
    try {
      let value = amazonDataForMapping[config.amazonField];

      // Plain objects (e.g. full `productInformation`) → JSON text for eBay / custom fields
      if (value != null && typeof value === 'object' && !Array.isArray(value)) {
        value = JSON.stringify(value, null, 2);
      }

      // Apply transformations
      value = applyTransform(value, config.transform);
      
      // Apply image placeholder replacement for description field
      if (config.ebayField === 'description' && typeof value === 'string') {
        value = processImagePlaceholders(value, imagesArray);
      }
      
      targetObject[config.ebayField] = value;
      
      // Fallback to default value if mapping resulted in empty value
      if (!targetObject[config.ebayField] && config.defaultValue) {
        targetObject[config.ebayField] = config.defaultValue;
        console.log(`Used default value fallback for ${config.ebayField}: ${config.defaultValue}`);
      }
      
      const fieldLabel = config.fieldType === 'custom' ? `[Custom] ${config.ebayField}` : config.ebayField;
      const filled = targetObject[config.ebayField];
      const filledPreview = typeof filled === 'string' ? filled.substring(0, 50) : String(filled ?? '').substring(0, 50);
      console.log(`Auto-filled ${fieldLabel}: ${filledPreview}...`);
      
    } catch (error) {
      console.error(`[ASIN: ${amazonData.asin}] Error processing direct mapping for ${config.ebayField}:`, error);
      targetObject[config.ebayField] = config.defaultValue || '';
    }
  }
  
  // Process AI configs in parallel for maximum speed
  if (aiConfigs.length > 0) {
    console.log(`\n🤖 [ASIN: ${amazonData.asin}] Generating ${aiConfigs.length} AI fields in parallel...`);
    
    const aiPromises = aiConfigs.map(async (config) => {
      try {
        console.log(`\n  🔹 Processing AI field: ${config.ebayField} (${config.fieldType})`);
        console.log(`    📝 Original prompt template: "${config.promptTemplate}"`);
        const fieldKeyLower = String(config.ebayField || '').toLowerCase();
        const customColumnWantsReviewExtract =
          config.fieldType === 'custom'
          && /model|year|compat|series|size|fit|watch/i.test(String(config.ebayField || ''));
        let aiPlaceholderData = placeholderData;
        if (fieldKeyLower === 'description' || fieldKeyLower.includes('description')) {
          aiPlaceholderData = {
            ...placeholderData,
            description: truncateForAiPrompt(placeholderData.description),
          };
        } else if (
          fieldKeyLower === 'review'
          || fieldKeyLower.includes('review')
          || /\{review\}|\{customerreviews\}/i.test(config.promptTemplate || '')
          || customColumnWantsReviewExtract
        ) {
          const reviewText = truncateForAiPrompt(placeholderData.review);
          aiPlaceholderData = {
            ...placeholderData,
            review: reviewText,
            customerReviews: reviewText,
          };
        }

        const templateRaw = String(config.promptTemplate || '').trim();
        let processedPrompt = replacePlaceholders(templateRaw, aiPlaceholderData);
        const usesReviewInPrompt =
          /\{review\}|\{customerreviews\}/i.test(processedPrompt)
          || /\{review\}|\{customerreviews\}/i.test(templateRaw);
        // Empty prompts produce empty/low-quality GPT output; defaults keep bulk preview usable.
        if (
          config.fieldType === 'custom'
          && !templateRaw
          && (usesReviewInPrompt || customColumnWantsReviewExtract)
          && String(aiPlaceholderData.review || '').trim()
        ) {
          const targetField = String(config.ebayField || 'custom field');
          const DEFAULT_EXTRACT_FROM_REVIEWS_PROMPT = [
            `Read the Amazon customer reviews and extract ONLY the value for eBay custom column "${targetField}" (e.g. model, size, series, years, compatibility).`,
            'Use facts stated in reviews; if unclear, output "Does Not Apply".',
            'Output plain text only — one short line or phrase, no markdown.',
            '',
            'Product title: {title}',
            'Brand: {brand}',
            'Listing description excerpt: {description}',
            '',
            'Customer reviews:',
            '{review}',
          ].join('\n');
          processedPrompt = replacePlaceholders(DEFAULT_EXTRACT_FROM_REVIEWS_PROMPT, aiPlaceholderData);
          console.log(`    ⚠️ Empty AI prompt for ${targetField} — using review extraction default.`);
        } else if (fieldKeyLower === 'review' && !String(processedPrompt || '').trim()) {
          const DEFAULT_REVIEW_AI_PROMPT = [
            'Rephrase the Amazon customer review content below for an eBay listing.',
            'Write 2–4 short paragraphs in plain English. Do not mention Amazon, star ratings as "on Amazon", or "verified purchase".',
            'Keep claims factual and based only on the source text.',
            '',
            'Product: {title}',
            'Brand: {brand}',
            '',
            'Source reviews:',
            '{review}',
          ].join('\n');
          processedPrompt = replacePlaceholders(DEFAULT_REVIEW_AI_PROMPT, aiPlaceholderData);
          console.log('    ⚠️ Empty review AI prompt — using built-in default.');
        } else if (
          fieldKeyLower === 'description'
          && !String(processedPrompt || '').trim()
        ) {
          const DEFAULT_DESCRIPTION_AI_PROMPT = [
            'Rephrase the Amazon product notes below for ONE insertion point in an existing eBay HTML template (already has layout, hero, galleries, footer).',
            '',
            'Output HTML only — no markdown fences.',
            '',
            'CRITICAL:',
            '- Output ONLY 5–10 consecutive `<li>...</li>` elements (feature bullets). No wrapping `<ul>`, `<table>`, `<div>`, `<html>`, or `<body>`.',
            '- Do NOT echo or recreate page chrome: no banners, margins, galleries, seller blocks, shipping tables, or “VISIT OUR STORE” blocks. Never output curly-brace template placeholders (stub merge fields must not appear in your reply).',
            '- Each `<li>` = one short factual sentence (allowed: light `<strong>` on 2–4 word label only). No images, no nested layout.',
            '- Facts must come only from Source; never invent warranties, specs, or compatibility beyond the source.',
            '',
            'Title: {title}',
            'Brand: {brand}',
            'ASIN: {asin}',
            '',
            'Source:',
            '{description}',
          ].join('\n');
          processedPrompt = replacePlaceholders(DEFAULT_DESCRIPTION_AI_PROMPT, aiPlaceholderData);
          console.log('    ⚠️ Empty description AI prompt — using built-in default.');
        }

        console.log(`    ✏️  Processed prompt (after placeholders): "${processedPrompt.substring(0, 500)}${processedPrompt.length > 500 ? '…' : ''}"`);
        
        // Use higher token limit for description field to avoid truncation
        const maxTokens =
          config.ebayField === 'description'
          || config.ebayField === 'review'
          || usesReviewInPrompt
          || customColumnWantsReviewExtract
            ? 2000
            : 150;
        console.log(`    🎯 Token limit: ${maxTokens}`);
        
        let generatedValue = await generateWithGemini(processedPrompt, { maxTokens });
        
        console.log(`    💬 AI response (raw, ${generatedValue.length} chars): "${generatedValue}"`);
        
        // Auto-truncate based on field type:
        // - Title: 80 characters
        // - Description: No limit (full HTML content)
        // - All other fields (core + custom): 60 characters
        const originalLength = generatedValue.length;
        if (config.ebayField === 'title' && generatedValue.length > 80) {
          generatedValue = generatedValue.substring(0, 80);
          console.log(`    ✂️  Truncated title: ${originalLength} → 80 chars`);
        } else if (
          config.ebayField !== 'description'
          && config.ebayField !== 'review'
          && config.ebayField !== 'title'
          && !usesReviewInPrompt
          && !customColumnWantsReviewExtract
          && generatedValue.length > 60
        ) {
          generatedValue = generatedValue.substring(0, 60);
          console.log(`    ✂️  Truncated field: ${originalLength} → 60 chars`);
        }
        
        // Apply image placeholder replacement for description field and description-like custom fields
        if ((config.ebayField === 'description' || config.ebayField.toLowerCase().includes('description')) && typeof generatedValue === 'string') {
          generatedValue = processImagePlaceholders(generatedValue, imagesArray);
        }
        
        console.log(`    ✅ AI generation successful for ${config.ebayField}`);
        
        return {
          config,
          value: generatedValue,
          success: true
        };
        
      } catch (error) {
        console.error(`    ❌ Error generating AI field ${config.ebayField}:`, error);
        console.error(`    🔄 Using default value: "${config.defaultValue || ''}"`);
        return {
          config,
          value: config.defaultValue || '',
          success: false,
          error: error.message
        };
      }
    });
    
    // Wait for all AI generations to complete in parallel
    const aiResults = await Promise.all(aiPromises);
    
    // Apply AI results to target objects
    for (const result of aiResults) {
      const targetObject = result.config.fieldType === 'custom' ? customFields : coreFields;
      targetObject[result.config.ebayField] = result.value;
      
      // Critical check for title field (required for listing creation)
      if (result.config.ebayField === 'title' && !result.value) {
        console.error(`❌ CRITICAL [ASIN: ${amazonData.asin}]: Title generation failed - listing cannot be created`);
      }
      
      // Fallback to default value if generation resulted in empty value
      if (!targetObject[result.config.ebayField] && result.config.defaultValue) {
        targetObject[result.config.ebayField] = result.config.defaultValue;
        console.log(`[ASIN: ${amazonData.asin}] Used default value fallback for ${result.config.ebayField}: ${result.config.defaultValue}`);
      }
      
      const fieldLabel = result.config.fieldType === 'custom' ? `[Custom] ${result.config.ebayField}` : result.config.ebayField;
      const status = result.success ? '✅' : '⚠️';
      console.log(`${status} [ASIN: ${amazonData.asin}] Auto-filled ${fieldLabel}: ${targetObject[result.config.ebayField]?.substring(0, 50)}...`);
    }
    
    // DEBUG: AI processing summary
    const successCount = aiResults.filter(r => r.success).length;
    const failCount = aiResults.filter(r => !r.success).length;
    console.log(`\n📊 AI Processing Summary:`);
    console.log(`  ✅ Successful: ${successCount}/${aiResults.length}`);
    console.log(`  ❌ Failed: ${failCount}/${aiResults.length}`);
    if (failCount > 0) {
      console.log(`  Failed fields:`, aiResults.filter(r => !r.success).map(r => r.config.ebayField));
    }
  }
  
  // PRIORITY: If pricing config enabled, calculate startPrice (overrides field config)
  if (pricingConfig?.enabled) {
    console.log(`[Pricing Calculator] Enabled, Amazon price: "${amazonData.price}"`);
    
    if (!amazonData.price || amazonData.price.trim() === '') {
      console.warn(`[ASIN: ${amazonData.asin}] ⚠️ Amazon price not available - cannot calculate startPrice`);
      pricingCalculation = {
        enabled: true,
        error: 'Amazon price not available'
      };
    } else {
      try {
        // Extract numeric cost from Amazon price string (e.g., "$49.99" -> 49.99)
        const amazonCost = parseFloat(amazonData.price.replace(/[^0-9.]/g, ''));
        
        console.log(`[Pricing Calculator] Extracted numeric cost: ${amazonCost}`);
        
        if (!isNaN(amazonCost) && amazonCost > 0) {
          const result = calculateStartPrice(pricingConfig, amazonCost);
          
          // Override startPrice regardless of field configs
          coreFields.startPrice = result.price.toFixed(2);
          
          pricingCalculation = {
            enabled: true,
            amazonCost: amazonData.price,
            calculatedStartPrice: result.price.toFixed(2),
            breakdown: result.breakdown
          };
          
          // Enhanced logging with tier information
          if (result.breakdown.profitTier?.enabled) {
            console.log(`✅ [Pricing Calculator] Cost: ${amazonData.price}, Tier: ${result.breakdown.profitTier.costRange} (+${result.breakdown.profitTier.profit} INR), Start Price: $${result.price.toFixed(2)}`);
          } else {
            console.log(`✅ [Pricing Calculator] Cost: ${amazonData.price}, Calculated Start Price: $${result.price.toFixed(2)}`);
          }
        } else {
          console.warn(`[ASIN: ${amazonData.asin}] ⚠️ Invalid price value: "${amazonData.price}" (extracted: ${amazonCost})`);
          pricingCalculation = {
            enabled: true,
            error: `Invalid price value: ${amazonData.price}`
          };
        }
      } catch (error) {
        console.error(`[ASIN: ${amazonData.asin}] ❌ [Pricing Calculator] Error:`, error.message);
        // Fall back to regular field config processing for startPrice
        pricingCalculation = {
          enabled: true,
          error: error.message
        };
      }
    }
  }
  
  // DEBUG: Final results summary
  console.log(`\n✅ [ASIN: ${amazonData.asin}] === FIELD CONFIG DEBUG END ===`);
  console.log(`📝 Final results:`);
  console.log(`  Core fields (${Object.keys(coreFields).length}):`, Object.keys(coreFields));
  console.log(`  Custom fields (${Object.keys(customFields).length}):`, Object.keys(customFields));
  console.log(`  Pricing calculation:`, pricingCalculation ? 'enabled' : 'disabled');
  console.log(`==========================================\n`);
  
  return { coreFields, customFields, pricingCalculation };
}

/**
 * Apply transformations to values
 */
function applyTransform(value, transform) {
  if (!value) return '';
  
  switch (transform) {
    case 'pipeSeparated':
      return Array.isArray(value) ? value.join(' | ') : value;
      
    case 'removeSymbol':
      return typeof value === 'string' ? value.replace(/[$€£¥]/g, '') : value;
      
    case 'truncate80':
      return typeof value === 'string' ? value.substring(0, 80) : value;
      
    case 'truncate60':
      return typeof value === 'string' ? value.substring(0, 60) : value;
      
    case 'htmlFormat':
      // Convert plain text to simple HTML
      if (typeof value === 'string') {
        const lines = value.split('\n').filter(l => l.trim());
        return `<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
      }
      return value;
      
    case 'none':
    default:
      return value;
  }
}
