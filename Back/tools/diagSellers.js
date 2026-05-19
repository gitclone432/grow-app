import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Seller from '../src/models/Seller.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const withToken = await Seller.countDocuments({
    'ebayTokens.access_token': { $exists: true, $ne: null },
  });
  const sellers = await Seller.find({})
    .select('sellerId isStoreActive user ebayTokens.access_token')
    .lean();
  console.log(
    JSON.stringify(
      {
        withToken,
        sellers: sellers.map((s) => ({
          id: s._id,
          sellerId: s.sellerId,
          isStoreActive: s.isStoreActive,
          hasToken: Boolean(s.ebayTokens?.access_token),
        })),
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
