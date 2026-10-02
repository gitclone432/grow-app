// One-time: restore Order.cancelState from the Fulfillment API value (Order.cancelStatus.cancelState)
// for orders overwritten with Post-Order lifecycle values (CLOSED/INITIAL/PENDING/APPROVAL_PENDING).
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import 'dotenv/config';
import mongoose from 'mongoose';
import Order from './src/models/Order.js';

const LIFECYCLE = ['CLOSED', 'INITIAL', 'PENDING', 'APPROVAL_PENDING'];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const filter = { cancelState: { $in: LIFECYCLE } };
  console.log('Matching orders:', await Order.countDocuments(filter));

  const result = await Order.collection.updateMany(filter, [
    {
      $set: {
        cancelState: {
          $ifNull: [
            { $cond: [{ $eq: ['$cancelStatus.cancelState', ''] }, null, '$cancelStatus.cancelState'] },
            'NONE_REQUESTED'
          ]
        }
      }
    }
  ]);
  console.log('Modified:', result.modifiedCount);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e.message);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
