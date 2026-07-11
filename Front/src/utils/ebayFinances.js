/** Helpers for eBay Finances API transaction payloads (getTransactions). */

import { resolveFeeTypeFilterValues } from './ebayTransactionTypes.js';

export { resolveFeeTypeFilterValues, isStoreSubscriptionFeeFilter } from './ebayTransactionTypes.js';

export function getFinancesReference(txn, referenceType) {
  return (txn?.references || []).find((r) => r.referenceType === referenceType) || null;
}

/** Item id embedded in TAX-/FEE- transaction ids, e.g. TAX-7906092857819_11 */
export function parseFeeTransactionItemId(transactionId) {
  const match = String(transactionId || '').match(/^(?:TAX|FEE)-(\d+)_/);
  return match?.[1] || null;
}

export function resolveFinancesItemId(txn) {
  return getFinancesReference(txn, 'ITEM_ID')?.referenceId || parseFeeTransactionItemId(txn?.transactionId) || null;
}

/**
 * Build lookup indexes from a page of transactions so fees/taxes can inherit an order id.
 * @param {object[]} transactions
 */
export function buildFinancesOrderIdIndexes(transactions) {
  const itemToOrder = new Map();
  const srrToOrder = new Map();
  const sales = [];

  for (const txn of transactions || []) {
    const orderId = txn?.orderId || getFinancesReference(txn, 'ORDER_ID')?.referenceId;
    if (!orderId) continue;

    const srr = txn.salesRecordReference;
    if (srr && String(srr) !== '0') srrToOrder.set(String(srr), orderId);

    for (const ref of txn.references || []) {
      if (ref.referenceType === 'ITEM_ID' && ref.referenceId) {
        itemToOrder.set(String(ref.referenceId), orderId);
      }
    }
    for (const line of txn.orderLineItems || []) {
      if (line.lineItemId) itemToOrder.set(String(line.lineItemId), orderId);
    }

    if (txn.transactionType === 'SALE') {
      const time = new Date(txn.transactionDate).getTime();
      if (!Number.isNaN(time)) sales.push({ orderId, time });
    }
  }

  sales.sort((a, b) => a.time - b.time);
  return { itemToOrder, srrToOrder, sales };
}

/**
 * Resolve order id: direct field → references → item/sales-record cross-link → nearest prior SALE.
 * @param {object} txn
 * @param {ReturnType<typeof buildFinancesOrderIdIndexes>} [indexes]
 */
export function resolveFinancesOrderId(txn, indexes) {
  if (txn?.orderId) return txn.orderId;

  const orderRef = getFinancesReference(txn, 'ORDER_ID');
  if (orderRef?.referenceId) return orderRef.referenceId;

  if (!indexes) return null;

  const itemId = resolveFinancesItemId(txn);
  if (itemId && indexes.itemToOrder.has(String(itemId))) {
    return indexes.itemToOrder.get(String(itemId));
  }

  const srr = txn.salesRecordReference;
  if (srr && String(srr) !== '0' && indexes.srrToOrder.has(String(srr))) {
    return indexes.srrToOrder.get(String(srr));
  }

  const txnTime = new Date(txn.transactionDate).getTime();
  if (Number.isNaN(txnTime) || !indexes.sales?.length) return null;

  let bestOrderId = null;
  let bestDelta = Infinity;
  for (const sale of indexes.sales) {
    if (sale.time > txnTime) continue;
    const delta = txnTime - sale.time;
    if (delta > 5 * 60 * 1000) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestOrderId = sale.orderId;
    }
  }
  return bestOrderId;
}

export function isPromotedListingsFinancesTransaction(txn) {
  const memo = String(txn?.transactionMemo || '').toLowerCase();
  const feeType = String(txn?.feeType || '').toUpperCase();
  return feeType === 'AD_FEE' || memo.includes('promoted listing');
}

/** Promoted listing charges store the fee in amount, not totalFeeAmount. */
export function resolveFinancesDisplayFeeAmount(txn) {
  const fee = txn?.totalFeeAmount;
  if (fee?.value != null && fee?.value !== '') return fee;
  if (isPromotedListingsFinancesTransaction(txn) && txn?.amount?.value != null && txn?.amount?.value !== '') {
    return txn.amount;
  }
  return null;
}

/** @param {object[]} transactions */
export function enrichFinancesTransactions(transactions) {
  const list = Array.isArray(transactions) ? transactions : [];
  const indexes = buildFinancesOrderIdIndexes(list);
  return list.map((txn) => {
    const orderId = resolveFinancesOrderId(txn, indexes);
    if (!orderId || orderId === txn.orderId) return txn;
    return { ...txn, orderId };
  });
}

