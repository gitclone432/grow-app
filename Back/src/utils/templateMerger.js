import ListingTemplate from '../models/ListingTemplate.js';
import TemplateOverride from '../models/TemplateOverride.js';

/**
 * Merge base template with seller-specific overrides
 * @param {Object} baseTemplate - The global template document
 * @param {Object} override - Seller's override document (or null)
 * @returns {Object} - Merged effective template
 */
export function mergeTemplate(baseTemplate, override) {
  if (!override) {
    // No overrides, return base template as-is
    return baseTemplate;
  }
  
  // Convert to plain object if it's a Mongoose document
  const merged = baseTemplate.toObject ? baseTemplate.toObject() : { ...baseTemplate };
  
  // Apply overrides based on flags
  if (override.overrides.customColumns && override.customColumns) {
    merged.customColumns = override.customColumns;
  }
  
  if (override.overrides.asinAutomation && override.asinAutomation) {
    merged.asinAutomation = override.asinAutomation;
  }
  
  if (override.overrides.pricingConfig && override.pricingConfig) {
    merged.pricingConfig = override.pricingConfig;
  }
  
  if (override.overrides.coreFieldDefaults && override.coreFieldDefaults) {
    merged.coreFieldDefaults = override.coreFieldDefaults;
  }
  
  if (override.overrides.customActionField && override.customActionField) {
    merged.customActionField = override.customActionField;
  }
  
  // Add metadata about override status
  merged._isOverridden = true;
  merged._overrideId = override._id;
  merged._sellerId = override.sellerId;
  merged._overrideFlags = override.overrides;
  
  return merged;
}

/**
 * Get effective template for a seller
 * Fetches base template + override, then merges
 * @param {String} templateId - ID of the base template
 * @param {String} sellerId - ID of the seller (optional)
 * @returns {Object} - Effective template (merged if override exists)
 */
export async function getEffectiveTemplate(templateId, sellerId) {
  // Fetch base template
  const baseTemplate = await ListingTemplate.findById(templateId);
  
  if (!baseTemplate) {
    throw new Error('Template not found');
  }
  
  // If no seller context, return base template
  if (!sellerId) {
    return baseTemplate;
  }
  
  // Fetch seller's override (if exists)
  const override = await TemplateOverride.findOne({
    baseTemplateId: templateId,
    sellerId: sellerId
  });
  
  // Merge and return
  return mergeTemplate(baseTemplate, override);
}

/**
 * Get effective template with populated references
 * @param {String} templateId - ID of the base template
 * @param {String} sellerId - ID of the seller (optional)
 * @param {String} populateFields - Fields to populate (e.g., 'createdBy')
 * @returns {Object} - Effective template with populated fields
 */
export async function getEffectiveTemplateWithPopulate(templateId, sellerId, populateFields = '') {
  // Fetch base template with population
  const baseTemplate = await ListingTemplate.findById(templateId).populate(populateFields);
  
  if (!baseTemplate) {
    throw new Error('Template not found');
  }
  
  // If no seller context, return base template
  if (!sellerId) {
    return baseTemplate;
  }
  
  // Fetch seller's override (if exists)
  const override = await TemplateOverride.findOne({
    baseTemplateId: templateId,
    sellerId: sellerId
  });
  
  // Merge and return
  return mergeTemplate(baseTemplate, override);
}

/**
 * Check if a seller has any overrides for a template
 * @param {String} templateId - ID of the base template
 * @param {String} sellerId - ID of the seller
 * @returns {Boolean} - True if seller has overrides
 */
export async function hasOverride(templateId, sellerId) {
  if (!sellerId) {
    return false;
  }
  
  const override = await TemplateOverride.findOne({
    baseTemplateId: templateId,
    sellerId: sellerId
  });
  
  return !!override;
}

/**
 * Get count of sellers who have customized a template
 * @param {String} templateId - ID of the base template
 * @returns {Number} - Count of overrides
 */
export async function getOverrideCount(templateId) {
  return await TemplateOverride.countDocuments({
    baseTemplateId: templateId
  });
}

/**
 * Get list of all sellers who have overridden a template
 * @param {String} templateId - ID of the base template
 * @returns {Array} - Array of seller IDs
 */
export async function getOverriddenSellers(templateId) {
  const overrides = await TemplateOverride.find({
    baseTemplateId: templateId
  }).select('sellerId');
  
  return overrides.map(o => o.sellerId);
}
