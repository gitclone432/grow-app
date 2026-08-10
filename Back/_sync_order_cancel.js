import 'dotenv/config';
import mongoose from 'mongoose';
import Order from './src/models/Order.js';
import Seller from './src/models/Seller.js';
import axios from 'axios';
import { ensureValidToken } from './src/routes/ebay.js';

const ORDER_ID = process.argv[2] || '13-14971-87337';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const order = await Order.findOne({ orderId: ORDER_ID });
  if (!order) {
    console.log('Order not found');
    process.exit(1);
  }

  const seller = await Seller.findById(order.seller);
  const accessToken = await ensureValidToken(seller);
  const res = await axios.get(
    `https://api.ebay.com/sell/fulfillment/v1/order/${encodeURIComponent(ORDER_ID)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
  );
  const ebay = res.data;
  const cancelState =
    ebay.cancelStatus?.cancelState ||
    ebay.cancelStatus?.state ||
    ebay.cancelStatus?.status ||
    'NONE_REQUESTED';

  order.cancelStatus = ebay.cancelStatus;
  order.cancelState = cancelState;
  order.orderPaymentStatus = ebay.orderPaymentStatus;
  order.orderFulfillmentStatus = ebay.orderFulfillmentStatus;
  order.lastModifiedDate = ebay.lastModifiedDate;
  await order.save();

  console.log('Synced', {
    orderId: ORDER_ID,
    cancelState: order.cancelState,
    orderPaymentStatus: order.orderPaymentStatus,
    lastModifiedDate: order.lastModifiedDate,
  });

  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.response?.data || e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
