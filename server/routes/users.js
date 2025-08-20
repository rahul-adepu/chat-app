import express from 'express';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('-password')
      .lean();

    const conversations = await Conversation.find({
      participants: req.user.id
    }).populate('lastMessage', 'content createdAt');

    const usersWithConversations = users.map(user => {
      const conversation = conversations.find(conv => 
        conv.participants.includes(user._id.toString())
      );

      return {
        ...user,
        hasConversation: !!conversation,
        lastMessage: conversation?.lastMessage || null,
        lastMessageTime: conversation?.lastMessageTime || null,
        unreadCount: conversation?.unreadCount?.get(req.user.id) || 0
      };
    });

    res.json(usersWithConversations);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users' });
  }
});

export default router;
