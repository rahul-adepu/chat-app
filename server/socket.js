import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from './models/User.js';

export const setupSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const connectedUsers = new Map();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      console.log('Socket auth attempt - Token:', token ? 'Present' : 'Missing');
      
      if (!token) {
        console.log('Socket auth failed: No token provided');
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Socket auth - Decoded token:', { id: decoded.id });
      
      const user = await User.findById(decoded.id);
      if (!user) {
        console.log('Socket auth failed: User not found');
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user._id.toString();
      socket.username = user.username;
      console.log('Socket auth successful for user:', user.username);
      next();
    } catch (error) {
      console.error('Socket auth error:', error.message);
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);
    
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      username: socket.username,
      isOnline: true
    });

    await User.findByIdAndUpdate(socket.userId, { isOnline: true });
    socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: true });

    socket.on('join:conversation', (conversationId) => {
      socket.join(conversationId);
      console.log(`User ${socket.username} joined conversation: ${conversationId}`);
    });

    socket.on('leave:conversation', (conversationId) => {
      socket.leave(conversationId);
      console.log(`User ${socket.username} left conversation: ${conversationId}`);
    });

    socket.on('message:typing', ({ conversationId, isTyping }) => {
      socket.to(conversationId).emit('user:typing', {
        userId: socket.userId,
        username: socket.username,
        isTyping
      });
    });

    socket.on('message:send', async (data) => {
      const { conversationId, content, messageType = 'text' } = data;
      
      try {
        const Message = (await import('./models/Message.js')).default;
        const Conversation = (await import('./models/Conversation.js')).default;
        
        const message = new Message({
          conversationId,
          sender: socket.userId,
          content,
          messageType,
          deliveredAt: new Date()
        });

        await message.save();

        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.lastMessage = message._id;
          conversation.lastMessageContent = content;
          conversation.lastMessageTime = new Date();
          
          const otherParticipant = conversation.participants.find(p => p.toString() !== socket.userId);
          const currentUnreadCount = conversation.unreadCount.get(otherParticipant) || 0;
          conversation.unreadCount.set(otherParticipant, currentUnreadCount + 1);
          
          await conversation.save();
        }

        const populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username');

        io.to(conversationId).emit('message:new', populatedMessage);
        
        socket.emit('message:sent', { messageId: message._id, status: 'delivered' });
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message:error', { error: 'Failed to send message' });
      }
    });

    socket.on('message:read', async (data) => {
      const { conversationId, messageId } = data;
      
      try {
        const Message = (await import('./models/Message.js')).default;
        const message = await Message.findById(messageId);
        
        if (message && message.sender.toString() !== socket.userId) {
          message.isRead = true;
          message.readAt = new Date();
          if (!message.readBy.includes(socket.userId)) {
            message.readBy.push(socket.userId);
          }
          await message.save();

          io.to(conversationId).emit('message:read', {
            messageId,
            readBy: socket.userId,
            readAt: message.readAt
          });
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.username} (${socket.userId})`);
      
      connectedUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { isOnline: false });
      
      socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: false });
    });
  });

  return io;
};
