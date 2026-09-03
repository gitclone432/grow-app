import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import {
  sendMessageSchema,
  createDmSchema,
  createGroupSchema,
  updateConversationSchema,
  addParticipantsSchema,
} from '../schemas/index.js';
import InternalMessage from '../models/InternalMessage.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import { emitToUsers } from '../lib/socket.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const ext = path.extname(file.originalname);
    cb(null, `${timestamp}-${random}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadConversationForUser(conversationId, userId, role) {
  if (!mongoose.isValidObjectId(conversationId)) return { conversation: null, forbidden: false };
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return { conversation: null, forbidden: false };
  const isParticipant = conversation.participants.some((p) => p.toString() === String(userId));
  if (!isParticipant && role !== 'superadmin') {
    return { conversation, forbidden: true };
  }
  return { conversation, forbidden: false };
}

// Groups with no admins[] set (pre-admin-feature data that a backfill missed)
// fall back to "the creator is admin" so a group is never fully adminless.
// Only if there's no creator on record either do we fall back to "everyone",
// as a last resort so nobody gets permanently locked out.
function isGroupAdmin(conversation, userId) {
  const uid = String(userId);
  if (conversation.admins && conversation.admins.length > 0) {
    return conversation.admins.some((a) => a.toString() === uid);
  }
  if (conversation.createdBy) {
    return conversation.createdBy.toString() === uid;
  }
  return true;
}

// A platform superadmin always has admin rights in any group, regardless of
// the stored admins[] list — this is what makes them un-demotable stick even
// against stale data from before that protection existed.
function computeEffectiveAdminIds(conversation) {
  const ids = new Set((conversation.admins || []).map((a) => a.toString()));
  (conversation.participants || []).forEach((p) => {
    if (p.role === 'superadmin') ids.add(p._id.toString());
  });
  if (ids.size === 0) {
    if (conversation.createdBy) ids.add(conversation.createdBy.toString());
    else (conversation.participants || []).forEach((p) => ids.add(p._id.toString()));
  }
  return Array.from(ids);
}

// Shapes a Conversation doc (with populated participants) for the sidebar/list,
// resolving the display name/avatar for dm vs group and attaching unreadCount.
async function shapeConversation(conversation, currentUserId) {
  const otherParticipants = conversation.participants.filter(
    (p) => p._id.toString() !== String(currentUserId)
  );

  const isGroup = conversation.type === 'group';
  const displayName = isGroup
    ? conversation.name
    : (otherParticipants[0]?.username || 'Unknown');

  const unreadCount = await InternalMessage.countDocuments({
    conversationId: conversation._id,
    sender: { $ne: currentUserId },
    'readBy.user': { $ne: currentUserId },
  });

  return {
    conversationId: conversation._id,
    type: conversation.type,
    name: conversation.name,
    displayName,
    avatarUrl: conversation.avatarUrl,
    participants: conversation.participants,
    otherUser: !isGroup ? (otherParticipants[0] || null) : null,
    admins: isGroup ? computeEffectiveAdminIds(conversation) : [],
    createdBy: conversation.createdBy ? conversation.createdBy.toString() : null,
    lastMessage: conversation.lastMessage?.body || null,
    lastMessageDate: conversation.lastMessageAt,
    unreadCount,
  };
}

// 1. SEARCH USERS (for starting new conversations / adding group members)
router.get('/search-users', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user.userId;

    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const users = await User.find({
      _id: { $ne: currentUserId },
      active: true,
      username: { $regex: q, $options: 'i' }
    })
    .select('username role email')
    .limit(20);

    res.json(users);
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET CONVERSATIONS LIST (Sidebar) — both dm and group
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    const conversations = await Conversation.find({ participants: currentUserId })
      .sort({ lastMessageAt: -1 })
      .populate('participants', 'username role email');

    const shaped = await Promise.all(
      conversations.map((conv) => shapeConversation(conv, currentUserId))
    );

    res.json(shaped);
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. CREATE / FIND DM CONVERSATION
router.post('/conversations/dm', requireAuth, validate(createDmSchema), async (req, res) => {
  try {
    const { recipientId } = req.body;
    const currentUserId = req.user.userId;

    if (recipientId === currentUserId) {
      return res.status(400).json({ error: 'Cannot start a conversation with yourself' });
    }

    const recipient = await User.findById(recipientId).select('_id');
    if (!recipient) return res.status(404).json({ error: 'User not found' });

    let conversation = await Conversation.findOne({
      type: 'dm',
      participants: { $all: [currentUserId, recipientId], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'dm',
        participants: [currentUserId, recipientId],
        createdBy: currentUserId,
        lastMessageAt: new Date(),
      });
    }

    await conversation.populate('participants', 'username role email');
    res.json(await shapeConversation(conversation, currentUserId));
  } catch (err) {
    console.error('Create dm error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. CREATE GROUP CONVERSATION
router.post('/conversations/group', requireAuth, validate(createGroupSchema), async (req, res) => {
  try {
    const { name, participantIds } = req.body;
    const currentUserId = req.user.userId;

    const uniqueIds = Array.from(new Set([...participantIds, String(currentUserId)]));
    const users = await User.find({ _id: { $in: uniqueIds } }).select('_id');
    if (users.length !== uniqueIds.length) {
      return res.status(400).json({ error: 'One or more selected users were not found' });
    }

    const conversation = await Conversation.create({
      type: 'group',
      name,
      participants: uniqueIds,
      admins: [currentUserId],
      createdBy: currentUserId,
      lastMessageAt: new Date(),
    });

    await conversation.populate('participants', 'username role email');

    emitToUsers(
      uniqueIds.filter((id) => id !== String(currentUserId)),
      'conversation_updated',
      { conversationId: conversation._id }
    );

    res.json(await shapeConversation(conversation, currentUserId));
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. RENAME GROUP / UPDATE AVATAR
router.patch('/conversations/:id', requireAuth, validate(updateConversationSchema), async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { conversation, forbidden } = await loadConversationForUser(req.params.id, currentUserId, req.user.role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (forbidden) return res.status(403).json({ error: 'Forbidden: Not your conversation' });
    if (conversation.type !== 'group') return res.status(400).json({ error: 'Only groups can be updated' });
    if (!isGroupAdmin(conversation, currentUserId) && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only group admins can do this' });
    }

    if (req.body.name !== undefined) conversation.name = req.body.name;
    if (req.body.avatarUrl !== undefined) conversation.avatarUrl = req.body.avatarUrl;
    await conversation.save();
    await conversation.populate('participants', 'username role email');

    emitToUsers(
      conversation.participants.map((p) => p._id.toString()).filter((id) => id !== String(currentUserId)),
      'conversation_updated',
      { conversationId: conversation._id }
    );

    res.json(await shapeConversation(conversation, currentUserId));
  } catch (err) {
    console.error('Update conversation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 6. ADD PARTICIPANTS TO GROUP
router.post('/conversations/:id/participants', requireAuth, validate(addParticipantsSchema), async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { conversation, forbidden } = await loadConversationForUser(req.params.id, currentUserId, req.user.role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (forbidden) return res.status(403).json({ error: 'Forbidden: Not your conversation' });
    if (conversation.type !== 'group') return res.status(400).json({ error: 'Can only add members to groups' });

    const { userIds } = req.body;
    const users = await User.find({ _id: { $in: userIds } }).select('_id');
    if (users.length !== new Set(userIds).size) {
      return res.status(400).json({ error: 'One or more selected users were not found' });
    }

    const existing = new Set(conversation.participants.map((p) => p.toString()));
    userIds.forEach((id) => existing.add(id));
    conversation.participants = Array.from(existing);
    await conversation.save();
    await conversation.populate('participants', 'username role email');

    emitToUsers(userIds, 'conversation_updated', { conversationId: conversation._id, added: true });
    emitToUsers(
      conversation.participants.map((p) => p._id.toString()).filter((id) => id !== String(currentUserId)),
      'conversation_updated',
      { conversationId: conversation._id }
    );

    res.json(await shapeConversation(conversation, currentUserId));
  } catch (err) {
    console.error('Add participants error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. REMOVE PARTICIPANT FROM GROUP (or leave, if removing self)
router.delete('/conversations/:id/participants/:userId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { conversation, forbidden } = await loadConversationForUser(req.params.id, currentUserId, req.user.role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (forbidden) return res.status(403).json({ error: 'Forbidden: Not your conversation' });
    if (conversation.type !== 'group') return res.status(400).json({ error: 'Can only remove members from groups' });

    const { userId } = req.params;
    const isSelfRemoval = userId === String(currentUserId);
    if (!isSelfRemoval && !isGroupAdmin(conversation, currentUserId) && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only group admins can remove other members' });
    }
    if (!isSelfRemoval) {
      const targetUser = await User.findById(userId).select('role');
      if (targetUser?.role === 'superadmin') {
        return res.status(403).json({ error: 'Superadmin cannot be removed from the group' });
      }
    }

    conversation.participants = conversation.participants.filter((p) => p.toString() !== userId);
    conversation.admins = (conversation.admins || []).filter((a) => a.toString() !== userId);

    if (conversation.participants.length === 0) {
      await conversation.deleteOne();
      await InternalMessage.deleteMany({ conversationId: conversation._id });
      return res.json({ deleted: true });
    }

    await conversation.save();
    await conversation.populate('participants', 'username role email');

    emitToUsers([userId], 'conversation_updated', { conversationId: conversation._id, removed: true });
    emitToUsers(
      conversation.participants.map((p) => p._id.toString()).filter((id) => id !== String(currentUserId)),
      'conversation_updated',
      { conversationId: conversation._id }
    );

    res.json(await shapeConversation(conversation, currentUserId));
  } catch (err) {
    console.error('Remove participant error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7b. PROMOTE PARTICIPANT TO GROUP ADMIN
router.post('/conversations/:id/admins/:userId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { conversation, forbidden } = await loadConversationForUser(req.params.id, currentUserId, req.user.role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (forbidden) return res.status(403).json({ error: 'Forbidden: Not your conversation' });
    if (conversation.type !== 'group') return res.status(400).json({ error: 'Only groups have admins' });
    if (!isGroupAdmin(conversation, currentUserId) && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only group admins can promote other members' });
    }

    const { userId } = req.params;
    if (!conversation.participants.some((p) => p.toString() === userId)) {
      return res.status(400).json({ error: 'User is not a member of this group' });
    }

    const admins = new Set((conversation.admins || []).map((a) => a.toString()));
    admins.add(userId);
    conversation.admins = Array.from(admins);
    await conversation.save();
    await conversation.populate('participants', 'username role email');

    emitToUsers(
      conversation.participants.map((p) => p._id.toString()).filter((id) => id !== String(currentUserId)),
      'conversation_updated',
      { conversationId: conversation._id }
    );

    res.json(await shapeConversation(conversation, currentUserId));
  } catch (err) {
    console.error('Promote admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7c. DEMOTE GROUP ADMIN BACK TO REGULAR MEMBER
router.delete('/conversations/:id/admins/:userId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { conversation, forbidden } = await loadConversationForUser(req.params.id, currentUserId, req.user.role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (forbidden) return res.status(403).json({ error: 'Forbidden: Not your conversation' });
    if (conversation.type !== 'group') return res.status(400).json({ error: 'Only groups have admins' });
    if (!isGroupAdmin(conversation, currentUserId) && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only group admins can demote other admins' });
    }

    const { userId } = req.params;

    const targetUser = await User.findById(userId).select('role');
    if (targetUser?.role === 'superadmin') {
      return res.status(403).json({ error: 'Superadmin cannot be demoted' });
    }

    const currentAdmins = conversation.admins && conversation.admins.length > 0
      ? conversation.admins.map((a) => a.toString())
      : conversation.participants.map((p) => p.toString()); // legacy fallback: everyone was an admin

    const remaining = currentAdmins.filter((id) => id !== userId);
    if (remaining.length === 0) {
      return res.status(400).json({ error: 'A group must keep at least one admin' });
    }

    conversation.admins = remaining;
    await conversation.save();
    await conversation.populate('participants', 'username role email');

    emitToUsers(
      conversation.participants.map((p) => p._id.toString()).filter((id) => id !== String(currentUserId)),
      'conversation_updated',
      { conversationId: conversation._id }
    );

    res.json(await shapeConversation(conversation, currentUserId));
  } catch (err) {
    console.error('Demote admin error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 8. GET MESSAGES IN CONVERSATION
router.get('/messages/:conversationId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const { conversation, forbidden } = await loadConversationForUser(req.params.conversationId, currentUserId, req.user.role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (forbidden) return res.status(403).json({ error: 'Forbidden: Not your conversation' });

    const messages = await InternalMessage.find({ conversationId: conversation._id })
      .populate('sender', 'username role')
      .populate('mentions', 'username role')
      .sort({ messageDate: 1 });

    // Mark unread messages (from others) as read by the current user
    await InternalMessage.updateMany(
      {
        conversationId: conversation._id,
        sender: { $ne: currentUserId },
        'readBy.user': { $ne: currentUserId },
      },
      { $push: { readBy: { user: currentUserId, readAt: new Date() } } }
    );

    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. SEND MESSAGE
router.post('/send', requireAuth, validate(sendMessageSchema), async (req, res) => {
  try {
    const { conversationId, body, mediaUrls, mentions } = req.body;
    const currentUserId = req.user.userId;

    const { conversation, forbidden } = await loadConversationForUser(conversationId, currentUserId, req.user.role);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (forbidden) return res.status(403).json({ error: 'Forbidden: Not your conversation' });

    const newMessage = await InternalMessage.create({
      conversationId: conversation._id,
      sender: currentUserId,
      body,
      mediaUrls: mediaUrls || [],
      mentions: mentions || [],
      readBy: [{ user: currentUserId, readAt: new Date() }],
      messageDate: new Date()
    });

    conversation.lastMessage = { body, senderId: currentUserId, createdAt: newMessage.messageDate };
    conversation.lastMessageAt = newMessage.messageDate;
    await conversation.save();

    await newMessage.populate('sender', 'username role');
    await newMessage.populate('mentions', 'username role');

    const recipientIds = conversation.participants
      .map((p) => p.toString())
      .filter((id) => id !== String(currentUserId));

    emitToUsers(recipientIds, 'new_message', {
      conversationId: conversation._id,
      message: newMessage,
    });

    res.json(newMessage);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 10. GET UNREAD COUNT (for badge)
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    const myConversationIds = await Conversation.find({ participants: currentUserId }).distinct('_id');

    const count = await InternalMessage.countDocuments({
      conversationId: { $in: myConversationIds },
      sender: { $ne: currentUserId },
      'readBy.user': { $ne: currentUserId },
    });

    res.json({ count });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SUPERADMIN ROUTES
// ============================================

// 11. SUPERADMIN: Get All Conversations
router.get('/admin/all-conversations', requireAuth, requirePageAccess('ViewAllMessages'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
      const users = await User.find({ username: { $regex: search, $options: 'i' } }).select('_id');
      const userIds = users.map((u) => u._id);
      query = { participants: { $in: userIds } };
    }

    const conversations = await Conversation.find(query)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('participants', 'username role');

    const results = await Promise.all(
      conversations.map(async (conv) => {
        const messageCount = await InternalMessage.countDocuments({ conversationId: conv._id });
        return {
          conversationId: conv._id,
          type: conv.type,
          name: conv.name,
          participants: conv.participants,
          messageCount,
          lastMessageDate: conv.lastMessageAt,
        };
      })
    );

    res.json(results);
  } catch (err) {
    console.error('Admin get conversations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 12. SUPERADMIN: View Any Conversation
router.get('/admin/conversation/:conversationId', requireAuth, requirePageAccess('ViewAllMessages'), async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await InternalMessage.find({ conversationId })
      .populate('sender', 'username role')
      .populate('mentions', 'username role')
      .sort({ messageDate: 1 });

    res.json(messages);
  } catch (err) {
    console.error('Admin get conversation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 13. UPLOAD FILES (for attachments in messages)
router.post('/upload-files', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const urls = req.files.map((file) => `/uploads/${file.filename}`);

    res.json({ urls });
  } catch (err) {
    console.error('File upload error:', err);
    res.status(500).json({ error: 'Failed to upload files', details: err.message });
  }
});

export default router;
