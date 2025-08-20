import express from 'express';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    console.log('Fetching users for user ID:', req.user.id);
    
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('-password')
      .lean();

    console.log('Found users:', users.length);

    const conversations = await Conversation.find({
      participants: req.user.id
    }).populate('lastMessage', 'content createdAt');

    console.log('Found conversations:', conversations.length);

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

    console.log('Users with conversations processed successfully');
    res.json(usersWithConversations);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

export default router;
