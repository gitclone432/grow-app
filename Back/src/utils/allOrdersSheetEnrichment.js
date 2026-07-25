import {
  getExchangeRateDefaultValue,
  getExchangeRateMarketplace,
  getExchangeRateRecordForDate,
  getOrderRateDate,
  getOrderTotalAmount,
} from './exchangeRateUtils.js';

function rateCacheKey(marketplace, order) {
  const date = new Date(getOrderRateDate(order));
  const day = Number.isNaN(date.getTime()) ? 'unknown' : date.toISOString().slice(0, 10);
  return `${marketplace}|${day}`;
}

export async function prefetchExchangeRatesForOrders(orders = []) {
  const keysToFetch = new Map();

  for (const order of orders) {
    const orderObj = order.toObject ? order.toObject() : order;
    const ebayMarketplace = getExchangeRateMarketplace('EBAY', orderObj.purchaseMarketplaceId);
    const amazonMarketplace = getExchangeRateMarketplace('AMAZON', orderObj.purchaseMarketplaceId);

    if (orderObj.ebayExchangeRate == null) {
      const key = rateCacheKey(ebayMarketplace, orderObj);
      if (!keysToFetch.has(key)) {
        keysToFetch.set(key, { marketplace: ebayMarketplace, order: orderObj });
      }
    }

    const amazonTotalUsd = (parseFloat(orderObj.beforeTax) || 0) + (parseFloat(orderObj.estimatedTax) || 0);
    if (amazonTotalUsd > 0 && orderObj.amazonExchangeRate == null) {
      const key = rateCacheKey(amazonMarketplace, orderObj);
      if (!keysToFetch.has(key)) {
        keysToFetch.set(key, { marketplace: amazonMarketplace, order: orderObj });
      }
    }
  }

  const cache = new Map();
  await Promise.all([...keysToFetch.entries()].map(async ([key, { marketplace, order }]) => {
    const record = await getExchangeRateRecordForDate(getOrderRateDate(order), marketplace);
    cache.set(key, record?.rate ?? getExchangeRateDefaultValue(marketplace));
  }));

  return cache;
}

export function resolveRate(orderObj, channel, cache) {
  const marketplace = getExchangeRateMarketplace(channel, orderObj.purchaseMarketplaceId);
  const stored = channel === 'EBAY' ? orderObj.ebayExchangeRate : orderObj.amazonExchangeRate;
  const parsed = parseFloat(stored);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  const cached = cache.get(rateCacheKey(marketplace, orderObj));
  if (cached != null) return cached;

  return getExchangeRateDefaultValue(marketplace);
}

export function applyAmazonFinancialsSync(orderObj, amazonExchangeRate) {
  const beforeTax = parseFloat(orderObj.beforeTax) || 0;
  const estimatedTax = parseFloat(orderObj.estimatedTax) || 0;
  const amazonTotal = parseFloat((beforeTax + estimatedTax).toFixed(2));
  if (amazonTotal <= 0) return orderObj;

  orderObj.amazonTotal = amazonTotal;
  orderObj.amazonExchangeRate = amazonExchangeRate;
  orderObj.amazonTotalINR = parseFloat((amazonTotal * amazonExchangeRate).toFixed(2));
  orderObj.marketplaceFee = parseFloat((orderObj.amazonTotalINR * 0.04).toFixed(2));
  orderObj.igst = parseFloat((orderObj.marketplaceFee * 0.18).toFixed(2));
  orderObj.totalCC = parseFloat((orderObj.marketplaceFee + orderObj.igst).toFixed(2));
  return orderObj;
}

export function applyEbayFinancialsSync(orderObj, ebayExchangeRate) {
  if (orderObj.orderEarnings == null || orderObj.orderEarnings === undefined) return orderObj;

  const earnings = parseFloat(orderObj.orderEarnings) || 0;
  const tid = 0.24;
  const orderTotal = getOrderTotalAmount(orderObj);
  // Prefer Finances TAX_DEDUCTION_AT_SOURCE when already stored on the order
  if (orderObj.tdsSource === 'finances' && orderObj.tds != null && orderObj.tds !== undefined) {
    orderObj.tds = parseFloat(Number(orderObj.tds).toFixed(2));
  } else {
    orderObj.tds = parseFloat((orderTotal * 0.01).toFixed(2));
    orderObj.tdsSource = orderObj.tdsSource || 'calculated';
  }
  orderObj.tid = tid;
  orderObj.net = parseFloat((earnings - orderObj.tds - tid).toFixed(2));
  orderObj.ebayExchangeRate = ebayExchangeRate;
  orderObj.exchangeRate = ebayExchangeRate;
  orderObj.pBalanceINR = parseFloat((orderObj.net * ebayExchangeRate).toFixed(2));
  orderObj.pBalance = orderObj.pBalanceINR;
  return orderObj;
}

/** Same financial fields as All Orders Sheet (USD) API — single source of truth. */
export function enrichOrderLikeAllOrdersSheet(orderObj, rateCache) {
  const ebayRate = resolveRate(orderObj, 'EBAY', rateCache);
  const amazonRate = resolveRate(orderObj, 'AMAZON', rateCache);

  if (orderObj.orderEarnings != null && orderObj.orderEarnings !== undefined) {
    applyEbayFinancialsSync(orderObj, ebayRate);
  }

  const amazonTotalUsd = (parseFloat(orderObj.beforeTax) || 0) + (parseFloat(orderObj.estimatedTax) || 0);
  if (amazonTotalUsd > 0) {
    applyAmazonFinancialsSync(orderObj, amazonRate);
  }

  return computeOrderProfit(orderObj);
}

