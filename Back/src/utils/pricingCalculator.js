/**
 * Pricing Calculator Utility
 * 
 * Calculates eBay listing start price based on Amazon cost and template pricing configuration
 * 
 * Formula:
 * StartPrice = (
 *   (desiredProfit + (buyingPrice * spentRate)) / payoutRate + fixedFee
 * ) / (
 *   1 - (1 + saleTax/100) * (ebayFee/100 + adsFee/100 + tdsFee/100)
 * )
 * 
 * Where:
 * - buyingPrice (USD) = cost + shipping + tax
 * - tax (USD) = cost * (taxRate/100)
 * - desiredProfit can be fixed or tiered based on product cost
 */

/**
 * Determine applicable profit based on Amazon cost and tier configuration
 * @param {Number} amazonCost - Product cost in USD
 * @param {Object} pricingConfig - Pricing configuration with optional profitTiers
 * @returns {Number} - Applicable profit in INR
 */
function getApplicableProfit(amazonCost, pricingConfig) {
  // If tiered profit disabled or not configured, use fixed desiredProfit
  if (!pricingConfig.profitTiers?.enabled || !pricingConfig.profitTiers?.tiers?.length) {
    return pricingConfig.desiredProfit;
  }
  
  const tiers = pricingConfig.profitTiers.tiers;
  
  // Find matching tier
  for (const tier of tiers) {
    const meetsMin = amazonCost >= tier.minCost;
    const meetsMax = tier.maxCost === null || amazonCost < tier.maxCost;
    
    if (meetsMin && meetsMax) {
      return tier.profit;
    }
  }
  
  // Fallback to fixed profit if no tier matches
  return pricingConfig.desiredProfit;
}

/**
 * Calculate Start Price based on template pricing config and Amazon cost
 * 
 * @param {Object} pricingConfig - Template pricing configuration
 * @param {Number} pricingConfig.spentRate - USD to INR conversion rate for expenses
 * @param {Number} pricingConfig.payoutRate - USD to INR conversion rate for payouts
 * @param {Number} pricingConfig.desiredProfit - Desired profit in INR
 * @param {Number} pricingConfig.fixedFee - Fixed transaction fee in INR
 * @param {Number} pricingConfig.saleTax - Sales tax percentage
 * @param {Number} pricingConfig.ebayFee - eBay fee percentage
 * @param {Number} pricingConfig.adsFee - Ads fee percentage
 * @param {Number} pricingConfig.tdsFee - TDS fee percentage
 * @param {Number} pricingConfig.shippingCost - Shipping cost in USD
 * @param {Number} pricingConfig.taxRate - Tax rate on cost percentage
 * @param {Number} amazonCost - Cost from Amazon ASIN (in USD)
 * @returns {Object} { price: Number, breakdown: Object }
 * @throws {Error} If validation fails
 */
export function calculateStartPrice(pricingConfig, amazonCost) {
  // Validate inputs
  validatePricingConfig(pricingConfig);
  
  if (!amazonCost || isNaN(amazonCost) || amazonCost <= 0) {
    throw new Error('Invalid Amazon cost. Must be a positive number.');
  }
  
  // Extract values with defaults
  const {
    spentRate,
    payoutRate,
    desiredProfit,
    fixedFee = 0,
    saleTax = 0,
    ebayFee = 12.9,
    adsFee = 3,
    tdsFee = 1,
    shippingCost = 0,
    taxRate = 10
  } = pricingConfig;
  
  // Step 1: Calculate Tax($) = Cost($) * (taxRate/100)
  const taxUSD = amazonCost * (taxRate / 100);
  
  // Step 2: Calculate BuyingPrice($) = Cost($) + Ship($) + Tax($)
  const buyingPriceUSD = amazonCost + shippingCost + taxUSD;
  
  // Step 3: Convert BuyingPrice to INR using SpentRate
  const buyingPriceINR = buyingPriceUSD * spentRate;
  
  // Step 4: Determine applicable profit (tiered or fixed)
  const applicableProfit = getApplicableProfit(amazonCost, pricingConfig);
  
  // Step 5: Add applicable profit
  const profitComponent = applicableProfit + buyingPriceINR;
  
  // Step 6: Convert back to USD using PayoutRate
  const payoutUSD = profitComponent / payoutRate;
  
  // Step 7: Add fixed fee (convert from INR to USD)
  const withFixedFee = payoutUSD + (fixedFee / payoutRate);
  
  // Step 8: Calculate fee multiplier
  // 1 - (1 + SaleTax%) * (eBayFee% + Ads% + TDS%)
  const combinedFees = (ebayFee / 100) + (adsFee / 100) + (tdsFee / 100);
  const saleTaxMultiplier = 1 + (saleTax / 100);
  const feeMultiplier = 1 - (saleTaxMultiplier * combinedFees);
  
  if (feeMultiplier <= 0) {
    throw new Error('Invalid fee configuration. Fee multiplier must be positive. Check your percentage values.');
  }
  
  // Step 9: Final price
  const finalPrice = withFixedFee / feeMultiplier;
  
  // Validate result
  if (!isFinite(finalPrice) || finalPrice <= 0) {
    throw new Error('Calculated price is invalid. Please check your pricing configuration.');
  }
  
  // Round to 2 decimal places
  const roundedPrice = Math.round(finalPrice * 100) / 100;
  
  // Return price and breakdown for transparency
  return {
    price: roundedPrice,
    breakdown: {
      cost: amazonCost,
      shipping: shippingCost,
      taxRate: taxRate,
      tax: Math.round(taxUSD * 100) / 100,
      buyingPriceUSD: Math.round(buyingPriceUSD * 100) / 100,
      buyingPriceINR: Math.round(buyingPriceINR * 100) / 100,
      applicableProfit: applicableProfit,
      profitTier: pricingConfig.profitTiers?.enabled 
        ? { 
            enabled: true, 
            profit: applicableProfit,
            costRange: getCostRangeForProfit(amazonCost, pricingConfig.profitTiers.tiers)
          }
        : { 
            enabled: false, 
            profit: pricingConfig.desiredProfit 
          },
      desiredProfit: applicableProfit, // For compatibility
      profitComponent: Math.round(profitComponent * 100) / 100,
      payoutUSD: Math.round(payoutUSD * 100) / 100,
      fixedFee: fixedFee,
      withFixedFee: Math.round(withFixedFee * 100) / 100,
      feeMultiplier: Math.round(feeMultiplier * 10000) / 10000,
      finalPrice: roundedPrice
    }
  };
}

