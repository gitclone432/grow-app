import { generateWithGemini, replacePlaceholders } from './gemini.js';
import { calculateStartPrice } from './pricingCalculator.js';
import { processImagePlaceholders } from './imageReplacer.js';
import { scrapeAmazonProductWithScraperAPI } from './scraperApiProduct.js';
import { trackApiUsage } from './apiUsageTracker.js';
import { getCachedAsinData, setCachedAsinData } from './asinCache.js';

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
      includedComponents
    } = scrapedData;
    
    // Remove brand from title (maintain existing behavior)
    if (brand && brand !== 'Unbranded' && title.toLowerCase().includes(brand.toLowerCase())) {
      title = title.replace(new RegExp(brand, 'ig'), '').trim();
    }
    
    // Keep images as array (same as PAAPI format)
    const imagesArray = Array.isArray(images) ? images : [];
    
    console.log(`[fetchAmazonData] ✅ Successfully fetched data for ${asin} in ${responseTime}ms`);
    console.log(`[fetchAmazonData] 📊 Extracted fields: Title="${title.substring(0, 40)}...", Brand="${brand}", Price="${price}", Images=${imagesArray.length} URLs, Description=${description.split('\n').length} features`);
    if (color) console.log(`[fetchAmazonData] 🎨 Color: "${color}"`);
    if (compatibility) console.log(`[fetchAmazonData] 📱 Compatibility: "${compatibility}"`);
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
  const imagesJoined = Array.isArray(amazonData.images) ? amazonData.images.join(' | ') : '';
  const placeholderData = {
    title: amazonData.title || '',
    brand: amazonData.brand || '',
    description: amazonData.description || '',
    price: amazonData.price || '',
    asin: amazonData.asin || '',
    images: imagesJoined,
    color: amazonData.color || '',
    compatibility: amazonData.compatibility || '',
    model: amazonData.model || '',
    material: amazonData.material || '',
    specialFeatures: amazonData.specialFeatures || '',
    size: amazonData.size || '',
    screenSize: amazonData.screenSize || '',
    formFactor: amazonData.formFactor || '',
    bandMaterial: amazonData.bandMaterial || '',
    bandWidth: amazonData.bandWidth || '',
    bandColor: amazonData.bandColor || '',
    includedComponents: amazonData.includedComponents || ''
  };
  
  console.log(`📝 Placeholder data:`, JSON.stringify(placeholderData, null, 2));
  
  // Images are already an array (same as PAAPI format)
  const imagesArray = Array.isArray(amazonData.images) ? amazonData.images : [];
  
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
      let value = amazonData[config.amazonField];
      
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
        
        const processedPrompt = replacePlaceholders(
          config.promptTemplate, 
          placeholderData
        );
        
        console.log(`    ✏️  Processed prompt (after placeholders): "${processedPrompt}"`);
        
        // Use higher token limit for description field to avoid truncation
        const maxTokens = config.ebayField === 'description' ? 2000 : 150;
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
        } else if (config.ebayField !== 'description' && config.ebayField !== 'title' && generatedValue.length > 60) {
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
