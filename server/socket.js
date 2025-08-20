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

  // Function to mark pending messages as delivered when user comes online
  const markPendingMessagesAsDelivered = async (userId) => {
    try {
      const Message = (await import('./models/Message.js')).default;
      const Conversation = (await import('./models/Conversation.js')).default;
      
      // Find all conversations where this user is a participant
      const conversations = await Conversation.find({ participants: userId });
      
      for (const conversation of conversations) {
        // Find all sent messages that haven't been delivered to this user
        const pendingMessages = await Message.find({
          conversationId: conversation._id,
          sender: { $ne: userId },
          status: 'sent'
        });
        
        if (pendingMessages.length > 0) {
          // Mark all pending messages as delivered
          await Message.updateMany(
            { _id: { $in: pendingMessages.map(m => m._id) } },
            { 
              status: 'delivered',
              deliveredAt: new Date()
            }
          );
          
          // Emit delivered status for each message
          pendingMessages.forEach(message => {
            const senderSocketId = connectedUsers.get(message.sender.toString())?.socketId;
            if (senderSocketId) {
              io.to(senderSocketId).emit('message:status', {
                messageId: message._id,
                status: 'delivered',
                conversationId: conversation._id
              });
            }
          });
          
          console.log(`Marked ${pendingMessages.length} messages as delivered for user ${userId}`);
        }
      }
    } catch (error) {
      console.error('Error marking pending messages as delivered:', error);
    }
  };

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
    console.log(`Emitting user:status online for user ${socket.userId}`);
    socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: true });

    // Mark pending messages as delivered when user comes online
    markPendingMessagesAsDelivered(socket.userId);

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
      const { conversationId, content, messageType = 'text', clientTempId } = data;
      
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
          isSenderOnline: true
        });

        await message.save();

        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.lastMessage = message._id;
          conversation.lastMessageContent = content;
          conversation.lastMessageTime = new Date();
          
          const otherParticipant = conversation.participants.find(p => p.toString() !== socket.userId);
          const otherKey = otherParticipant.toString();
          const currentUnreadCount = conversation.unreadCount.get(otherKey) || 0;
          conversation.unreadCount.set(otherKey, currentUnreadCount + 1);
          
          await conversation.save();

          // Emit unread badge update to receiver
          const receiverSocketId = connectedUsers.get(otherKey)?.socketId;
          if (receiverSocketId) {
            io.to(receiverSocketId).emit('conversation:unreadUpdate', {
              conversationId,
              unreadCount: conversation.unreadCount.get(otherKey) || 0,
              senderId: socket.userId,
              senderUsername: socket.username
            });
          }
        }

        let populatedMessage = await Message.findById(message._id)
          .populate('sender', 'username')
          .lean();
        populatedMessage.clientTempId = clientTempId || null;

        io.to(conversationId).emit('message:new', populatedMessage);
        socket.emit('message:sent', { messageId: message._id, status: 'sent', conversationId, clientTempId });
        
        // Check if recipient is online to determine delivery status
        const otherParticipant = conversation.participants.find(p => p.toString() !== socket.userId);
        const recipientSocketId = connectedUsers.get(otherParticipant.toString())?.socketId;
        const isRecipientOnline = !!recipientSocketId;
        
        if (isRecipientOnline) {
          // Recipient is online, mark as delivered immediately
          setTimeout(async () => {
            try {
              await Message.findByIdAndUpdate(message._id, { 
                status: 'delivered',
                deliveredAt: new Date()
              });
              
              // Emit delivered status to sender
              socket.emit('message:status', { 
                messageId: message._id, 
                status: 'delivered',
                conversationId,
                clientTempId
              });
              
              console.log('Message delivered to online recipient:', {
                messageId: message._id,
                status: 'delivered',
                conversationId
              });
            } catch (error) {
              console.error('Error updating message status to delivered:', error);
            }
          }, 100);
        } else {
          // Recipient is offline, keep status as 'sent'
          console.log('Message sent but recipient is offline:', {
            messageId: message._id,
            status: 'sent',
            conversationId
          });
        }

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

          console.log('Message marked as read:', {
            messageId,
            status: 'read',
            readBy: socket.userId,
            conversationId
          });

          // Emit read status to all participants in the conversation
          io.to(conversationId).emit('message:status', {
            messageId,
            status: 'read',
            readBy: socket.userId,
            readAt: message.readAt,
            conversationId
          });

          const Conversation = (await import('./models/Conversation.js')).default;
          const conversation = await Conversation.findById(conversationId);
          if (conversation) {
            const currentUnreadCount = conversation.unreadCount.get(socket.userId) || 0;
            if (currentUnreadCount > 0) {
              conversation.unreadCount.set(socket.userId, currentUnreadCount - 1);
              await conversation.save();
              
              // Emit unread count updates to all participants
              conversation.participants.forEach(participantId => {
                const participantSocketId = connectedUsers.get(participantId.toString())?.socketId;
                if (participantSocketId) {
                  io.to(participantSocketId).emit('conversation:unreadUpdate', {
                    conversationId,
                    unreadCount: conversation.unreadCount.get(participantId.toString()) || 0,
                    updatedBy: socket.userId
                  });
                }
              });
            }
          }
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // Typing aliases per spec
    socket.on('typing:start', ({ conversationId }) => {
      socket.to(conversationId).emit('user:typing', { userId: socket.userId, username: socket.username, isTyping: true, conversationId });
    });
    socket.on('typing:stop', ({ conversationId }) => {
      socket.to(conversationId).emit('user:typing', { userId: socket.userId, username: socket.username, isTyping: false, conversationId });
    });

    // Test event handler
    socket.on('test:ping', (data) => {
      console.log('Test ping received from client:', data);
      socket.emit('test:pong', { message: 'Hello from server', timestamp: Date.now() });
    });

    // Handle bulk message read (when opening chat)
    socket.on('conversation:markAllRead', async (data) => {
      const { conversationId } = data;
      
      try {
        const Message = (await import('./models/Message.js')).default;
        const Conversation = (await import('./models/Conversation.js')).default;
        
        // Mark all unread messages in this conversation as read for the current user
        const result = await Message.updateMany(
          { 
            conversationId, 
            sender: { $ne: socket.userId },
            isRead: false 
          },
          { 
            $set: { 
              isRead: true, 
              readAt: new Date() 
            },
            $addToSet: { readBy: socket.userId }
          }
        );

        console.log(`Marking all messages as read for conversation ${conversationId}, user ${socket.userId}, modified: ${result.modifiedCount}`);
        
        // Always update conversation unread count and emit update, regardless of whether messages were modified
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.unreadCount.set(socket.userId, 0);
          await conversation.save();
          
          console.log(`Updated unread count for user ${socket.userId} to 0 in conversation ${conversationId}`);
          
          // Emit unread count update to all participants
          conversation.participants.forEach(participantId => {
            const participantSocketId = connectedUsers.get(participantId.toString())?.socketId;
            if (participantSocketId) {
              const unreadCount = conversation.unreadCount.get(participantId.toString()) || 0;
              console.log(`Emitting unread update to participant ${participantId}: ${unreadCount}`);
              io.to(participantSocketId).emit('conversation:unreadUpdate', {
                conversationId,
                unreadCount,
                updatedBy: socket.userId,
                action: 'markAllRead'
              });
            }
          });
        }
      } catch (error) {
        console.error('Error marking all messages as read:', error);
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
      
      console.log(`Emitting user:status offline for user ${socket.userId}`);
      socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: false });
    });
  });

  return io;
};
