import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import { computeCalculatedTds, CALCULATED_TDS_RATE } from '../src/utils/exchangeRateUtils.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log('rate', CALCULATED_TDS_RATE);

const near = await Order.find({
  subtotal: { $gte: 55, $lte: 56 },
  tds: { $gte: 0.4, $lte: 0.6 },
}).select('orderId subtotal tds tdsSource orderTotal').limit(10).lean();

console.log('near 55 subtotal with tds~0.5:', near.map((s) => ({
  orderId: s.orderId,
  subtotal: s.subtotal,
  tds: s.tds,
  tdsSource: s.tdsSource,
  expect001: computeCalculatedTds(s),
  ratio: s.subtotal ? Number((s.tds / s.subtotal).toFixed(5)) : null,
})));

const samples = await Order.find({ tdsSource: 'calculated', subtotal: { $gt: 0 } })
  .select('orderId subtotal tds')
  .limit(20)
  .lean();

let wrong1pct = 0;
let right01 = 0;
for (const s of samples) {
  const ratio = s.tds / s.subtotal;
  if (Math.abs(ratio - 0.01) < 0.002) wrong1pct += 1;
  if (Math.abs(ratio - 0.001) < 0.0005) right01 += 1;
}
console.log({ sampleWrong1pct: wrong1pct, sampleRight01: right01, sampleSize: samples.length });
console.log('sample rows', samples.slice(0, 8).map((s) => ({
  orderId: s.orderId,
  subtotal: s.subtotal,
  tds: s.tds,
  expect: computeCalculatedTds(s),
  ratio: Number((s.tds / s.subtotal).toFixed(5)),
})));

await mongoose.disconnect();
