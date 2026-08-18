/**
 * Migration: Populate missing returnId fields on Return documents
 * Some Return documents might be missing the returnId field, which causes them
 * to be treated as regular Orders instead of Returns on the compliance board.
 * 
 * This script finds Returns without returnId and attempts to populate them
 * from other fields or create unique IDs.
 * 
 * Run with: node migrations/populate-missing-returnIds.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectToDatabase } from '../src/lib/db.js';
import '../src/models/Return.js';

// Load .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  try {
    console.log('[MIGRATION] Starting: Populate missing returnIds on Return documents...');
    
    await connectToDatabase();
    console.log('[MIGRATION] Connected to database');
    
    const Return = mongoose.model('Return');
    
    // Find all Returns that don't have returnId or have empty returnId
    const returnsWithoutReturnId = await Return.find({
      $or: [
        { returnId: { $exists: false } },
        { returnId: null },
        { returnId: '' }
      ]
    }).select('_id orderId returnStatus rawData creationDate').lean();
    
    console.log(`[MIGRATION] Found ${returnsWithoutReturnId.length} Returns without returnId field`);
    
    if (returnsWithoutReturnId.length === 0) {
      console.log('[MIGRATION] All Returns already have returnId field. Nothing to do.');
      await mongoose.connection.close();
      process.exit(0);
      return;
    }
    
    // Log sample of what we found
    console.log('[MIGRATION] Sample of Returns without returnId:');
    returnsWithoutReturnId.slice(0, 3).forEach(ret => {
      console.log(`  - _id: ${ret._id}, orderId: ${ret.orderId}, status: ${ret.returnStatus}`);
    });
    
    // Try to extract returnId from rawData if available
    let updatedCount = 0;
    
    for (const ret of returnsWithoutReturnId) {
      let returnIdValue = null;
      
      // Try to extract from rawData.id (eBay API response)
      if (ret.rawData?.id) {
        returnIdValue = String(ret.rawData.id).trim();
      }
      // Try to extract from rawData.returnId
      else if (ret.rawData?.returnId) {
        returnIdValue = String(ret.rawData.returnId).trim();
      }
      // If no returnId found, use the MongoDB _id as fallback
      // This keeps it unique and the frontend will handle it
      else if (ret._id) {
        // Use MongoDB _id stringified
        returnIdValue = String(ret._id);
        console.warn(`[MIGRATION] [FALLBACK] Return _id=${ret._id}, orderId=${ret.orderId}: No returnId in rawData, using MongoDB _id as returnId`);
      }
      
      if (returnIdValue) {
        const result = await Return.updateOne(
          { _id: ret._id },
          { $set: { returnId: returnIdValue } }
        );
        
        if (result.modifiedCount > 0) {
          updatedCount++;
          console.log(`[MIGRATION] ✓ Updated _id=${ret._id}: returnId=${returnIdValue}`);
        }
      } else {
        console.warn(`[MIGRATION] ⚠️  Could not find/generate returnId for _id=${ret._id}`);
      }
    }
    
    console.log(`[MIGRATION] Updated ${updatedCount} / ${returnsWithoutReturnId.length} Return documents`);
    
    // Verify the migration
    const stillMissing = await Return.countDocuments({
      $or: [
        { returnId: { $exists: false } },
        { returnId: null },
        { returnId: '' }
      ]
    });
    
    if (stillMissing === 0) {
      console.log('[MIGRATION] ✅ SUCCESS! All Returns now have returnId field');
    } else {
      console.warn(`[MIGRATION] ⚠️  WARNING: Still ${stillMissing} Returns without returnId`);
    }
    
    // Show sample of what was updated
    const updatedSample = await Return.find({
      returnId: { $exists: true, $ne: null, $ne: '' }
    })
      .select('_id returnId orderId creationDate')
      .limit(5)
      .lean();
    
    console.log('[MIGRATION] Sample of updated Returns:');
    updatedSample.forEach(ret => {
      console.log(`  - returnId: ${ret.returnId}, orderId: ${ret.orderId}, _id: ${ret._id}`);
    });
    
    await mongoose.connection.close();
    console.log('[MIGRATION] ✅ Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATION] ❌ Error:', err.message);
    console.error('[MIGRATION] Stack:', err.stack);
    try {
      await mongoose.connection.close();
    } catch (e) {}
    process.exit(1);
  }
}

migrate();
