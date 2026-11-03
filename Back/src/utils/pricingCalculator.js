/**
 * Pricing Calculator — settlement model for start price (sold = x, USD).
 *
 * Sell side: fee base A = sold × (1 + saleTax/100) from template (default saleTax 10 → A = 1.1×sold).
 *   eBay USD  = A × (ebayFee/100) + ebayFixedUsd   (defaults 13.95% + 0.40 USD)
 *   ADS USD   = A × (ads%/100)                  (default 15%)
 *   TDS USD   = A × (tds%/100)                  (default 1%)
 *   T.Cont USD = transactionContUsd             (default 0.24)
 *   Net USD   = sold − eBay − ADS − TDS − T.Cont
 *
 * Buy side (INR):
 *   buyingPriceUSD = cost + shipping + cost×(taxRate/100)
 *   buyingPriceINR = buyingPriceUSD × spentRate
 *
 * Target profit (INR) = payoutRate × NetUSD − buyingPriceINR
 * Solve for sold:  sold = (P + buyingPriceINR + payout×fixedUsd) / (payout × netCoeff)
 *   where netCoeff = 1 − (1+saleTax/100)×((eBay%+ads%+tds%)/100)
 *         fixedUsd = ebayFixedUsd + transactionContUsd
 */

/** Standard tiered profit (Amazon cost USD → target INR profit). */
export const DEFAULT_PROFIT_TIERS = [
  { minCost: 0, maxCost: 20, profit: 500 },
  { minCost: 20, maxCost: 40, profit: 900 },
  { minCost: 40, maxCost: null, profit: 1500 },
];

/**
 * Determine applicable profit based on Amazon cost and tier configuration
 * @param {Number} amazonCost - Product cost in USD
 * @param {Object} pricingConfig - Pricing configuration with optional profitTiers
 * @returns {Number} - Applicable profit in INR
 */
function getApplicableProfit(amazonCost, pricingConfig) {
  if (!pricingConfig.profitTiers?.enabled || !pricingConfig.profitTiers?.tiers?.length) {
    return pricingConfig.desiredProfit;
  }

  const tiers = pricingConfig.profitTiers.tiers;

  for (const tier of tiers) {
    if (costInTier(amazonCost, tier)) {
      return Number(tier.profit);
    }
  }

  return pricingConfig.desiredProfit;
}

/** null, undefined or '' maxCost means "no upper limit" (validation already treats them alike). */
function costInTier(cost, tier) {
  const unlimited = tier.maxCost === null || tier.maxCost === undefined || tier.maxCost === '';
  return cost >= Number(tier.minCost) && (unlimited || cost < Number(tier.maxCost));
}

/**
 * @param {Object} pricingConfig - Template pricing configuration
 * @param {Number} amazonCost - Cost from Amazon ASIN (USD)
 * @returns {Object} { price: Number, breakdown: Object }
 */
export function calculateStartPrice(pricingConfig, amazonCost) {
  validatePricingConfig(pricingConfig);

  if (!amazonCost || isNaN(amazonCost) || amazonCost <= 0) {
    throw new Error('Invalid Amazon cost. Must be a positive number.');
  }

  const {
    spentRate,
    payoutRate,
    shippingCost = 0,
    taxRate = 10
  } = pricingConfig;

  const saleTaxPct = Number(pricingConfig.saleTax ?? 10);
  const ebayFeePct = Number(pricingConfig.ebayFee ?? 13.95);
  const adsFeePct =
    pricingConfig.adsFee !== undefined && pricingConfig.adsFee !== null
      ? Number(pricingConfig.adsFee)
      : 15;
  const tdsFeePct =
    pricingConfig.tdsFee !== undefined && pricingConfig.tdsFee !== null
      ? Number(pricingConfig.tdsFee)
      : 1;
  const ebayFixedUsd =
    pricingConfig.ebayFixedUsd !== undefined && pricingConfig.ebayFixedUsd !== null
      ? Number(pricingConfig.ebayFixedUsd)
      : 0.4;
  const transactionContUsd =
    pricingConfig.transactionContUsd !== undefined && pricingConfig.transactionContUsd !== null
      ? Number(pricingConfig.transactionContUsd)
      : 0.24;

  const taxUSD = amazonCost * (taxRate / 100);
  const buyingPriceUSD = amazonCost + shippingCost + taxUSD;
  const buyingPriceINR = buyingPriceUSD * spentRate;

  const applicableProfit = getApplicableProfit(amazonCost, pricingConfig);

  const sellFeeBaseMult = 1 + saleTaxPct / 100;
  const sumPctOnA = ebayFeePct / 100 + adsFeePct / 100 + tdsFeePct / 100;
  const netCoeffOnSold = 1 - sellFeeBaseMult * sumPctOnA;
  const fixedUsdPrePayout = ebayFixedUsd + transactionContUsd;

  if (!isFinite(netCoeffOnSold) || netCoeffOnSold <= 0) {
    throw new Error(
      'Invalid fee configuration. Combined eBay/ADS/TDS percentages and sale tax produce a non-positive net coefficient.'
    );
  }
  if (!payoutRate || isNaN(payoutRate) || payoutRate <= 0) {
    throw new Error('payoutRate is required and must be a positive number');
  }

  const numerator = applicableProfit + buyingPriceINR + payoutRate * fixedUsdPrePayout;
  const denominator = payoutRate * netCoeffOnSold;
  const rawPrice = numerator / denominator;

  if (!isFinite(rawPrice) || rawPrice <= 0) {
    throw new Error('Calculated price is invalid. Please check your pricing configuration.');
  }

  // Round up to the cent so the implied profit never lands below the target.
  const roundedPrice = Math.ceil(rawPrice * 100 - 1e-9) / 100;

  const sold = roundedPrice;
  const A = sold * sellFeeBaseMult;
  const eBayFeeUsd = A * (ebayFeePct / 100) + ebayFixedUsd;
  const adsFeeUsd = A * (adsFeePct / 100);
  const tdsFeeUsd = A * (tdsFeePct / 100);
  const netUsd = sold - eBayFeeUsd - adsFeeUsd - tdsFeeUsd - transactionContUsd;
  const payoneerInr = netUsd * payoutRate;
  const impliedProfitInr = payoneerInr - buyingPriceINR;

  return {
    price: roundedPrice,
    breakdown: {
      pricingModel: 'settlement_v1',
      cost: amazonCost,
      spentRate,
      payoutRate,
      saleTax: saleTaxPct,
      ebayFee: ebayFeePct,
      adsFee: adsFeePct,
      tdsFee: tdsFeePct,
      ebayFixedUsd,
      transactionContUsd,
      sellFeeBaseMult: Math.round(sellFeeBaseMult * 10000) / 10000,
      netCoeffOnSold: Math.round(netCoeffOnSold * 1e6) / 1e6,
      fixedUsdPrePayout: Math.round(fixedUsdPrePayout * 100) / 100,
      shipping: shippingCost,
      taxRate,
      tax: Math.round(taxUSD * 100) / 100,
      buyingPriceUSD: Math.round(buyingPriceUSD * 100) / 100,
      buyingPriceINR: Math.round(buyingPriceINR * 100) / 100,
      applicableProfit,
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
      desiredProfit: applicableProfit,
      soldPlusTax: Math.round(A * 100) / 100,
      eBayFeeUsd: Math.round(eBayFeeUsd * 100) / 100,
      adsFeeUsd: Math.round(adsFeeUsd * 100) / 100,
      tdsFeeUsd: Math.round(tdsFeeUsd * 100) / 100,
      netUsd: Math.round(netUsd * 100) / 100,
      payoneerInr: Math.round(payoneerInr * 100) / 100,
      impliedProfitInr: Math.round(impliedProfitInr * 100) / 100,
      finalPrice: roundedPrice
    }
  };
}

