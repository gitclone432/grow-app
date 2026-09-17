import dns from 'dns';
import mongoose from 'mongoose';

dns.setServers(['8.8.8.8', '8.8.4.4']);

const SPECIALIZED_CATEGORIES = ['return_refund', 'cancellation', 'inr'];
const ORDER_FULFILLMENT_STATUSES = new Set([
  'todo',
  'out_of_stock',
  'cancellation',
  'address_issue',
  'late_delivery',
  'not_fulfilled',
  'fulfilled',
  'buyer_confirmation',
]);

function buildNormalizationUpdate(order) {
  const set = {
    complianceBoardStatus: 'case_not_opened',
  };

  if (
    ORDER_FULFILLMENT_STATUSES.has(order.complianceBoardStatus) &&
    order.complianceBoardStatus !== 'todo' &&
    !order.orderFulfillmentBoardStatus
  ) {
    set.orderFulfillmentBoardStatus = order.complianceBoardStatus;
  }

  return set;
}

async function main() {
  const writeMode = process.argv.includes('--write');
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 60000,
    maxPoolSize: 10,
  });

  const orders = mongoose.connection.db.collection('orders');
  const query = {
    complianceBoardSource: 'order_communication',
    complianceBoardCategories: { $in: SPECIALIZED_CATEGORIES },
    complianceBoardStatus: { $in: [...ORDER_FULFILLMENT_STATUSES] },
  };

  const matchingOrders = await orders.find(query, {
    projection: {
      orderId: 1,
      complianceBoardStatus: 1,
      complianceBoardCategories: 1,
      orderFulfillmentBoardStatus: 1,
      updatedAt: 1,
    },
  }).toArray();

  const byStatus = matchingOrders.reduce((acc, order) => {
    const key = String(order.complianceBoardStatus || 'null');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const preview = matchingOrders.slice(0, 20).map((order) => ({
    _id: String(order._id),
    orderId: order.orderId,
    complianceBoardStatus: order.complianceBoardStatus || null,
    orderFulfillmentBoardStatus: order.orderFulfillmentBoardStatus || null,
    complianceBoardCategories: order.complianceBoardCategories || [],
    updatedAt: order.updatedAt || null,
  }));

  const report = {
    mode: writeMode ? 'write' : 'dry-run',
    matchedCount: matchingOrders.length,
    byStatus,
    preview,
  };

  if (!writeMode || matchingOrders.length === 0) {
    console.log(JSON.stringify(report, null, 2));
    await mongoose.disconnect();
    return;
  }

  const operations = matchingOrders.map((order) => ({
    updateOne: {
      filter: { _id: order._id },
      update: { $set: buildNormalizationUpdate(order) },
    },
  }));

  const result = await orders.bulkWrite(operations, { ordered: false });
  console.log(JSON.stringify({
    ...report,
    modifiedCount: result.modifiedCount || 0,
    matchedWriteOps: result.matchedCount || 0,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error?.stack || error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect failures in error handling
  }
  process.exit(1);
});