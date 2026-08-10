/**
 * Force-set calculated TDS = 0.1% of subtotal for all non-finances rows
 * (and optionally all rows — default: calculated only + finances with no positive TDS).
 *
 * Usage: node tools/backfillCalculatedTds.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';
import { computeCalculatedTds } from '../src/utils/exchangeRateUtils.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  // Rewrite every order that is not a real Finances TDS hit
  const filter = {
    $or: [
      { tdsSource: { $ne: 'finances' } },
      { tdsSource: 'finances', tds: { $lte: 0 } },
      { tdsSource: { $exists: false } },
      { tds: { $exists: false } },
      { tds: null },
    ],
  };

  const total = await Order.countDocuments(filter);
  console.log(`[Backfill Calculated TDS] Rewriting ${total} orders → subtotal × 0.1%`);

  const cursor = Order.find(filter).select(
    '_id subtotal subtotalUSD orderEarnings tid ebayExchangeRate tds tdsSource'
  ).cursor();

  let success = 0;
  let failed = 0;
  let processed = 0;
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    await Order.bulkWrite(batch, { ordered: false });
    success += batch.length;
    batch = [];
  };

  for await (const order of cursor) {
    processed += 1;
    try {
      const tds = computeCalculatedTds(order);
      const tid = order.tid != null && order.tid !== undefined ? Number(order.tid) : 0.24;
      const earnings = parseFloat(order.orderEarnings);
      const set = {
        tds,
        tdsSource: 'calculated',
        tid,
        tdsFinancesChecked: false,
      };

      if (Number.isFinite(earnings)) {
        const net = parseFloat((earnings - tds - tid).toFixed(2));
        set.net = net;
        const rate = parseFloat(order.ebayExchangeRate);
        if (Number.isFinite(rate)) {
          set.pBalanceINR = parseFloat((net * rate).toFixed(2));
        }
      }

      batch.push({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: set },
        },
      });

      if (batch.length >= 500) await flush();
    } catch (err) {
      failed += 1;
      if (failed <= 10) console.error(`  fail ${order._id}: ${err.message}`);
    }

    if (processed % 2000 === 0) {
      console.log(`  progress ${processed}/${total} (ok=${success}, fail=${failed})`);
    }
  }

  await flush();
  console.log(`[Backfill Calculated TDS] Done: ${success} updated, ${failed} failed, ${processed} processed`);

  // Spot-check the reported order
  const check = await Order.findOne({ orderId: '06-14988-29019' })
    .select('orderId subtotal tds tdsSource')
    .lean();
  if (check) {
    console.log('spot-check 06-14988-29019:', check, 'expect', computeCalculatedTds(check));
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
