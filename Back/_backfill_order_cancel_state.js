// One-time backfill: sync Order.cancelState from the Cancellation collection.
// The scheduled cancellations sync only wrote to Cancellation, never back to
// Order.cancelState, so existing orders show stale/blank cancel status on the
// Awaiting Shipment page. Run once after deploying the ebay.js fix.
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // sandbox default resolver can't do SRV lookups for mongodb+srv://

import 'dotenv/config';
import mongoose from 'mongoose';
import Order from './src/models/Order.js';
import Cancellation from './src/models/Cancellation.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const cancellations = await Cancellation.find({ cancelState: { $ne: null } })
    .select('seller orderId legacyOrderId cancelState')
    .lean();

  console.log(`Found ${cancellations.length} cancellation records`);

  let updated = 0;
  let skipped = 0;

  for (const c of cancellations) {
    const orderId = c.orderId || c.legacyOrderId;
    if (!orderId || !c.seller) { skipped++; continue; }

    const result = await Order.updateOne(
      { seller: c.seller, orderId, cancelState: { $ne: c.cancelState } },
      { $set: { cancelState: c.cancelState } }
    );
    if (result.modifiedCount > 0) updated++;
  }

  console.log(`Updated ${updated} orders, skipped ${skipped} (missing orderId/seller)`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
