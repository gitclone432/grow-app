/** Defect floor — keep partial-refund earnings at or above this. */
export const PARTIAL_REFUND_TARGET_EARNINGS = 1.10;
export const FULLY_REFUNDED_ORDER_EARNINGS = -0.40;
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
 * eBay credit ratio for partial refunds (Help id=4128):
 * buyerRefundTotal / orderTotal ≡ purchaseRefund / purchasePrice when tax is proportional.
 */
export function getPartialRefundCreditRatio(purchaseRefund, purchasePrice) {
  const R = parseFloat(purchaseRefund) || 0;
  const P = parseFloat(purchasePrice) || 0;
  if (!(P > 0) || !(R > 0)) return 0;
  return R / P;
}

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

export function getOrderNetRefundAmount(order = {}) {
  return parseFloat(
    sumRefundAmounts(order.refunds || order.paymentSummary?.refunds).toFixed(2)
  );
}

export function getOrderBuyerPurchaseRefundAmount(order = {}) {
  const lineItems = order.lineItems || [];
  let total = 0;
  for (const li of lineItems) {
    total += sumRefundAmounts(li?.refunds);
  }
  return parseFloat(total.toFixed(2));
}

/** Pre-refund: Enter refund amount so after-earnings ≈ $1.10 (PAID DB fields). */
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

  const denom = 1 - (variableFees / P) - (A / P);
  if (!(denom > 0)) return null;

  const R = (E0 - target) / denom;
  if (!Number.isFinite(R) || R < 0) return null;

  const creditRatio = getPartialRefundCreditRatio(R, P);
  const feeCredits = creditRatio * variableFees;
  const adFeeCredit = creditRatio * A;
  const netOwed = R - feeCredits;
  const orderTotal = parseFloat((P + Tax).toFixed(2));

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
    estimatedBuyerRefundTotal: parseFloat((R * (orderTotal / P)).toFixed(2)),
    estimatedFeeCredits: parseFloat(feeCredits.toFixed(2)),
    estimatedNetOwed: parseFloat(netOwed.toFixed(2)),
    estimatedAdFeeCredit: parseFloat(adFeeCredit.toFixed(2)),
    estimatedEarnings: parseFloat((E0 - netOwed + adFeeCredit).toFixed(2)),
  };
}

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

export function getOrderEarnings(order) {
  const status = String(
    order?.orderPaymentStatus
    || order?.paymentSummary?.payments?.[0]?.paymentStatus
    || ''
  ).toUpperCase();

  if (status === 'FULLY_REFUNDED') return FULLY_REFUNDED_ORDER_EARNINGS;
  if (status === 'PARTIALLY_REFUNDED') return computePartiallyRefundedOrderEarnings(order);
  return computePaidOrderEarningsFromComponents(order);
}
