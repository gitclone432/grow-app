import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from '../src/models/Order.js';
import {
  enrichOrderLikeAllOrdersSheet,
  prefetchExchangeRatesForOrders,
  sumLiveFinancialsForOrders,
} from '../src/utils/allOrdersSheetEnrichment.js';

dotenv.config();

const SUFFIXES = [
  '14961-60532', '14953-51778', '14924-63257', '14952-25078',
  '14946-13102', '14959-32622', '14943-65061',
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = [];
  for (const s of SUFFIXES) {
    const o = await Order.findOne({ orderId: { $regex: `${s.replace(/-/g, '\\-')}$` } }).lean();
    if (o) orders.push(o);
  }
  console.log('Found', orders.length, 'orders\n');

  const rateCache = await prefetchExchangeRatesForOrders(orders);
  const { totals } = await sumLiveFinancialsForOrders(orders);

  let rowSum = 0;
  for (const order of orders) {
    const obj = { ...order };
    enrichOrderLikeAllOrdersSheet(obj, rateCache);
    rowSum += obj.profit;
    console.log(
      order.orderId,
      (order.amazonAccount || '-').padEnd(14),
      'storedProfit', (parseFloat(order.profit) || 0).toFixed(2),
      'rowProfit', obj.profit.toFixed(2),
      'tds', order.tds, '->', obj.tds,
    );
  }

  console.log('\nRow sum:   ', rowSum.toFixed(2));
  console.log('KPI total: ', totals.profit.toFixed(2));
  console.log('Match:     ', Math.abs(rowSum - totals.profit) < 0.01 ? 'YES' : 'NO');

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
