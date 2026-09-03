/**
 * One-off migration: moves InternalMessage from the old schema (string
 * conversationId = "user1_user2" sorted usernames, single sender/recipient,
 * boolean `read`) to the new schema (conversationId = ObjectId ref
 * Conversation, readBy: [{user, readAt}]) that backs group chats.
 *
 * For every distinct old string conversationId found on existing messages,
 * creates one `Conversation` (type: 'dm') with the two participants, then
 * rewrites each message's conversationId to that Conversation's _id and
 * backfills readBy from the old boolean `read` field (read:true -> the
 * recipient has read it).
 *
 * Safe to run once against a database still holding pre-migration documents
 * (conversationId as a String). Running it again is a no-op: it skips any
 * message whose conversationId already looks like an ObjectId.
 *
 * Usage: node tools/migrateInternalMessagesToConversations.js
 * Run this BEFORE deploying the new backend code, against a copy of
 * production data first to confirm counts, then against production.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { setServers } from 'dns';
import Conversation from '../src/models/Conversation.js';
import User from '../src/models/User.js';

// Match src/index.js: local DNS often fails to resolve the Atlas SRV record.
setServers(['8.8.8.8', '8.8.4.4']);

dotenv.config();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const messages = db.collection('internalmessages');

  // Old-shape messages: conversationId is a plain string (not a 24-char hex ObjectId)
  const oldMessages = await messages.find({
    conversationId: { $type: 'string' },
  }).toArray();

  console.log(`[Migrate InternalMessages] Found ${oldMessages.length} legacy messages to migrate`);

  const byOldConvId = new Map();
  for (const msg of oldMessages) {
    if (!byOldConvId.has(msg.conversationId)) byOldConvId.set(msg.conversationId, []);
    byOldConvId.get(msg.conversationId).push(msg);
  }

  console.log(`[Migrate InternalMessages] ${byOldConvId.size} distinct legacy conversations`);

  let convertedConversations = 0;
  let convertedMessages = 0;
  let skippedConversations = 0;

  for (const [oldConvId, msgs] of byOldConvId) {
    // Derive the two participants from sender/recipient across the thread —
    // more robust than re-parsing the "user1_user2" username string.
    const participantIds = new Set();
    for (const m of msgs) {
      if (m.sender) participantIds.add(String(m.sender));
      if (m.recipient) participantIds.add(String(m.recipient));
    }
    const ids = Array.from(participantIds);

    if (ids.length !== 2) {
      console.warn(`[Migrate InternalMessages] Skipping "${oldConvId}" — expected 2 participants, found ${ids.length}`);
      skippedConversations += 1;
      continue;
    }

    const users = await User.find({ _id: { $in: ids } }).select('_id').lean();
    if (users.length !== 2) {
      console.warn(`[Migrate InternalMessages] Skipping "${oldConvId}" — one or both users no longer exist`);
      skippedConversations += 1;
      continue;
    }

    const lastMsg = msgs.reduce((a, b) => (new Date(a.messageDate) > new Date(b.messageDate) ? a : b));

    const conversation = await Conversation.create({
      type: 'dm',
      participants: ids,
      createdBy: msgs[0].sender,
      lastMessage: { body: lastMsg.body, senderId: lastMsg.sender, createdAt: lastMsg.messageDate },
      lastMessageAt: lastMsg.messageDate,
    });
    convertedConversations += 1;

    for (const m of msgs) {
      const readBy = [];
      // Sender has implicitly "read" their own message
      readBy.push({ user: m.sender, readAt: m.messageDate });
      // Old boolean `read` referred to the recipient having read it
      if (m.read && m.recipient) {
        readBy.push({ user: m.recipient, readAt: m.updatedAt || m.messageDate });
      }

      await messages.updateOne(
        { _id: m._id },
        {
          $set: { conversationId: conversation._id, readBy },
          $unset: { recipient: '', read: '' },
        }
      );
      convertedMessages += 1;
    }
  }

  console.log(`[Migrate InternalMessages] Done. Conversations created: ${convertedConversations}, messages migrated: ${convertedMessages}, skipped: ${skippedConversations}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[Migrate InternalMessages] Failed:', err);
  process.exit(1);
});
