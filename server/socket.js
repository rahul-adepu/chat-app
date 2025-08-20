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
  const typingUsers = new Map(); // Track typing status per conversation

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
      // Clear typing status when leaving conversation
      if (typingUsers.has(conversationId)) {
        typingUsers.get(conversationId).delete(socket.userId);
        if (typingUsers.get(conversationId).size === 0) {
          typingUsers.delete(conversationId);
        }
      }
      console.log(`User ${socket.username} left conversation: ${conversationId}`);
    });

    socket.on('message:typing', ({ conversationId, isTyping }) => {
      if (!typingUsers.has(conversationId)) {
        typingUsers.set(conversationId, new Map());
      }
      
      if (isTyping) {
        typingUsers.get(conversationId).set(socket.userId, {
          username: socket.username,
          timestamp: Date.now()
        });
      } else {
        typingUsers.get(conversationId).delete(socket.userId);
        if (typingUsers.get(conversationId).size === 0) {
          typingUsers.delete(conversationId);
        }
      }

      // Emit typing status to other users in the conversation
      socket.to(conversationId).emit('user:typing', {
        userId: socket.userId,
        username: socket.username,
        isTyping,
        conversationId
      });

      // Auto-clear typing status after 3 seconds of inactivity
      if (isTyping) {
        setTimeout(() => {
          if (typingUsers.has(conversationId) && 
              typingUsers.get(conversationId).has(socket.userId)) {
            typingUsers.get(conversationId).delete(socket.userId);
            if (typingUsers.get(conversationId).size === 0) {
              typingUsers.delete(conversationId);
            }
            socket.to(conversationId).emit('user:typing', {
              userId: socket.userId,
              username: socket.username,
              isTyping: false,
              conversationId
            });
          }
        }, 3000);
      }
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
          deliveredAt: new Date(),
          status: 'sent',
          isSenderOnline: true // Set to true since sender is currently online
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

        // Emit to all users in conversation (including sender for confirmation)
        io.to(conversationId).emit('message:new', populatedMessage);
        
        // Send delivery confirmation to sender
        socket.emit('message:sent', { messageId: message._id, status: 'sent' });
        
        // Mark as delivered after a short delay
        setTimeout(async () => {
          try {
            await Message.findByIdAndUpdate(message._id, { 
              status: 'delivered',
              deliveredAt: new Date()
            });
            
            // Check if sender is online
            const senderSocketId = connectedUsers.get(socket.userId)?.socketId;
            const isSenderOnline = !!senderSocketId;
            
            socket.emit('message:status', { 
              messageId: message._id, 
              status: 'delivered',
              isSenderOnline
            });
            
            // Emit to conversation for real-time status updates
            io.to(conversationId).emit('message:status', { 
              messageId: message._id, 
              status: 'delivered',
              isSenderOnline
            });
          } catch (error) {
            console.error('Error updating message status to delivered:', error);
          }
        }, 1000);

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
          message.status = 'read';
          if (!message.readBy.includes(socket.userId)) {
            message.readBy.push(socket.userId);
          }
          await message.save();

          // Check if sender is online to determine read receipt style
          const senderSocketId = connectedUsers.get(message.sender.toString())?.socketId;
          const isSenderOnline = !!senderSocketId;

          // Emit read status to all users in conversation
          io.to(conversationId).emit('message:status', {
            messageId,
            status: 'read',
            readBy: socket.userId,
            readAt: message.readAt,
            isSenderOnline
          });

          // Update conversation unread count
          const Conversation = (await import('./models/Conversation.js')).default;
          const conversation = await Conversation.findById(conversationId);
          if (conversation) {
            const currentUnreadCount = conversation.unreadCount.get(socket.userId) || 0;
            if (currentUnreadCount > 0) {
              conversation.unreadCount.set(socket.userId, currentUnreadCount - 1);
              await conversation.save();
            }
          }
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.username} (${socket.userId})`);
      
      // Clear typing status for disconnected user
      for (const [conversationId, users] of typingUsers.entries()) {
        if (users.has(socket.userId)) {
          users.delete(socket.userId);
          if (users.size === 0) {
            typingUsers.delete(conversationId);
          } else {
            // Notify other users that this user stopped typing
            socket.to(conversationId).emit('user:typing', {
              userId: socket.userId,
              username: socket.username,
              isTyping: false,
              conversationId
            });
          }
        }
      }
      
      connectedUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { isOnline: false });
      
      socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: false });
    });
  });

  return io;
};