export function needsAmazonFinancialSync(orderObj) {
  const amazonTotalUsd = (parseFloat(orderObj.beforeTax) || 0) + (parseFloat(orderObj.estimatedTax) || 0);
  if (amazonTotalUsd <= 0) return false;
  const inr = parseFloat(orderObj.amazonTotalINR);
  return !Number.isFinite(inr) || inr <= 0;
}

export function needsEbayFinancialSync(orderObj) {
  if (orderObj.orderEarnings == null || orderObj.orderEarnings === undefined) return false;
  const earnings = parseFloat(orderObj.orderEarnings) || 0;
  if (earnings <= 0) return false;
  const inr = parseFloat(orderObj.pBalanceINR);
  return !Number.isFinite(inr) || inr <= 0;
}

export function computeOrderProfit(orderObj) {
  orderObj.profit = parseFloat(
    (((orderObj.pBalanceINR || 0) - (orderObj.amazonTotalINR || 0) - (orderObj.totalCC || 0)).toFixed(2))
  );
  return orderObj;
}

export function enrichOrderFinancialsSync(orderObj, rateCache) {
  const ebayRate = resolveRate(orderObj, 'EBAY', rateCache);
  const amazonRate = resolveRate(orderObj, 'AMAZON', rateCache);

  orderObj.exchangeRate = orderObj.ebayExchangeRate ?? ebayRate;
  orderObj.amazonExchangeRate = orderObj.amazonExchangeRate ?? amazonRate;

  if (needsAmazonFinancialSync(orderObj)) {
    applyAmazonFinancialsSync(orderObj, amazonRate);
  }

  if (needsEbayFinancialSync(orderObj)) {
    applyEbayFinancialsSync(orderObj, ebayRate);
  } else if (orderObj.orderEarnings != null && orderObj.orderEarnings !== undefined) {
    const total = getOrderTotalAmount(orderObj);
    if (orderObj.tdsSource === 'finances' && orderObj.tds != null) {
      // keep Finances TDS
      orderObj.tds = parseFloat(Number(orderObj.tds).toFixed(2));
    } else if (orderObj.tds == null) {
      orderObj.tds = parseFloat((total * 0.01).toFixed(2));
      orderObj.tdsSource = 'calculated';
    }
    if (orderObj.tid == null) orderObj.tid = 0.24;
    if (orderObj.net == null) {
      orderObj.net = parseFloat(
        ((parseFloat(orderObj.orderEarnings) || 0) - (orderObj.tds || 0) - (orderObj.tid || 0)).toFixed(2)
      );
    }
    if (orderObj.pBalance == null && orderObj.pBalanceINR != null) {
      orderObj.pBalance = orderObj.pBalanceINR;
    }
  }

  return computeOrderProfit(orderObj);
}

export function applyUsdFieldsSync(orderObj) {
  if (orderObj.subtotalUSD === undefined || orderObj.subtotalUSD === null) {
    const marketplace = orderObj.purchaseMarketplaceId;

    if (marketplace === 'EBAY_US') {
      orderObj.subtotalUSD = orderObj.subtotal || 0;
      orderObj.shippingUSD = orderObj.shipping || 0;
      orderObj.salesTaxUSD = orderObj.salesTax || 0;
      orderObj.discountUSD = orderObj.discount || 0;
      orderObj.transactionFeesUSD = orderObj.transactionFees || 0;
      orderObj.conversionRate = 1;
    } else {
      let conversionRate = 0;

      if (orderObj.paymentSummary?.totalDueSeller?.convertedFromValue
        && orderObj.paymentSummary?.totalDueSeller?.value) {
        const originalValue = parseFloat(orderObj.paymentSummary.totalDueSeller.convertedFromValue);
        const usdValue = parseFloat(orderObj.paymentSummary.totalDueSeller.value);
        if (originalValue > 0) {
          conversionRate = usdValue / originalValue;
        }
      }

      orderObj.subtotalUSD = conversionRate ? parseFloat(((orderObj.subtotal || 0) * conversionRate).toFixed(2)) : 0;
      orderObj.shippingUSD = conversionRate ? parseFloat(((orderObj.shipping || 0) * conversionRate).toFixed(2)) : 0;
      orderObj.salesTaxUSD = conversionRate ? parseFloat(((orderObj.salesTax || 0) * conversionRate).toFixed(2)) : 0;
      orderObj.discountUSD = conversionRate ? parseFloat(((orderObj.discount || 0) * conversionRate).toFixed(2)) : 0;
      orderObj.transactionFeesUSD = conversionRate
        ? parseFloat(((orderObj.transactionFees || 0) * conversionRate).toFixed(2))
        : 0;
      orderObj.conversionRate = parseFloat(conversionRate.toFixed(5));
    }
  }

  let refundTotal = 0;
  if (orderObj.paymentSummary?.refunds && Array.isArray(orderObj.paymentSummary.refunds)) {
    refundTotal = orderObj.paymentSummary.refunds.reduce((sum, refund) => {
      return sum + parseFloat(refund.amount?.value || 0);
    }, 0);
  }
  const conversionRate = orderObj.conversionRate || 1;
  orderObj.refundTotalUSD = parseFloat((refundTotal * conversionRate).toFixed(2));

  return orderObj;
}
