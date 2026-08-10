import ExchangeRate from '../models/ExchangeRate.js';

const exchangeRateRecordCache = new Map();
const PACIFIC_TIMEZONE = 'America/Los_Angeles';

export function clearExchangeRateRecordCache(marketplace = null) {
  if (!marketplace) {
    exchangeRateRecordCache.clear();
    return;
  }

  const normalizedMarketplace = String(marketplace).toUpperCase();
  for (const cacheKey of exchangeRateRecordCache.keys()) {
    if (cacheKey.startsWith(`${normalizedMarketplace}:`)) {
      exchangeRateRecordCache.delete(cacheKey);
    }
  }
}

export const EXCHANGE_RATE_MARKETPLACES = [
  'EBAY',
  'AMAZON',
  'EBAY_US',
  'EBAY_CA',
  'EBAY_AU',
  'EBAY_GB',
  'AMAZON_US',
  'AMAZON_CA',
  'AMAZON_AU',
  'AMAZON_GB',
  'OTHER'
];

const REGION_ALIASES = {
  US: ['EBAY_US', 'US'],
  CA: ['EBAY_CA', 'EBAY_ENCA', 'CA'],
  AU: ['EBAY_AU', 'AU'],
  GB: ['EBAY_GB', 'GB', 'UK']
};

const EFFECTIVE_APPLICATION_MODES = [
  { applicationMode: 'effective' },
  { applicationMode: { $exists: false } },
  { applicationMode: null }
];

export function getExchangeRateDefaultValue(marketplace = 'EBAY_US') {
  return String(marketplace).startsWith('AMAZON') ? 87 : 82;
}