/**
 * Get cost range description for applied tier
 * @param {Number} cost - Amazon cost
 * @param {Array} tiers - Profit tiers array
 * @returns {String} - Cost range description
 */
function getCostRangeForProfit(cost, tiers) {
  for (const tier of tiers) {
    const meetsMin = cost >= tier.minCost;
    const meetsMax = tier.maxCost === null || cost < tier.maxCost;
    
    if (meetsMin && meetsMax) {
      const max = tier.maxCost === null ? '∞' : `$${tier.maxCost}`;
      return `$${tier.minCost} - ${max}`;
    }
  }
  return 'N/A';
}

/**
 * Validate pricing config has all required fields
 * @param {Object} config - Pricing configuration to validate
 * @throws {Error} If validation fails
 */
export function validatePricingConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Pricing config is required');
  }
  
  // If tiered profit is enabled, validate tiers instead of desiredProfit
  if (config.profitTiers?.enabled) {
    validateProfitTiers(config.profitTiers.tiers);
  } else {
    // Required fields for fixed profit mode
    const requiredFields = ['spentRate', 'payoutRate', 'desiredProfit'];
    
    for (const field of requiredFields) {
      if (!config[field] || isNaN(config[field]) || config[field] <= 0) {
        throw new Error(`${field} is required and must be a positive number`);
      }
    }
  }
  
  // Validate percentage fields (0-100)
  const percentageFields = ['saleTax', 'ebayFee', 'adsFee', 'tdsFee', 'taxRate'];
  
  for (const field of percentageFields) {
    if (config[field] !== undefined && config[field] !== null) {
      const value = config[field];
      if (isNaN(value) || value < 0 || value > 100) {
        throw new Error(`${field} must be between 0 and 100`);
      }
    }
  }
  
  // Validate non-negative fields
  const nonNegativeFields = ['fixedFee', 'shippingCost'];
  
  for (const field of nonNegativeFields) {
    if (config[field] !== undefined && config[field] !== null) {
      const value = config[field];
      if (isNaN(value) || value < 0) {
        throw new Error(`${field} must be a non-negative number`);
      }
    }
  }
}

/**
 * Validate profit tiers configuration
 * @param {Array} tiers - Array of tier objects
 * @throws {Error} If validation fails
 */
export function validateProfitTiers(tiers) {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    throw new Error('At least one profit tier is required when tiered profit is enabled');
  }
  
  // Sort by minCost for validation
  const sorted = [...tiers].sort((a, b) => a.minCost - b.minCost);
  
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    
    // Validate structure
    if (tier.minCost === undefined || tier.minCost === null || isNaN(tier.minCost) || tier.minCost < 0) {
      throw new Error(`Tier ${i + 1}: minCost must be a non-negative number`);
    }
    
    if (tier.profit === undefined || tier.profit === null || isNaN(tier.profit) || tier.profit <= 0) {
      throw new Error(`Tier ${i + 1}: profit must be a positive number`);
    }
    
    // Validate maxCost if present
    if (tier.maxCost !== null && tier.maxCost !== undefined) {
      if (isNaN(tier.maxCost) || tier.maxCost <= tier.minCost) {
        throw new Error(`Tier ${i + 1}: maxCost must be greater than minCost`);
      }
    }
    
    // Validate no overlap and continuity
    if (i < sorted.length - 1) {
      const nextTier = sorted[i + 1];
      
      if (tier.maxCost === null || tier.maxCost === undefined) {
        throw new Error(`Tier ${i + 1}: Only the last tier can have maxCost as null/unlimited`);
      }
      
      if (tier.maxCost > nextTier.minCost) {
        throw new Error(`Tier ${i + 1} and ${i + 2}: Ranges cannot overlap`);
      }
      
      if (tier.maxCost !== nextTier.minCost) {
        throw new Error(`Tier ${i + 1} and ${i + 2}: Ranges must be continuous (no gaps)`);
      }
    } else {
      // Last tier should have maxCost as null for unlimited
      if (tier.maxCost !== null && tier.maxCost !== undefined) {
        console.warn('Last tier should have maxCost = null for unlimited range');
      }
    }
  }
  
  return true;
}

/**
 * Get default pricing config
 * @returns {Object} Default pricing configuration
 */
export function getDefaultPricingConfig() {
  return {
    enabled: false,
    spentRate: null,
    payoutRate: null,
    desiredProfit: null,
    fixedFee: 0,
    saleTax: 0,
    ebayFee: 12.9,
    adsFee: 3,
    tdsFee: 1,
    shippingCost: 0,
    taxRate: 10,
    profitTiers: {
      enabled: false,
      tiers: []
    }
  };
}
