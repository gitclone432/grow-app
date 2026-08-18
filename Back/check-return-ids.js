/**
 * Simple diagnostic script to check Return documents
 * This helps identify which Returns are missing returnId fields
 * 
 * Run with: node check-return-ids.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectToDatabase } from './src/lib/db.js';
import './src/models/Return.js';

// Load .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

async function diagnose() {
  try {
    console.log('[CHECK] Starting diagnostic check for Return documents...');
    
    await connectToDatabase();
    console.log('[CHECK] ✓ Connected to database');
    
    const Return = mongoose.model('Return');
    
    // Count total Returns
    const totalReturns = await Return.countDocuments({});
    console.log(`[CHECK] Total Returns in database: ${totalReturns}`);
    
    // Count Returns without returnId
    const withoutReturnId = await Return.countDocuments({
      $or: [
        { returnId: { $exists: false } },
        { returnId: null },
        { returnId: '' }
      ]
    });
    console.log(`[CHECK] Returns WITHOUT returnId: ${withoutReturnId}`);
    
    if (withoutReturnId === 0) {
      console.log('[CHECK] ✅ All Returns have returnId field - No action needed');
      await mongoose.connection.close();
      process.exit(0);
      return;
    }
    
    // Show sample of Returns without returnId
    console.log(`\n[CHECK] Sample of Returns without returnId:`);
    const samples = await Return.find({
      $or: [
        { returnId: { $exists: false } },
        { returnId: null },
        { returnId: '' }
      ]
    })
      .select('_id orderId returnStatus creationDate rawData')
      .limit(5)
      .lean();
    
    samples.forEach((ret, idx) => {
      const hasRawDataId = !!ret.rawData?.id;
      console.log(`  [${idx + 1}] _id: ${ret._id}`);
      console.log(`       orderId: ${ret.orderId}`);
      console.log(`       returnStatus: ${ret.returnStatus}`);
      console.log(`       rawData.id exists: ${hasRawDataId}`);
    });
    
    console.log(`\n[RECOMMENDATION] These ${withoutReturnId} Returns are missing returnId.`);
    console.log('[RECOMMENDATION] This causes them to appear as regular Orders on the Return board.');
    console.log('[RECOMMENDATION] To fix: Run the populate-missing-returnIds.js migration from the server.');
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('[CHECK] ❌ Error:', err.message);
    try {
      await mongoose.connection.close();
    } catch (e) {}
    process.exit(1);
  }
}

diagnose();