/** Summary category key → eBay transactionType values for getTransactions */
export const SUMMARY_CATEGORY_TRANSACTION_TYPES = {
  credit: ['SALE', 'CREDIT'],
  refund: ['REFUND'],
  dispute: ['DISPUTE'],
  shippingLabel: ['SHIPPING_LABEL'],
  transfer: ['TRANSFER'],
  withdrawal: ['WITHDRAWAL'],
  onHold: ['HOLD'],
  purchase: ['PURCHASE'],
  nonSaleCharge: ['NON_SALE_CHARGE'],
  adjustment: ['ADJUSTMENT'],
  balanceTransfer: ['BALANCE_TRANSFER'],
  loanRepayment: ['LOAN_REPAYMENT'],
};

/**
 * @param {import('axios').AxiosInstance} api
 * @param {object} baseParams - shared list params (seller, dates, status, etc.)
 * @param {string[]} transactionTypes
 */
export async function fetchFinancesTransactionsByTypes(api, baseParams, transactionTypes) {
  const merged = [];
  const seen = new Set();

  for (const transactionType of transactionTypes) {
    let offset = 0;
    const limit = 200;
    while (true) {
      const { data } = await api.get('/ebay/finances/transactions', {
        params: { ...baseParams, transactionType, limit, offset },
        timeout: 90000,
      });
      if (!data.success) throw new Error(data.error || 'Failed to load transactions');
      const batch = Array.isArray(data.transactions) ? data.transactions : [];
      for (const txn of batch) {
        const id = txn.transactionId || `${txn.orderId}-${txn.transactionDate}`;
        if (!seen.has(id)) {
          seen.add(id);
          merged.push(txn);
        }
      }
      if (batch.length < limit) break;
      offset += limit;
    }
  }

  merged.sort((a, b) => new Date(b.transactionDate) - new Date(a.transactionDate));
  return merged;
}

export function collectTransactionFeeTypes(txn) {
  const types = new Set();
  if (txn?.feeType) types.add(String(txn.feeType).trim().toUpperCase());
  for (const line of txn?.orderLineItems || []) {
    for (const fee of line?.marketplaceFees || []) {
      if (fee?.feeType) types.add(String(fee.feeType).trim().toUpperCase());
    }
  }
  return types;
}

/** Primary fee type enum for sorting (first alphabetically). */
export function financesFeeTypeSortKey(txn) {
  return [...collectTransactionFeeTypes(txn)].sort()[0] || '';
}

export function transactionHasFeeType(txn, feeType) {
  const targets = resolveFeeTypeFilterValues(feeType);
  if (!targets.length) return true;
  const types = collectTransactionFeeTypes(txn);
  return targets.some((target) => types.has(target));
}

export function filterFinancesTransactionsByFeeType(transactions, feeType) {
  const targets = resolveFeeTypeFilterValues(feeType);
  if (!targets.length) return transactions || [];
  return (transactions || []).filter((txn) => transactionHasFeeType(txn, feeType));
}

function financesMoneySortValue(amount) {
  const value = Number(amount?.value);
  return Number.isFinite(value) ? value : 0;
}

export function compareFinancesTransactionRows(a, b, sortBy, sortOrder, resolveOrderId) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  let av;
  let bv;

  switch (sortBy) {
    case 'sellerName':
      av = String(a?.sellerName || '').toLowerCase();
      bv = String(b?.sellerName || '').toLowerCase();
      break;
    case 'transactionType':
      av = String(a?.transactionType || '').toLowerCase();
      bv = String(b?.transactionType || '').toLowerCase();
      break;
    case 'transactionStatus':
      av = String(a?.transactionStatus || '').toLowerCase();
      bv = String(b?.transactionStatus || '').toLowerCase();
      break;
    case 'bookingEntry':
      av = String(a?.bookingEntry || '').toLowerCase();
      bv = String(b?.bookingEntry || '').toLowerCase();
      break;
    case 'amount':
      av = financesMoneySortValue(a?.amount);
      bv = financesMoneySortValue(b?.amount);
      break;
    case 'totalFeeAmount':
      av = financesMoneySortValue(a?.totalFeeAmount);
      bv = financesMoneySortValue(b?.totalFeeAmount);
      break;
    case 'feeType':
      av = financesFeeTypeSortKey(a).toLowerCase();
      bv = financesFeeTypeSortKey(b).toLowerCase();
      break;
    case 'orderId':
      av = String(resolveOrderId?.(a) || a?.orderId || '').toLowerCase();
      bv = String(resolveOrderId?.(b) || b?.orderId || '').toLowerCase();
      break;
    case 'buyerUsername':
      av = String(a?.buyer?.username || '').toLowerCase();
      bv = String(b?.buyer?.username || '').toLowerCase();
      break;
    case 'payoutId':
      av = String(a?.payoutId || '').toLowerCase();
      bv = String(b?.payoutId || '').toLowerCase();
      break;
    case 'transactionDate':
    default:
      av = new Date(a?.transactionDate || 0).getTime();
      bv = new Date(b?.transactionDate || 0).getTime();
      break;
  }

  if (av < bv) return -1 * dir;
  if (av > bv) return 1 * dir;
  return String(a?.transactionId || '').localeCompare(String(b?.transactionId || ''));
}