export function getPacificDayBounds(dateInput) {
  const date = new Date(dateInput);
  const dateString = Number.isNaN(date.getTime())
    ? String(dateInput).split('T')[0]
    : date.toISOString().slice(0, 10);

  const findPacificMidnightUtc = (dayString) => {
    const pdt = new Date(`${dayString}T07:00:00.000Z`);
    const pacificDateString = new Intl.DateTimeFormat('en-CA', {
      timeZone: PACIFIC_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(pdt);
    const pacificHour = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: PACIFIC_TIMEZONE,
      hour: 'numeric',
      hour12: false,
      hourCycle: 'h23'
    }).format(pdt), 10);

    if (pacificDateString === dayString && pacificHour === 0) {
      return pdt;
    }

    return new Date(`${dayString}T08:00:00.000Z`);
  };

  const start = findPacificMidnightUtc(dateString);
  const nextDay = new Date(`${dateString}T12:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const nextDateString = nextDay.toISOString().slice(0, 10);
  const end = new Date(findPacificMidnightUtc(nextDateString).getTime() - 1);
  return { start, end };
}

export function getUtcDayBounds(dateInput) {
  return getPacificDayBounds(dateInput);
}

export function getMarketplaceRegionFromPurchaseMarketplace(purchaseMarketplaceId = '') {
  const marketplaceId = String(purchaseMarketplaceId || '').toUpperCase();

  if (REGION_ALIASES.CA.includes(marketplaceId)) return 'CA';
  if (REGION_ALIASES.AU.includes(marketplaceId)) return 'AU';
  if (REGION_ALIASES.GB.includes(marketplaceId)) return 'GB';
  return 'US';
}

export function getExchangeRateMarketplace(channel = 'EBAY', purchaseMarketplaceId = '') {
  const normalizedChannel = String(channel || 'EBAY').toUpperCase().startsWith('AMAZON') ? 'AMAZON' : 'EBAY';
  const region = getMarketplaceRegionFromPurchaseMarketplace(purchaseMarketplaceId);
  return `${normalizedChannel}_${region}`;
}

export function getOrderRateDate(order = {}) {
  return order.dateSold || order.creationDate || new Date();
}

export function getOrderTotalAmount(order = {}) {
  const storedOrderTotal = parseFloat(order.orderTotal);
  if (Number.isFinite(storedOrderTotal)) {
    return storedOrderTotal;
  }

  const pricingTotal = parseFloat(order.pricingSummary?.total?.value);
  const salesTax = parseFloat(order.salesTax);
  return (Number.isFinite(pricingTotal) ? pricingTotal : 0) + (Number.isFinite(salesTax) ? salesTax : 0);
}

/** Default estimated TDS before Finances poll: 0.1% of subtotal. */
export const CALCULATED_TDS_RATE = 0.001;

export function getOrderSubtotalForTds(order = {}) {
  const subtotal = parseFloat(order.subtotal);
  if (Number.isFinite(subtotal)) return subtotal;
  const subtotalUsd = parseFloat(order.subtotalUSD);
  if (Number.isFinite(subtotalUsd)) return subtotalUsd;
  return 0;
}

/** Calculated TDS placeholder — replaced by eBay Finances when Poll TDS / fetch runs. */
export function computeCalculatedTds(order = {}) {
  return parseFloat((getOrderSubtotalForTds(order) * CALCULATED_TDS_RATE).toFixed(2));
}

export function isAmazonRateMarketplace(marketplace = '') {
  return String(marketplace).toUpperCase().startsWith('AMAZON');
}

function getRateFallbackMarketplaces(marketplace = '') {
  const upperMarketplace = String(marketplace).toUpperCase();
  if (upperMarketplace.startsWith('AMAZON_')) return ['AMAZON'];
  if (upperMarketplace.startsWith('EBAY_')) return ['EBAY'];
  return [];
}

async function findSpecificDateRate(marketplace, dateInput) {
  const { start, end } = getPacificDayBounds(dateInput);
  return ExchangeRate.findOne({
    marketplace,
    applicationMode: 'specific-date',
    effectiveDate: { $gte: start, $lte: end }
  }).sort({ createdAt: -1, effectiveDate: -1 });
}

async function findEffectiveRate(marketplace, dateInput) {
  const targetDate = new Date(dateInput);
  return ExchangeRate.findOne({
    marketplace,
    effectiveDate: { $lte: targetDate },
    $or: EFFECTIVE_APPLICATION_MODES
  }).sort({ effectiveDate: -1, createdAt: -1 });
}

function buildExchangeRateCacheKey(dateInput, marketplace) {
  const date = new Date(dateInput);
  const dateKey = Number.isNaN(date.getTime())
    ? String(dateInput)
    : date.toISOString().slice(0, 10);
  return `${marketplace}:${dateKey}`;
}

export async function getExchangeRateRecordForDate(dateInput, marketplace = 'EBAY_US') {
  const cacheKey = buildExchangeRateCacheKey(dateInput, marketplace);
  if (exchangeRateRecordCache.has(cacheKey)) {
    return exchangeRateRecordCache.get(cacheKey);
  }

  const exactSpecificRate = await findSpecificDateRate(marketplace, dateInput);
  if (exactSpecificRate) {
    exchangeRateRecordCache.set(cacheKey, exactSpecificRate);
    return exactSpecificRate;
  }

  const effectiveRate = await findEffectiveRate(marketplace, dateInput);
  if (effectiveRate) {
    exchangeRateRecordCache.set(cacheKey, effectiveRate);
    return effectiveRate;
  }

  for (const fallbackMarketplace of getRateFallbackMarketplaces(marketplace)) {
    const fallbackSpecificRate = await findSpecificDateRate(fallbackMarketplace, dateInput);
    if (fallbackSpecificRate) {
      exchangeRateRecordCache.set(cacheKey, fallbackSpecificRate);
      return fallbackSpecificRate;
    }

    const fallbackEffectiveRate = await findEffectiveRate(fallbackMarketplace, dateInput);
    if (fallbackEffectiveRate) {
      exchangeRateRecordCache.set(cacheKey, fallbackEffectiveRate);
      return fallbackEffectiveRate;
    }
  }

  exchangeRateRecordCache.set(cacheKey, null);
  return null;
}

export async function getCurrentExchangeRateRecord(marketplace = 'EBAY_US') {
  return getExchangeRateRecordForDate(new Date(), marketplace);
}

export function getPurchaseMarketplaceQueryForRateMarketplace(marketplace = 'EBAY_US') {
  const upperMarketplace = String(marketplace).toUpperCase();

  if (upperMarketplace.endsWith('_CA')) {
    return { $in: REGION_ALIASES.CA };
  }

  if (upperMarketplace.endsWith('_AU')) {
    return { $in: REGION_ALIASES.AU };
  }

  if (upperMarketplace.endsWith('_GB')) {
    return { $in: REGION_ALIASES.GB };
  }

  if (upperMarketplace === 'EBAY' || upperMarketplace === 'AMAZON' || upperMarketplace.endsWith('_US')) {
    return { $in: REGION_ALIASES.US };
  }

  return { $exists: true, $ne: null };
}

/**
 * Earnings from All Orders / Fulfilment component columns.
 * US/CA/etc: subtotal − |discount| − transactionFees − adFeeGeneral − shipping
 * EBAY_AU / EBAY_GB / EBAY_CA: totalDueSellerUSD − adFeeGeneral (same currency USD)
 * FULLY_REFUNDED → -0.40
 * PARTIALLY_REFUNDED (US) → pre-refund earnings − net refund + ad fee credit
 * PARTIALLY_REFUNDED (AU/GB/CA) → totalDueSellerUSD − adFeeGeneral (post-refund due)
 *
 * Partial-refund fee credits follow eBay Help (id=4128):
 * creditRatio = buyerRefundTotal / originalOrderTotal
 * (= purchaseRefund / purchasePrice when tax is proportional)
 * Credits apply to variable FVF + international + Promoted Listings General.
 * Per-order fixed fee is NOT credited on voluntary partial refunds.
 */
export const FULLY_REFUNDED_ORDER_EARNINGS = -0.40;
/** Defect floor — keep partial-refund earnings at or above this. */
export const PARTIAL_REFUND_TARGET_EARNINGS = 1.10;
/** US managed-payments per-order fixed FVF component (not credited on voluntary partial). */
export const EBAY_PER_ORDER_FIXED_FEE = 0.40;

export function isEbayAuOrder(order = {}) {
  const mp = String(order?.purchaseMarketplaceId || '').toUpperCase();
  return mp === 'EBAY_AU' || mp === 'EBAY_AUS';
}

export function isEbayGbOrder(order = {}) {
  const mp = String(order?.purchaseMarketplaceId || '').toUpperCase();
  return mp === 'EBAY_GB' || mp === 'EBAY_UK' || mp === 'GB' || mp === 'UK';
}

export function isEbayCaOrder(order = {}) {
  const mp = String(order?.purchaseMarketplaceId || '').toUpperCase();
  return mp === 'EBAY_CA' || mp === 'EBAY_ENCA' || mp === 'EBAY_MOTORS_CA' || mp === 'CA';
}

/** AU/UK/CA earnings use totalDueSellerUSD − adFee (not local component columns). */
export function usesTotalDueSellerMinusAdFeeEarnings(order = {}) {
  return isEbayAuOrder(order) || isEbayGbOrder(order) || isEbayCaOrder(order);
}

/** USD total due seller from denormalized field or paymentSummary. */
export function getTotalDueSellerUsd(order = {}) {
  if (order.totalDueSellerUSD != null && order.totalDueSellerUSD !== '') {
    const n = parseFloat(order.totalDueSellerUSD);
    return Number.isFinite(n) ? n : null;
  }
  const due = order.paymentSummary?.totalDueSeller;
  if (due?.value != null && due.value !== '') {
    const n = parseFloat(due.value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Purchase price on eBay "Enter refund amount" (= subtotal − |discount| + shipping). */
export function getOrderPurchasePrice(order = {}) {
  const subtotal = parseFloat(order.subtotal) || 0;
  const discount = Math.abs(parseFloat(order.discount) || 0);
  const shipping = parseFloat(order.shipping) || 0;
  return parseFloat((subtotal - discount + shipping).toFixed(2));
}

/** Variable marketplace fees eligible for proportional partial-refund credit. */
export function getOrderCreditableTransactionFees(order = {}) {
  const txn = parseFloat(order.transactionFees) || 0;
  return Math.max(0, parseFloat((txn - EBAY_PER_ORDER_FIXED_FEE).toFixed(2)));
}

/**
 * eBay credit ratio for partial refunds.
 * buyerRefundTotal / orderTotal ≡ purchaseRefund / purchasePrice when tax is proportional.
 */
export function getPartialRefundCreditRatio(purchaseRefund, purchasePrice) {
  const R = parseFloat(purchaseRefund) || 0;
  const P = parseFloat(purchasePrice) || 0;
  if (!(P > 0) || !(R > 0)) return 0;
  return R / P;
}

/** PAID-style earnings (ignores refund payment status). AU/UK/CA use totalDueSeller − ad fee. */
export function computePaidOrderEarningsFromComponents(order = {}) {
  const adFeeGeneral = parseFloat(order.adFeeGeneral) || 0;

  if (usesTotalDueSellerMinusAdFeeEarnings(order)) {
    const dueUsd = getTotalDueSellerUsd(order);
    if (dueUsd != null) {
      return parseFloat((dueUsd - adFeeGeneral).toFixed(2));
    }
  }

  const subtotal = parseFloat(order.subtotal) || 0;
  const discount = Math.abs(parseFloat(order.discount) || 0);
  const transactionFees = parseFloat(order.transactionFees) || 0;
  const shipping = parseFloat(order.shipping) || 0;
  return parseFloat(
    (subtotal - discount - transactionFees - adFeeGeneral - shipping).toFixed(2)
  );
}

function sumRefundAmounts(refunds) {
  if (!Array.isArray(refunds) || refunds.length === 0) return 0;
  return refunds.reduce((sum, refund) => {
    const amt = parseFloat(refund?.amount?.value ?? refund?.refundAmount?.value ?? 0);
    return sum + (Number.isFinite(amt) ? amt : 0);
  }, 0);
}

/** Net taken from seller funds (paymentSummary.refunds). */
export function getOrderNetRefundAmount(order = {}) {
  return parseFloat(
    sumRefundAmounts(order.refunds || order.paymentSummary?.refunds).toFixed(2)
  );
}

/** Buyer purchase-price refund (lineItems[].refunds). */
export function getOrderBuyerPurchaseRefundAmount(order = {}) {
  const lineItems = order.lineItems || [];
  let total = 0;
  for (const li of lineItems) {
    total += sumRefundAmounts(li?.refunds);
  }
  return parseFloat(total.toFixed(2));
}

/**
 * Pre-refund calculator: Enter refund amount R so after-earnings ≈ target ($1.10).
 * Uses DB PAID fields + eBay proportional fee-credit rule (actual fees − fixed).
 */
export function computePartialRefundEnterAmount(
  order = {},
  target = PARTIAL_REFUND_TARGET_EARNINGS
) {
  const P = getOrderPurchasePrice(order);
  const Tax = parseFloat(order.salesTax) || 0;
  const A = parseFloat(
    order.preRefundAdFeeGeneral != null ? order.preRefundAdFeeGeneral : order.adFeeGeneral
  ) || 0;
  const variableFees = getOrderCreditableTransactionFees(order);
  const E0 = order.preRefundOrderEarnings != null
    ? parseFloat(order.preRefundOrderEarnings)
    : computePaidOrderEarningsFromComponents({ ...order, adFeeGeneral: A });

  if (!(P > 0) || !Number.isFinite(E0)) return null;

  // after = E0 − R + creditRatio×variableFees + creditRatio×A, creditRatio = R/P
  // ⇒ after = E0 − R × (1 − variableFees/P − A/P)
  const denom = 1 - (variableFees / P) - (A / P);
  if (!(denom > 0)) return null;

  const R = (E0 - target) / denom;
  if (!Number.isFinite(R) || R < 0) return null;

  const creditRatio = getPartialRefundCreditRatio(R, P);
  const feeCredits = creditRatio * variableFees;
  const adFeeCredit = creditRatio * A;
  const netOwed = R - feeCredits;
  const estimatedEarnings = E0 - netOwed + adFeeCredit;
  const orderTotal = parseFloat((P + Tax).toFixed(2));
  const estimatedBuyerRefundTotal = parseFloat((R * (orderTotal / P)).toFixed(2));

  return {
    enterRefundAmount: parseFloat(R.toFixed(2)),
    leaveAmount: parseFloat((P - R).toFixed(2)),
    purchasePrice: P,
    salesTax: Tax,
    orderTotal,
    creditRatio: parseFloat(creditRatio.toFixed(6)),
    creditableTransactionFees: variableFees,
    beforeEarnings: parseFloat(E0.toFixed(2)),
    targetEarnings: target,
    estimatedBuyerRefundTotal,
    estimatedFeeCredits: parseFloat(feeCredits.toFixed(2)),
    estimatedNetOwed: parseFloat(netOwed.toFixed(2)),
    estimatedAdFeeCredit: parseFloat(adFeeCredit.toFixed(2)),
    estimatedEarnings: parseFloat(estimatedEarnings.toFixed(2)),
  };
}

/**
 * After partial refund: E0 − netRefund + adFeeCredit
 * adFeeCredit = (purchaseRefund / purchasePrice) × original ad fee (eBay proportional rule).
 * AU/UK/CA: totalDueSellerUSD − adFeeGeneral (post-refund due already nets fee credits).
 */
export function computePartiallyRefundedOrderEarnings(order = {}) {
  if (usesTotalDueSellerMinusAdFeeEarnings(order)) {
    return computePaidOrderEarningsFromComponents(order);
  }

  const A = parseFloat(
    order.preRefundAdFeeGeneral != null ? order.preRefundAdFeeGeneral : order.adFeeGeneral
  ) || 0;
  const E0 = order.preRefundOrderEarnings != null
    ? parseFloat(order.preRefundOrderEarnings)
    : computePaidOrderEarningsFromComponents({ ...order, adFeeGeneral: A });

  const P = getOrderPurchasePrice(order);
  const variableFees = getOrderCreditableTransactionFees({
    transactionFees: order.preRefundTransactionFees != null
      ? order.preRefundTransactionFees
      : order.transactionFees
  });
  const netRefund = getOrderNetRefundAmount(order);
  let purchaseRefund = getOrderBuyerPurchaseRefundAmount(order);

  // Back-solve R from net ≈ R − (R/P)×variableFees when line-item refund missing
  if (!(purchaseRefund > 0) && netRefund > 0 && P > 0) {
    const factor = 1 - (variableFees / P);
    if (factor > 0) {
      purchaseRefund = parseFloat((netRefund / factor).toFixed(2));
    }
  }

  const creditRatio = getPartialRefundCreditRatio(purchaseRefund, P);
  const adFeeCredit = parseFloat((creditRatio * A).toFixed(2));

  return parseFloat((E0 - netRefund + adFeeCredit).toFixed(2));
}

export function computeOrderEarningsFromComponents(order = {}) {
  const paymentStatus = String(
    order.orderPaymentStatus
    || order.paymentSummary?.payments?.[0]?.paymentStatus
    || ''
  ).toUpperCase();

  if (paymentStatus === 'FULLY_REFUNDED') {
    return FULLY_REFUNDED_ORDER_EARNINGS;
  }
  if (paymentStatus === 'PARTIALLY_REFUNDED') {
    return computePartiallyRefundedOrderEarnings(order);
  }

  return computePaidOrderEarningsFromComponents(order);
}

export async function calculateOrderEbayFinancials(order, overrideRate = null) {
  const updates = {
    tid: 0.24
  };

  if (order.orderEarnings === null || order.orderEarnings === undefined) {
    updates.tds = null;
    updates.net = null;
    updates.pBalanceINR = null;
    updates.ebayExchangeRate = null;
    return updates;
  }

  const earnings = parseFloat(order.orderEarnings) || 0;
  // Prefer Finances API TAX_DEDUCTION_AT_SOURCE when already applied on the order
  if (order.tdsSource === 'finances' && order.tds != null && order.tds !== undefined) {
    updates.tds = parseFloat(Number(order.tds).toFixed(2));
    updates.tdsSource = 'finances';
  } else {
    updates.tds = computeCalculatedTds(order);
    updates.tdsSource = 'calculated';
  }
  updates.net = parseFloat((earnings - updates.tds - updates.tid).toFixed(2));

  const ebayMarketplace = getExchangeRateMarketplace('EBAY', order.purchaseMarketplaceId);
  const resolvedRate = overrideRate !== null && overrideRate !== undefined
    ? parseFloat(overrideRate)
    : (await getExchangeRateRecordForDate(getOrderRateDate(order), ebayMarketplace))?.rate;

  const ebayExchangeRate = Number.isFinite(resolvedRate)
    ? resolvedRate
    : getExchangeRateDefaultValue(ebayMarketplace);

  updates.ebayExchangeRate = ebayExchangeRate;
  updates.pBalanceINR = parseFloat((updates.net * ebayExchangeRate).toFixed(2));

  const pBalanceINR = updates.pBalanceINR !== undefined ? updates.pBalanceINR : (order.pBalanceINR || 0);
  const amazonTotalINR = order.amazonTotalINR || 0;
  const totalCC = order.totalCC || 0;
  updates.profit = parseFloat((pBalanceINR - amazonTotalINR - totalCC).toFixed(2));

  return updates;
}

export async function calculateOrderAmazonFinancials(order, overrideRate = null) {
  const updates = {};
  const beforeTax = parseFloat(order.beforeTax) || 0;
  const estimatedTax = parseFloat(order.estimatedTax) || 0;

  updates.amazonTotal = parseFloat((beforeTax + estimatedTax).toFixed(2));

  const orderDate = new Date(getOrderRateDate(order));

  const amazonMarketplace = getExchangeRateMarketplace('AMAZON', order.purchaseMarketplaceId);
  const resolvedRate = overrideRate !== null && overrideRate !== undefined
    ? parseFloat(overrideRate)
    : (await getExchangeRateRecordForDate(orderDate, amazonMarketplace))?.rate;

  const amazonExchangeRate = Number.isFinite(resolvedRate)
    ? resolvedRate
    : getExchangeRateDefaultValue(amazonMarketplace);

  updates.amazonExchangeRate = amazonExchangeRate;
  updates.amazonTotalINR = parseFloat((updates.amazonTotal * amazonExchangeRate).toFixed(2));
  updates.marketplaceFee = parseFloat((updates.amazonTotalINR * 0.04).toFixed(2));
  updates.igst = parseFloat((updates.marketplaceFee * 0.18).toFixed(2));
  updates.totalCC = parseFloat((updates.marketplaceFee + updates.igst).toFixed(2));

  const pBalanceINR = order.pBalanceINR || 0;
  const amazonTotalINR = updates.amazonTotalINR !== undefined ? updates.amazonTotalINR : (order.amazonTotalINR || 0);
  const totalCC = updates.totalCC !== undefined ? updates.totalCC : (order.totalCC || 0);
  updates.profit = parseFloat((pBalanceINR - amazonTotalINR - totalCC).toFixed(2));

  return updates;
}