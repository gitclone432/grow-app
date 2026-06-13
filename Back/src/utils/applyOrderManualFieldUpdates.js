import Order from '../models/Order.js';
import { calculateOrderAmazonFinancials } from './exchangeRateUtils.js';

export const MANUAL_FULFILLMENT_ALLOWED_FIELDS = [
  'amazonAccount', 'arrivingDate', 'beforeTax', 'estimatedTax', 'azOrderId',
  'amazonRefund', 'cardName', 'resolution', 'remark', 'alreadyInUse', 'remarkMessageSent',
  'fulfillmentNotes',
];

function recalculateUSDFields(order) {
  let conversionRate = 1;

  if (order.purchaseMarketplaceId !== 'EBAY_US') {
    const totalDueSeller = order.paymentSummary?.totalDueSeller;
    if (totalDueSeller?.value && totalDueSeller?.convertedFromValue) {
      const usdValue = parseFloat(totalDueSeller.value);
      const originalValue = parseFloat(totalDueSeller.convertedFromValue);
      if (usdValue > 0 && originalValue > 0) {
        conversionRate = usdValue / originalValue;
      }
    }
  }

  const updates = {
    conversionRate: parseFloat(conversionRate.toFixed(5)),
  };

  const monetaryFields = [
    'subtotal', 'shipping', 'salesTax', 'discount',
    'transactionFees', 'beforeTax', 'estimatedTax',
  ];

  monetaryFields.forEach((field) => {
    if (order[field] !== undefined && order[field] !== null && order[field] !== '') {
      const value = parseFloat(order[field]);
      if (!Number.isNaN(value)) {
        updates[`${field}USD`] = parseFloat((value * conversionRate).toFixed(2));
      }
    } else {
      updates[`${field}USD`] = null;
    }
  });

  if (order.refunds && Array.isArray(order.refunds)) {
    const totalRefund = order.refunds.reduce((sum, r) => {
      const amt = parseFloat(r.amount?.value || 0);
      return sum + (Number.isNaN(amt) ? 0 : amt);
    }, 0);
    updates.refundTotalUSD = parseFloat((totalRefund * conversionRate).toFixed(2));
  } else if (order.paymentSummary?.refunds && Array.isArray(order.paymentSummary.refunds)) {
    const totalRefund = order.paymentSummary.refunds.reduce((sum, r) => {
      const amt = parseFloat(r.amount?.value || 0);
      return sum + (Number.isNaN(amt) ? 0 : amt);
    }, 0);
    updates.refundTotalUSD = parseFloat((totalRefund * conversionRate).toFixed(2));
  }

  return updates;
}

export function buildManualFieldUpdateData(updates = {}) {
  const updateData = {};

  Object.keys(updates).forEach((key) => {
    if (!MANUAL_FULFILLMENT_ALLOWED_FIELDS.includes(key)) return;

    if (key === 'remark') {
      const rawRemark = updates[key];
      if (
        rawRemark === null ||
        rawRemark === undefined ||
        String(rawRemark).trim() === '' ||
        String(rawRemark).trim().toLowerCase() === 'select'
      ) {
        updateData[key] = null;
      } else {
        updateData[key] = String(rawRemark).trim();
      }
      return;
    }

    updateData[key] = updates[key];
  });

  return updateData;
}

export function isEmptyFulfillmentValue(value) {
  return value === null || value === undefined || String(value).trim() === '' || String(value).trim() === '-';
}

export function mergeFulfillmentUpdates(order, incoming = {}, { fillEmptyOnly = true } = {}) {
  const merged = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined || value === '') continue;
    if (fillEmptyOnly && !isEmptyFulfillmentValue(order[key])) continue;
    merged[key] = value;
  }
  return merged;
}