function getCostRangeForProfit(cost, tiers) {
  for (const tier of tiers) {
    if (costInTier(cost, tier)) {
      const max = tier.maxCost === null || tier.maxCost === undefined || tier.maxCost === '' ? '∞' : `$${tier.maxCost}`;
      return `$${tier.minCost} - ${max}`;
    }
  }
  return 'N/A';
}

export function validatePricingConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Pricing config is required');
  }

  if (config.profitTiers?.enabled) {
    validateProfitTiers(config.profitTiers.tiers);
  } else {
    const requiredFields = ['spentRate', 'payoutRate', 'desiredProfit'];

    for (const field of requiredFields) {
      if (!config[field] || isNaN(config[field]) || config[field] <= 0) {
        throw new Error(`${field} is required and must be a positive number`);
      }
    }
  }

  if (!config.spentRate || isNaN(config.spentRate) || config.spentRate <= 0) {
    throw new Error('spentRate is required and must be a positive number');
  }
  if (!config.payoutRate || isNaN(config.payoutRate) || config.payoutRate <= 0) {
    throw new Error('payoutRate is required and must be a positive number');
  }

  const percentageFields = ['saleTax', 'ebayFee', 'adsFee', 'tdsFee', 'taxRate'];

  for (const field of percentageFields) {
    if (config[field] !== undefined && config[field] !== null) {
      const value = config[field];
      if (isNaN(value) || value < 0 || value > 100) {
        throw new Error(`${field} must be between 0 and 100`);
      }
    }
  }

  const nonNegativeFields = ['shippingCost', 'ebayFixedUsd', 'transactionContUsd'];

  for (const field of nonNegativeFields) {
    if (config[field] !== undefined && config[field] !== null) {
      const value = config[field];
      if (isNaN(value) || value < 0) {
        throw new Error(`${field} must be a non-negative number`);
      }
    }
  }
}

export function validateProfitTiers(tiers) {
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    throw new Error('At least one profit tier is required when tiered profit is enabled');
  }

  const sorted = [...tiers].sort((a, b) => a.minCost - b.minCost);

  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];

    if (tier.minCost === undefined || tier.minCost === null || isNaN(tier.minCost) || tier.minCost < 0) {
      throw new Error(`Tier ${i + 1}: minCost must be a non-negative number`);
    }

    if (tier.profit === undefined || tier.profit === null || isNaN(tier.profit) || tier.profit <= 0) {
      throw new Error(`Tier ${i + 1}: profit must be a positive number`);
    }

    if (tier.maxCost !== null && tier.maxCost !== undefined) {
      if (isNaN(tier.maxCost) || tier.maxCost <= tier.minCost) {
        throw new Error(`Tier ${i + 1}: maxCost must be greater than minCost`);
      }
    }

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
      if (tier.maxCost !== null && tier.maxCost !== undefined) {
        console.warn('Last tier should have maxCost = null for unlimited range');
      }
    }
  }

  return true;
}

export function getDefaultPricingConfig() {
  return {
    enabled: false,
    spentRate: null,
    payoutRate: null,
    desiredProfit: null,
    saleTax: 10,
    ebayFee: 13.95,
    adsFee: 15,
    tdsFee: 1,
    ebayFixedUsd: 0.4,
    transactionContUsd: 0.24,
    shippingCost: 0,
    taxRate: 10,
    profitTiers: {
      enabled: false,
      tiers: DEFAULT_PROFIT_TIERS.map((t) => ({ ...t })),
    },
  };
}
