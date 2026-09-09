import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EtsyOrderFulfilment from '../src/models/EtsyOrderFulfilment.js';
import EtsyProfitSheet from '../src/models/EtsyProfitSheet.js';
import EtsyStore from '../src/models/EtsyStore.js';

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const stores = await EtsyStore.find({}).select('name').lean();
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));

  const total = await EtsyOrderFulfilment.countDocuments();
  const profitTotal = await EtsyProfitSheet.countDocuments();
  console.log(`orderfulfilments: ${total} rows | etsyprofitsheets: ${profitTotal} rows`);

  const byBatch = await EtsyOrderFulfilment.aggregate([
    {
      $group: {
        _id: {
          store: '$store',
          day: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } },
        },
        count: { $sum: 1 },
        withAddress: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$address', ''] } }, 0] }, 1, 0] } },
        withSku: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$sku', ''] } }, 0] }, 1, 0] } },
        withEtsyFee: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$etsyFee', ''] } }, 0] }, 1, 0] } },
        sample: { $first: '$productName' },
      },
    },
    { $sort: { '_id.day': -1, count: -1 } },
    { $limit: 40 },
  ]);

  console.log('\ncreatedAt hour | store | rows | withAddress | withSku | withEtsyFee | sample productName');
  for (const row of byBatch) {
    const name = storeName.get(String(row._id.store)) || String(row._id.store);
    console.log(
      `${row._id.day} | ${name} | ${row.count} | ${row.withAddress} | ${row.withSku} | ${row.withEtsyFee} | ${String(row.sample || '').slice(0, 40)}`
    );
  }

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
