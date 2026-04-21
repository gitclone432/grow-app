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
  const orderTotal = getOrderTotalAmount(order);
  updates.tds = parseFloat((orderTotal * 0.01).toFixed(2));
  updates.net = parseFloat((earnings - updates.tds - updates.tid).toFixed(2));

  const resolvedRate = overrideRate !== null && overrideRate !== undefined
    ? { rate: parseFloat(overrideRate) }
    : await getExchangeRateRecordForDate(getOrderRateDate(order), getExchangeRateMarketplace('EBAY', order.purchaseMarketplaceId));

  if (resolvedRate && resolvedRate.rate) {
    updates.ebayExchangeRate = resolvedRate.rate;
    updates.pBalanceINR = parseFloat((updates.net * resolvedRate.rate).toFixed(2));
  } else {
    updates.ebayExchangeRate = null;
    updates.pBalanceINR = null;
  }

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

  const resolvedRate = overrideRate !== null && overrideRate !== undefined
    ? { rate: parseFloat(overrideRate) }
    : await getExchangeRateRecordForDate(orderDate, getExchangeRateMarketplace('AMAZON', order.purchaseMarketplaceId));

  if (resolvedRate && resolvedRate.rate) {
    updates.amazonExchangeRate = resolvedRate.rate;
    updates.amazonTotalINR = parseFloat((updates.amazonTotal * resolvedRate.rate).toFixed(2));
    updates.marketplaceFee = parseFloat((updates.amazonTotalINR * 0.04).toFixed(2));
    updates.igst = parseFloat((updates.marketplaceFee * 0.18).toFixed(2));
    updates.totalCC = parseFloat((updates.marketplaceFee + updates.igst).toFixed(2));
  } else {
    updates.amazonExchangeRate = null;
    updates.amazonTotalINR = null;
    updates.marketplaceFee = null;
    updates.igst = null;
    updates.totalCC = null;
  }

  const pBalanceINR = order.pBalanceINR || 0;
  const amazonTotalINR = updates.amazonTotalINR !== undefined ? updates.amazonTotalINR : (order.amazonTotalINR || 0);
  const totalCC = updates.totalCC !== undefined ? updates.totalCC : (order.totalCC || 0);
  updates.profit = parseFloat((pBalanceINR - amazonTotalINR - totalCC).toFixed(2));

  return updates;
}