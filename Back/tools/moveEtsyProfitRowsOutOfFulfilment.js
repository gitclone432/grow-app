/**
 * Moves Profit Sheet rows that were imported into the Order Fulfilment collection
 * before the two sheets had separate storage.
 *
 * Signature of a profit-sheet row: Etsy fee filled, but no shipping address and no SKU.
 * Run with --apply to perform the move; without it the script only reports.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EtsyOrderFulfilment from '../src/models/EtsyOrderFulfilment.js';
import EtsyProfitSheet from '../src/models/EtsyProfitSheet.js';
import EtsyStore from '../src/models/EtsyStore.js';

dotenv.config();

const APPLY = process.argv.includes('--apply');

const PROFIT_ROW_FILTER = {
  etsyFee: { $nin: ['', null] },
  $and: [
    { $or: [{ address: '' }, { address: { $exists: false } }] },
    { $or: [{ sku: '' }, { sku: { $exists: false } }] },
  ],
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const stores = await EtsyStore.find({}).select('name').lean();
  const storeName = new Map(stores.map((s) => [String(s._id), s.name]));

  const candidates = await EtsyOrderFulfilment.find(PROFIT_ROW_FILTER).lean();
  console.log(`Matched ${candidates.length} profit-sheet rows inside Order Fulfilment.`);

  const perStore = new Map();
  for (const row of candidates) {
    const key = String(row.store);
    perStore.set(key, (perStore.get(key) || 0) + 1);
  }
  for (const [storeId, count] of perStore) {
    console.log(`  ${storeName.get(storeId) || storeId}: ${count}`);
  }

  if (candidates.length) {
    const sample = candidates[0];
    console.log('\nSample row:', {
      dateSold: sample.dateSold,
      productName: sample.productName,
      etsyFee: sample.etsyFee,
      net: sample.net,
      address: sample.address,
      sku: sample.sku,
    });
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to move these rows.');
    await mongoose.connection.close();
    return;
  }

  let moved = 0;
  const chunkSize = 500;
  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    await EtsyProfitSheet.insertMany(chunk, { ordered: false });
    const ids = chunk.map((row) => row._id);
    await EtsyOrderFulfilment.deleteMany({ _id: { $in: ids } });
    moved += chunk.length;
    console.log(`Moved ${moved}/${candidates.length}`);
  }

  console.log(`\nDone. orderfulfilments: ${await EtsyOrderFulfilment.countDocuments()} rows | etsyprofitsheets: ${await EtsyProfitSheet.countDocuments()} rows`);
  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
