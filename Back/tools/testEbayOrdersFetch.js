/**
 * Test eBay Fulfillment getOrders for the first seller with a token.
 * Usage: node tools/testEbayOrdersFetch.js
 */
import dotenv from 'dotenv';
import axios from 'axios';
import mongoose from 'mongoose';
import Seller from '../src/models/Seller.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const seller = await Seller.findOne({
    'ebayTokens.access_token': { $exists: true, $ne: null },
  }).lean();

  if (!seller) {
    console.log('No seller with eBay token in DB.');
    await mongoose.disconnect();
    return;
  }

  const token = seller.ebayTokens.access_token;
  const days = parseInt(process.env.EBAY_ORDER_INITIAL_LOOKBACK_DAYS || '90', 10) || 90;
  let from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let to = new Date(Date.now() - 5 * 60 * 1000);
  let filter = `creationdate:[${from.toISOString()}..${to.toISOString()}]`;

  console.log('Seller:', seller._id, seller.sellerId || '(no sellerId)');
  console.log('Filter:', filter);

  try {
    const res = await axios.get('https://api.ebay.com/sell/fulfillment/v1/order', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      params: { filter, limit: 10 },
      timeout: 20000,
    });
    const orders = res.data.orders || [];
    console.log('OK — total:', res.data.total, 'returned:', orders.length);
    if (orders[0]) {
      console.log('Sample orderId:', orders[0].orderId, 'created:', orders[0].creationDate);
    }
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    const isFuture = body?.errors?.some((e) => e.errorId === 30850);
    console.error('eBay API error:', status, JSON.stringify(body, null, 2) || err.message);
    if (isFuture) {
      to = new Date('2025-05-18T23:59:59.999Z');
      from = new Date('2025-02-18T00:00:00.000Z');
      filter = `creationdate:[${from.toISOString()}..${to.toISOString()}]`;
      console.log('Retrying with 2025 range:', filter);
      const res2 = await axios.get('https://api.ebay.com/sell/fulfillment/v1/order', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        params: { filter, limit: 10 },
        timeout: 20000,
      });
      console.log('OK (2025 range) — total:', res2.data.total, 'returned:', (res2.data.orders || []).length);
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
