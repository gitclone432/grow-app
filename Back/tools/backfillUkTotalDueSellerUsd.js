import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Order from '../src/models/Order.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = {
    purchaseMarketplaceId: { $in: ['EBAY_GB', 'EBAY_UK', 'GB', 'UK'] },
    'paymentSummary.totalDueSeller.value': { $exists: true }
  };
  const cursor = Order.find(filter).select('_id paymentSummary.totalDueSeller').cursor();
  let n = 0;
  for await (const o of cursor) {
    const v = parseFloat(o.paymentSummary?.totalDueSeller?.value);
    if (!Number.isFinite(v)) continue;
    await Order.updateOne(
      { _id: o._id },
      { $set: { totalDueSellerUSD: parseFloat(v.toFixed(2)) } }
    );
    n += 1;
    if (n % 500 === 0) console.log('progress', n);
  }
  console.log('backfilled UK totalDueSellerUSD:', n);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
