/**
 * One-off backfill: sets `admins` on any group Conversation that doesn't
 * have one yet (created before the group-admin feature existed), defaulting
 * to the group's creator. Safe to run more than once.
 *
 * Usage: node tools/backfillGroupAdmins.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { setServers } from 'dns';
import Conversation from '../src/models/Conversation.js';

setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const groups = await Conversation.find({
    type: 'group',
    $or: [{ admins: { $exists: false } }, { admins: { $size: 0 } }],
  });
  console.log(`[Backfill Group Admins] Found ${groups.length} group(s) with no admins set`);
  for (const g of groups) {
    const admin = g.createdBy || g.participants[0];
    g.admins = [admin];
    await g.save();
    console.log(`  "${g.name}" -> admin set to ${admin}`);
  }
  console.log('[Backfill Group Admins] Done');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[Backfill Group Admins] Failed:', err);
  process.exit(1);
});
