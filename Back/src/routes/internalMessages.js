import { Router } from 'express';
import { requireAuth, requirePageAccess } from '../middleware/auth.js';
import { validate } from '../utils/validate.js';
import { sendMessageSchema } from '../schemas/index.js';
import InternalMessage from '../models/InternalMessage.js';
import User from '../models/User.js';

const router = Router();

// Helper function to generate conversation ID
function generateConversationId(username1, username2) {
  return [username1, username2].sort().join('_');
}

// 1. SEARCH USERS (for starting new conversations)
router.get('/search-users', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const currentUserId = req.user.userId;
    
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    // Find users matching search query, exclude current user
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

// 2. GET CONVERSATIONS LIST (Sidebar)
router.get('/conversations', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    const currentUser = await User.findById(currentUserId).select('username');

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Aggregate conversations with last message and unread count
    const conversations = await InternalMessage.aggregate([
      {
        $match: {
          $or: [
            { sender: currentUser._id },
            { recipient: currentUser._id }
          ]
        }
      },
      {
        $sort: { messageDate: -1 }
      },
      {
        $group: {
          _id: '$conversationId',
          lastMessage: { $first: '$body' },
          lastMessageDate: { $first: '$messageDate' },
          lastSender: { $first: '$sender' },
          lastRecipient: { $first: '$recipient' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$recipient', currentUser._id] },
                    { $eq: ['$read', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { lastMessageDate: -1 }
      }
    ]);

    // Populate other user details
    const populatedConversations = await Promise.all(
      conversations.map(async (conv) => {
        // Determine who the "other user" is
        const otherUserId = conv.lastSender.toString() === currentUserId 
          ? conv.lastRecipient 
          : conv.lastSender;
        
        const otherUser = await User.findById(otherUserId).select('username role email');

        return {
          conversationId: conv._id,
          otherUser: otherUser || { username: 'Unknown', role: 'unknown' },
          lastMessage: conv.lastMessage,
          lastMessageDate: conv.lastMessageDate,
          unreadCount: conv.unreadCount
        };
      })
    );

    res.json(populatedConversations);
  } catch (err) {
    console.error('Get conversations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. GET MESSAGES IN CONVERSATION
router.get('/messages/:conversationId', requireAuth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const currentUserId = req.user.userId;
    const currentUser = await User.findById(currentUserId).select('username');

    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Security: Verify user is part of conversation (unless superadmin)
    if (req.user.role !== 'superadmin') {
      const [user1, user2] = conversationId.split('_');
      if (user1 !== currentUser.username && user2 !== currentUser.username) {
        return res.status(403).json({ error: 'Forbidden: Not your conversation' });
      }
    }

    // Get messages
    const messages = await InternalMessage.find({ conversationId })
      .populate('sender', 'username role')
      .populate('recipient', 'username role')
      .sort({ messageDate: 1 });

    // Mark messages as read for current user (only their received messages)
    await InternalMessage.updateMany(
      {
        conversationId,
        recipient: currentUser._id,
        read: false
      },
      { $set: { read: true } }
    );

    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 4. SEND MESSAGE
router.post('/send', requireAuth, validate(sendMessageSchema), async (req, res) => {
  try {
    const { recipientId, body, mediaUrls } = req.body;
    const currentUserId = req.user.userId;

    if (!recipientId || !body) {
      return res.status(400).json({ error: 'recipientId and body required' });
    }

    // Get both users
    const [sender, recipient] = await Promise.all([
      User.findById(currentUserId).select('username'),
      User.findById(recipientId).select('username')
    ]);

    if (!sender || !recipient) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate conversation ID
    const conversationId = generateConversationId(sender.username, recipient.username);

    // Create message
    const newMessage = await InternalMessage.create({
      conversationId,
      sender: sender._id,
      recipient: recipient._id,
      body,
      mediaUrls: mediaUrls || [],
      read: false,
      messageDate: new Date()
    });

    // Populate for response
    await newMessage.populate('sender', 'username role');
    await newMessage.populate('recipient', 'username role');

    res.json(newMessage);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. GET UNREAD COUNT (for badge)
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.userId;

    const count = await InternalMessage.countDocuments({
      recipient: currentUserId,
      read: false
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

// 6. SUPERADMIN: Get All Conversations
router.get('/admin/all-conversations', requireAuth, requirePageAccess('ViewAllMessages'), async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (page - 1) * limit;

    let matchStage = {};
    if (search) {
      // Find users matching search
      const users = await User.find({
        username: { $regex: search, $options: 'i' }
      }).select('_id');
      
      const userIds = users.map(u => u._id);
      
      matchStage = {
        $or: [
          { sender: { $in: userIds } },
          { recipient: { $in: userIds } }
        ]
      };
    }

    const conversations = await InternalMessage.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$conversationId',
          messageCount: { $sum: 1 },
          lastMessageDate: { $max: '$messageDate' },
          user1: { $first: '$sender' },
          user2: { $first: '$recipient' }
        }
      },
      { $sort: { lastMessageDate: -1 } },
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    // Populate user details
    const populatedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const [user1, user2] = await Promise.all([
          User.findById(conv.user1).select('username role'),
          User.findById(conv.user2).select('username role')
        ]);

        return {
          conversationId: conv._id,
          user1: user1 || { username: 'Unknown', role: 'unknown' },
          user2: user2 || { username: 'Unknown', role: 'unknown' },
          messageCount: conv.messageCount,
          lastMessageDate: conv.lastMessageDate
        };
      })
    );

    res.json(populatedConversations);
  } catch (err) {
    console.error('Admin get conversations error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. SUPERADMIN: View Any Conversation
router.get('/admin/conversation/:conversationId', requireAuth, requirePageAccess('ViewAllMessages'), async (req, res) => {
  try {
    const { conversationId } = req.params;

    const messages = await InternalMessage.find({ conversationId })
      .populate('sender', 'username role')
      .populate('recipient', 'username role')
      .sort({ messageDate: 1 });

    res.json(messages);
  } catch (err) {
    console.error('Admin get conversation error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
