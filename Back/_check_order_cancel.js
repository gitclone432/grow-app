import 'dotenv/config';
import mongoose from 'mongoose';
import Order from './src/models/Order.js';
import Seller from './src/models/Seller.js';
import axios from 'axios';
import { ensureValidToken } from './src/routes/ebay.js';

const ORDER_ID = process.argv[2] || '13-14971-87337';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const order = await Order.findOne({ orderId: ORDER_ID }).lean();
  if (!order) {
    console.log('DB: order not found');
    process.exit(1);
  }

  console.log('=== DB ===');
  console.log({
    orderId: order.orderId,
    cancelState: order.cancelState,
    cancelStatus: order.cancelStatus,
    orderPaymentStatus: order.orderPaymentStatus,
    orderFulfillmentStatus: order.orderFulfillmentStatus,
    lastModifiedDate: order.lastModifiedDate,
    creationDate: order.creationDate,
    seller: String(order.seller),
  });

  const seller = await Seller.findById(order.seller);
  if (!seller?.ebayTokens?.access_token) {
    console.log('No ebay token on seller');
    process.exit(1);
  }

  const accessToken = await ensureValidToken(seller);
  const url = `https://api.ebay.com/sell/fulfillment/v1/order/${encodeURIComponent(ORDER_ID)}`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const ebay = res.data;

  console.log('=== eBay ===');
  console.log({
    orderId: ebay.orderId,
    cancelStatus: ebay.cancelStatus,
    orderPaymentStatus: ebay.orderPaymentStatus,
    orderFulfillmentStatus: ebay.orderFulfillmentStatus,
    lastModifiedDate: ebay.lastModifiedDate,
    creationDate: ebay.creationDate,
  });

  const extracted =
    ebay.cancelStatus?.cancelState ||
    ebay.cancelStatus?.state ||
    ebay.cancelStatus?.status ||
    (ebay.cancelStatus?.cancelled ? 'CANCELED' : 'NONE_REQUESTED');

  console.log('=== Compare ===');
  console.log({
    dbCancelState: order.cancelState,
    ebayExtractedCancelState: extracted,
    match: order.cancelState === extracted,
  });

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('ERROR', e.response?.status, e.response?.data || e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
