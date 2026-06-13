/**
 * Import fulfillment columns from CSV into MongoDB orders (matched by Order ID).
 *
 * Usage (from Back/):
 *   node tools/importFulfillmentCsv.mjs "C:\path\to\Fulfillment_Orders.csv"
 *   node tools/importFulfillmentCsv.mjs "file.csv" --overwrite
 *
 * Default: only fills empty columns on existing orders.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { parseFulfillmentCsv } from '../src/utils/fulfillmentCsvImport.js';
import { importFulfillmentRows } from '../src/utils/applyOrderManualFieldUpdates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BATCH_SIZE = 250;

async function main() {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const overwrite = process.argv.includes('--overwrite');
  const csvPath = args[0];

  if (!csvPath) {
    console.error('Usage: node tools/importFulfillmentCsv.mjs <csv-path> [--overwrite]');
    process.exit(1);
  }

  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in Back/.env');
    process.exit(1);
  }

  console.log(`Reading ${resolved}...`);
  const text = fs.readFileSync(resolved, 'utf8');
  const { rows, errors: parseErrors } = parseFulfillmentCsv(text);

  console.log(`Parsed ${rows.length} importable rows (${parseErrors.length} skipped during parse)`);
  if (!rows.length) {
    console.error('Nothing to import.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');
  console.log(`Mode: ${overwrite ? 'overwrite existing values' : 'fill empty columns only'}`);

  const totals = { updated: 0, skipped: 0, notFound: 0, errors: [] };

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const batchNum = Math.floor(start / BATCH_SIZE) + 1;
    const batchTotal = Math.ceil(rows.length / BATCH_SIZE);
    process.stdout.write(`Batch ${batchNum}/${batchTotal} (${batch.length} rows)... `);

    const summary = await importFulfillmentRows(batch, { fillEmptyOnly: !overwrite });
    totals.updated += summary.updated;
    totals.skipped += summary.skipped;
    totals.notFound += summary.notFound;
    totals.errors.push(...(summary.errors || []));

    console.log(`updated ${summary.updated}, not found ${summary.notFound}, skipped ${summary.skipped}`);
  }

  await mongoose.disconnect();

  console.log('\nImport complete:');
  console.log(`  Updated:   ${totals.updated}`);
  console.log(`  Not found: ${totals.notFound}`);
  console.log(`  Skipped:   ${totals.skipped}`);

  if (totals.errors.length) {
    console.log('\nSample issues:');
    totals.errors.slice(0, 10).forEach((err) => {
      console.log(`  - row ${err.row}${err.orderId ? ` (${err.orderId})` : ''}: ${err.reason}`);
    });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
