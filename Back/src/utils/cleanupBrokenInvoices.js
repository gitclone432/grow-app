import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Invoice from '../models/Invoice.js';
import { connectToDatabase } from '../lib/db.js';
import { getGridFSBucket } from '../lib/gridfs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.join(__dirname, '../..');

dotenv.config({ path: path.join(serverRoot, '.env') });

async function cleanupBrokenInvoices() {
  try {
    console.log('[Cleanup] Connecting to database...');
    await connectToDatabase();
    
    console.log('[Cleanup] Fetching all invoices...');
    const invoices = await Invoice.find({});
    console.log(`[Cleanup] Found ${invoices.length} invoice(s)`);
    
    const bucket = getGridFSBucket();
    const brokenInvoices = [];
    
    for (const invoice of invoices) {
      if (!invoice.gridFsFileId) {
        console.log(`[Cleanup] Invoice ${invoice._id} has no gridFsFileId`);
        brokenInvoices.push(invoice);
        continue;
      }
      
      try {
        // Try to find the file in GridFS
        const files = await bucket.find({ _id: invoice.gridFsFileId }).toArray();
        if (files.length === 0) {
          console.log(`[Cleanup] ❌ Invoice ${invoice._id} references missing GridFS file: ${invoice.gridFsFileId}`);
          brokenInvoices.push(invoice);
        } else {
          console.log(`[Cleanup] ✓ Invoice ${invoice._id} has valid GridFS file: ${invoice.gridFsFileId}`);
        }
      } catch (error) {
        console.error(`[Cleanup] Error checking invoice ${invoice._id}:`, error.message);
        brokenInvoices.push(invoice);
      }
    }
    
    if (brokenInvoices.length === 0) {
      console.log('[Cleanup] ✓ All invoices have valid GridFS files!');
    } else {
      console.log(`\n[Cleanup] Found ${brokenInvoices.length} broken invoice(s):`);
      brokenInvoices.forEach(inv => {
        console.log(`  - ${inv._id}: ${inv.fileName} (gridFsFileId: ${inv.gridFsFileId || 'MISSING'})`);
      });
      
      console.log('\n[Cleanup] Deleting broken invoices...');
      const ids = brokenInvoices.map(inv => inv._id);
      const result = await Invoice.deleteMany({ _id: { $in: ids } });
      console.log(`[Cleanup] ✓ Deleted ${result.deletedCount} broken invoice record(s)`);
    }
    
    console.log('\n[Cleanup] Complete!');
    process.exit(0);
  } catch (error) {
    console.error('[Cleanup] Error:', error);
    process.exit(1);
  }
}

cleanupBrokenInvoices();