export async function applyManualFieldUpdatesToOrder(order, updates = {}) {
  const updateData = buildManualFieldUpdateData(updates);
  if (!Object.keys(updateData).length) {
    return { changed: false, order, recalculated: false };
  }

  const previousAmazonAccount = order.amazonAccount;
  const previousAmazonAccountAssignmentSource = order.amazonAccountAssignmentSource;

  Object.keys(updateData).forEach((key) => {
    order[key] = updateData[key];
  });

  if (Object.prototype.hasOwnProperty.call(updateData, 'amazonAccount')) {
    if (updateData.amazonAccount) {
      order.amazonAccountAssignmentSource = 'fulfillment';

      if (order.sourcingStatus !== 'Done') {
        order.sourcingStatus = 'Done';
      }

      if (!order.sourcingCompletedAt) {
        order.sourcingCompletedAt = new Date();
      }
    } else if (previousAmazonAccount && previousAmazonAccountAssignmentSource === 'fulfillment') {
      order.amazonAccountAssignmentSource = null;

      if (order.sourcingStatus === 'Done') {
        order.sourcingStatus = 'Not Yet';
        order.sourcingCompletedAt = null;
      }
    }
  }

  const monetaryFields = ['beforeTax', 'estimatedTax', 'amazonRefund'];
  const updatedMonetaryField = Object.keys(updateData).some((key) => monetaryFields.includes(key));

  if (updatedMonetaryField) {
    const usdUpdates = recalculateUSDFields(order);
    Object.keys(usdUpdates).forEach((key) => {
      order[key] = usdUpdates[key];
    });

    if (updateData.beforeTax !== undefined || updateData.estimatedTax !== undefined) {
      const amazonFinancials = await calculateOrderAmazonFinancials(order);
      Object.keys(amazonFinancials).forEach((key) => {
        order[key] = amazonFinancials[key];
      });
    }
  }

  await order.save();
  return { changed: true, order, recalculated: updatedMonetaryField };
}

export const FULFILLMENT_IMPORT_FIELDS = [
  'amazonAccount', 'arrivingDate', 'beforeTax', 'estimatedTax',
  'azOrderId', 'amazonRefund', 'cardName', 'fulfillmentNotes', 'resolution', 'remark',
];

export function sellerNamesMatch(expected, provided) {
  return String(expected || '').trim().toLowerCase() === String(provided || '').trim().toLowerCase();
}

export async function importFulfillmentRows(rows = [], { fillEmptyOnly = true } = {}) {
  const summary = {
    updated: 0,
    skipped: 0,
    notFound: 0,
    errors: [],
  };

  const fillEmpty = fillEmptyOnly !== false;
  const workItems = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] || {};
    const orderKey = String(row.orderId || '').trim();
    if (!orderKey) {
      summary.errors.push({ row: index + 1, reason: 'Missing Order ID' });
      summary.skipped += 1;
      continue;
    }

    const incoming = {};
    FULFILLMENT_IMPORT_FIELDS.forEach((field) => {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        incoming[field] = row[field];
      }
    });

    if (!Object.keys(incoming).length) {
      summary.skipped += 1;
      continue;
    }

    workItems.push({ index, orderKey, incoming });
  }

  if (!workItems.length) {
    return summary;
  }

  const orderIds = [...new Set(workItems.map((item) => item.orderKey))];
  const orders = await Order.find({ orderId: { $in: orderIds } });
  const orderById = new Map(orders.map((order) => [order.orderId, order]));

  for (const { index, orderKey, incoming } of workItems) {
    try {
      const order = orderById.get(orderKey);

      if (!order) {
        summary.notFound += 1;
        if (summary.errors.length < 50) {
          summary.errors.push({ row: index + 1, orderId: orderKey, reason: 'Order not found' });
        }
        continue;
      }

      const merged = mergeFulfillmentUpdates(order, incoming, { fillEmptyOnly: fillEmpty });
      if (!Object.keys(merged).length) {
        summary.skipped += 1;
        continue;
      }

      const result = await applyManualFieldUpdatesToOrder(order, merged);
      if (result.changed) {
        summary.updated += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (rowErr) {
      summary.skipped += 1;
      if (summary.errors.length < 50) {
        summary.errors.push({ row: index + 1, orderId: orderKey, reason: rowErr.message });
      }
    }
  }

  return summary;
}
