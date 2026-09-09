import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EtsyOrderFulfilment from '../src/models/EtsyOrderFulfilment.js';
import EtsyProfitSheet from '../src/models/EtsyProfitSheet.js';

dotenv.config();

const CUTOFF = process.argv[2] || '2026-09-06';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  for (const [label, Model] of [['orderfulfilments', EtsyOrderFulfilment], ['etsyprofitsheets', EtsyProfitSheet]]) {
    const total = await Model.countDocuments();
    const onOrAfter = await Model.countDocuments({ dateSold: { $gte: CUTOFF } });
    const newest = await Model.aggregate([
      { $match: { dateSold: { $nin: ['', null] } } },
      { $group: { _id: '$dateSold', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 5 },
    ]);
    console.log(`${label}: ${total} rows | dateSold >= ${CUTOFF}: ${onOrAfter}`);
    console.log(`  newest: ${newest.map((r) => `${r._id}(${r.count})`).join(', ')}`);
  }

  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.connection.close(); } catch { /* ignore */ }
  process.exit(1);
});
