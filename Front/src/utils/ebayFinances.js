/** Helpers for eBay Finances API transaction payloads (getTransactions). */

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
