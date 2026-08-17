/**
 * Migration: Add complianceBoardStatus field to all existing Return documents
 * This initializes all Returns with complianceBoardStatus: 'case_opened' as default
 * 
 * Run with: node migrations/add-complianceBoardStatus-to-returns.js
 */

const mongoose = require('mongoose');
const db = require('../src/lib/db');

async function migrate() {
  try {
    console.log('[MIGRATION] Starting: Add complianceBoardStatus to all Returns...');
    
    await db.connect();
    console.log('[MIGRATION] Connected to database');
    
    const Return = mongoose.model('Return');
    
    // Find all Returns that don't have complianceBoardStatus
    const returnsWithoutStatus = await Return.countDocuments({
      complianceBoardStatus: { $exists: false }
    });
    
    console.log(`[MIGRATION] Found ${returnsWithoutStatus} Returns without complianceBoardStatus field`);
    
    if (returnsWithoutStatus === 0) {
      console.log('[MIGRATION] All Returns already have complianceBoardStatus field. Nothing to do.');
      await db.disconnect();
      process.exit(0);
      return;
    }
    
    // Update all Returns without complianceBoardStatus to default to 'case_opened'
    const result = await Return.updateMany(
      { complianceBoardStatus: { $exists: false } },
      { $set: { complianceBoardStatus: 'case_opened' } }
    );
    
    console.log(`[MIGRATION] Updated ${result.modifiedCount} Return documents`);
    console.log(`[MIGRATION] Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    
    // Verify the migration
    const stillMissing = await Return.countDocuments({
      complianceBoardStatus: { $exists: false }
    });
    
    if (stillMissing === 0) {
      console.log('[MIGRATION] ✅ SUCCESS! All Returns now have complianceBoardStatus field');
    } else {
      console.warn(`[MIGRATION] ⚠️  WARNING: Still ${stillMissing} Returns without complianceBoardStatus`);
    }
    
    // Show a sample of what was updated
    const sample = await Return.find({})
      .select('returnId complianceBoardStatus orderId')
      .limit(5)
      .lean();
    
    console.log('[MIGRATION] Sample of updated Returns:');
    sample.forEach(ret => {
      console.log(`  - returnId: ${ret.returnId}, status: ${ret.complianceBoardStatus}, orderId: ${ret.orderId}`);
    });
    
    await db.disconnect();
    console.log('[MIGRATION] ✅ Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('[MIGRATION] ❌ Error:', err.message);
    console.error('[MIGRATION] Stack:', err.stack);
    try {
      await db.disconnect();
    } catch (e) {}
    process.exit(1);
  }
}

migrate();
