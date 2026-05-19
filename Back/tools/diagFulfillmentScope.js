import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Seller from '../src/models/Seller.js';
import Order from '../src/models/Order.js';
import { getActiveSellerIds } from '../src/utils/activeSellerScope.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const totalOrders = await Order.countDocuments();
  const usersActiveTrue = await User.countDocuments({ active: true });
  const usersActiveFalse = await User.countDocuments({ active: false });
  const usersActiveUnset = await User.countDocuments({ active: { $exists: false } });
  const activeSellerIds = await getActiveSellerIds();
  const scopedOrders = await Order.countDocuments({ seller: { $in: activeSellerIds } });
  const oldScopeUsers = await User.find({ active: true }).distinct('_id');
  const oldSellerIds = await Seller.find({
    user: { $in: oldScopeUsers },
    isStoreActive: { $ne: false },
  }).distinct('_id');
  const oldScopedOrders = await Order.countDocuments({ seller: { $in: oldSellerIds } });
  console.log(
    JSON.stringify(
      {
        totalOrders,
        usersActiveTrue,
        usersActiveFalse,
        usersActiveUnset,
        activeSellerIds: activeSellerIds.length,
        scopedOrders,
        oldSellerIds: oldSellerIds.length,
        oldScopedOrders,
      },
      null,
      2
    )
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
