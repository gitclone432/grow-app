/** Etsy sold-price calculator — matches the Excel pricing worksheet model. */

export const ETSY_SOLD_PRICE_DEFAULTS = {
  supplierExRate: 90,
  etsyGrossExRate: 85,
  etsySoldExRate: 90,
  supplierTaxRate: 0.10,
  ccChargeRate: 0.035,
  igstRate: 0.18,
  soldTaxRate: 0.10,
  etsyFeeRate: 0.065,
  processingRate: 0.05,
  processingFixed: 25,
  operatingRate: 0.0029,
  relistFee: 18,
  tdsTcsRate: 0.006,
  offsiteAdsRate: 0.15,
  trackingIdFee: 21.6,
};

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function parseUsd(value) {
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function parseInr(value) {
  return parseUsd(value);
}

function mergeConfig(config = {}) {
  return { ...ETSY_SOLD_PRICE_DEFAULTS, ...config };
}

export function computeSupplierBreakdown({ cost = 0, ship = 0, config = {} } = {}) {
  const settings = mergeConfig(config);
  const costShip = round2(cost + ship);
  const tax = round2(costShip * settings.supplierTaxRate);
  const buyingPrice = round2(costShip + tax);
  const ccCharge = round2(buyingPrice * settings.ccChargeRate);
  const igst = round2(ccCharge * settings.igstRate);
  const totalCc = round2(ccCharge + igst);
  const inrCost = round2(settings.supplierExRate * (buyingPrice + totalCc));

  return {
    costShip,
    tax,
    buyingPrice,
    ccCharge,
    igst,
    totalCc,
    inrCost,
  };
}

export function computeSoldPriceBreakdown({
  soldPriceUsd = 0,
  coupon = 0,
  inrCost = 0,
  config = {},
} = {}) {
  const settings = mergeConfig(config);
  const soldPrice = round2(soldPriceUsd);
  const soldTax = round2(soldPrice * settings.soldTaxRate);
  const grossWithTax = round2(soldPrice + soldTax);
  const grossMultiplier = 1 + settings.soldTaxRate;

  const etsyFee = round2(settings.etsyFeeRate * soldPrice * settings.etsySoldExRate);
  const processingFee = round2((settings.processingRate * grossWithTax * settings.etsyGrossExRate) + settings.processingFixed);
  const operatingFee = round2(settings.operatingRate * grossWithTax * settings.etsyGrossExRate);
  const relistFee = round2(settings.relistFee);
  const tdsTcs = round2(settings.tdsTcsRate * grossWithTax * settings.etsyGrossExRate);
  const offsiteAds = round2(settings.offsiteAdsRate * soldPrice * settings.etsySoldExRate);
  const couponAmount = round2(coupon);
  const trackingIdFee = round2(settings.trackingIdFee);

  const netInr = round2(
    (grossWithTax * settings.etsyGrossExRate)
    - (soldTax * settings.etsyGrossExRate)
    - etsyFee
    - processingFee
    - operatingFee
    - relistFee
    - tdsTcs
    - offsiteAds
    - couponAmount
    - trackingIdFee
  );

  const profitInr = round2(netInr - inrCost);

  const soldPriceCoefficient = round2(
    settings.etsyGrossExRate
    - (settings.etsyFeeRate * settings.etsySoldExRate)
    - (settings.processingRate * grossMultiplier * settings.etsyGrossExRate)
    - (settings.operatingRate * grossMultiplier * settings.etsyGrossExRate)
    - (settings.tdsTcsRate * grossMultiplier * settings.etsyGrossExRate)
    - (settings.offsiteAdsRate * settings.etsySoldExRate)
  );

  const fixedFees = round2(settings.processingFixed + relistFee + trackingIdFee + couponAmount);

  return {
    soldPrice,
    soldTax,
    grossWithTax,
    etsyFee,
    processingFee,
    operatingFee,
    relistFee,
    tdsTcs,
    offsiteAds,
    couponAmount,
    trackingIdFee,
    netInr,
    profitInr,
    soldPriceCoefficient,
    fixedFees,
  };
}

export function calculateSoldPriceFromTargetProfit({
  cost = 0,
  ship = 0,
  targetProfit = 0,
  coupon = 0,
  config = {},
} = {}) {
  const supplier = computeSupplierBreakdown({ cost, ship, config });
  const settings = mergeConfig(config);
  const grossMultiplier = 1 + settings.soldTaxRate;

  const soldPriceCoefficient = round2(
    settings.etsyGrossExRate
    - (settings.etsyFeeRate * settings.etsySoldExRate)
    - (settings.processingRate * grossMultiplier * settings.etsyGrossExRate)
    - (settings.operatingRate * grossMultiplier * settings.etsyGrossExRate)
    - (settings.tdsTcsRate * grossMultiplier * settings.etsyGrossExRate)
    - (settings.offsiteAdsRate * settings.etsySoldExRate)
  );

  const fixedFees = round2(settings.processingFixed + settings.relistFee + settings.trackingIdFee + coupon);

  if (soldPriceCoefficient <= 0) {
    return {
      soldPriceUsd: 0,
      supplier,
      breakdown: null,
      error: 'Fee settings leave no room for a positive sold price.',
    };
  }

  const soldPriceUsd = round2((targetProfit + supplier.inrCost + fixedFees) / soldPriceCoefficient);
  const breakdown = computeSoldPriceBreakdown({
    soldPriceUsd,
    coupon,
    inrCost: supplier.inrCost,
    config,
  });

  return {
    soldPriceUsd,
    supplier,
    breakdown,
    error: '',
  };
}

export function calculateProfitFromSoldPrice({
  cost = 0,
  ship = 0,
  soldPriceUsd = 0,
  coupon = 0,
  config = {},
} = {}) {
  const supplier = computeSupplierBreakdown({ cost, ship, config });
  const breakdown = computeSoldPriceBreakdown({
    soldPriceUsd,
    coupon,
    inrCost: supplier.inrCost,
    config,
  });

  return {
    soldPriceUsd: breakdown.soldPrice,
    supplier,
    breakdown,
    error: '',
  };
}

export function formatUsdAmount(value) {
  return `$${round2(value).toFixed(2)}`;
}

export function formatInrAmount(value) {
  return `₹${round2(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
