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
  const typingUsers = new Map();
  const pendingDeliveryUpdates = new Map(); // Track pending delivery status updates

  const markPendingMessagesAsDelivered = async (userId) => {
    try {
      const Message = (await import('./models/Message.js')).default;
      const Conversation = (await import('./models/Conversation.js')).default;
      
      const conversations = await Conversation.find({ participants: userId });
      
      for (const conversation of conversations) {
        const pendingMessages = await Message.find({
          conversationId: conversation._id,
          sender: { $ne: userId },
          status: 'sent'
        });
        
        if (pendingMessages.length > 0) {
          await Message.updateMany(
            { _id: { $in: pendingMessages.map(m => m._id) } },
            { 
              status: 'delivered',
              deliveredAt: new Date()
            }
          );
          
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
        }
      }
    } catch (error) {
      console.error('Error marking pending messages as delivered:', error);
    }
  };

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findById(decoded.id);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user._id.toString();
      socket.username = user.username;
      next();
    } catch (error) {
      console.error('Socket auth error:', error.message);
      next(new Error(`Authentication error: ${error.message}`));
    }
  });

  io.on('connection', async (socket) => {
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      username: socket.username,
      isOnline: true
    });

    await User.findByIdAndUpdate(socket.userId, { isOnline: true });
    socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: true });

    markPendingMessagesAsDelivered(socket.userId);

    socket.on('join:conversation', (conversationId) => {
      socket.join(conversationId);
    });

          socket.on('leave:conversation', (conversationId) => {
        socket.leave(conversationId);
        if (typingUsers.has(conversationId)) {
          typingUsers.get(conversationId).delete(socket.userId);
          if (typingUsers.get(conversationId).size === 0) {
            typingUsers.delete(conversationId);
          }
        }
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

      socket.to(conversationId).emit('user:typing', {
        userId: socket.userId,
        username: socket.username,
        isTyping,
        conversationId
      });

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
        
        const otherParticipant = conversation.participants.find(p => p.toString() !== socket.userId);
        const recipientSocketId = connectedUsers.get(otherParticipant.toString())?.socketId;
        const isRecipientOnline = !!recipientSocketId;
        
        if (isRecipientOnline) {
          const deliveryTimeoutId = setTimeout(async () => {
            try {
              // Check if message is already read before marking as delivered
              const currentMessage = await Message.findById(message._id);
              if (currentMessage && currentMessage.status !== 'read') {
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
              }
              
              // Remove from pending updates
              pendingDeliveryUpdates.delete(message._id);
            } catch (error) {
              console.error('Error updating message status to delivered:', error);
              pendingDeliveryUpdates.delete(message._id);
            }
          }, 1000);
          
          // Store the timeout ID for potential cancellation
          pendingDeliveryUpdates.set(message._id, deliveryTimeoutId);
        } else {
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
          // Cancel any pending delivery status update
          const pendingDeliveryId = pendingDeliveryUpdates.get(messageId);
          if (pendingDeliveryId) {
            clearTimeout(pendingDeliveryId);
            pendingDeliveryUpdates.delete(messageId);
          }
          
          message.isRead = true;
          message.readAt = new Date();
          message.status = 'read';
          if (!message.readBy.includes(socket.userId)) {
            message.readBy.push(socket.userId);
          }
          await message.save();



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

    socket.on('test:ping', (data) => {
      socket.emit('test:pong', { message: 'Hello from server', timestamp: Date.now() });
    });

    socket.on('conversation:markAllRead', async (data) => {
      const { conversationId } = data;
      
      try {
        const Message = (await import('./models/Message.js')).default;
        const Conversation = (await import('./models/Conversation.js')).default;
        
        const unreadMessages = await Message.find({
          conversationId, 
          sender: { $ne: socket.userId },
          isRead: false 
        });

        const result = await Message.updateMany(
          { 
            conversationId, 
            sender: { $ne: socket.userId },
            isRead: false 
          },
          { 
            $set: { 
              isRead: true, 
              readAt: new Date(),
              status: 'read'
            },
            $addToSet: { readBy: socket.userId }
          }
        );

        unreadMessages.forEach(message => {
          // Cancel any pending delivery status update
          const pendingDeliveryId = pendingDeliveryUpdates.get(message._id);
          if (pendingDeliveryId) {
            clearTimeout(pendingDeliveryId);
            pendingDeliveryUpdates.delete(message._id);
          }
          
          io.to(conversationId).emit('message:status', {
            messageId: message._id,
            status: 'read',
            readBy: socket.userId,
            readAt: new Date(),
            conversationId
          });
        });
        
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          conversation.unreadCount.set(socket.userId, 0);
          await conversation.save();
          
          conversation.participants.forEach(participantId => {
            const participantSocketId = connectedUsers.get(participantId.toString())?.socketId;
            if (participantSocketId) {
              const unreadCount = conversation.unreadCount.get(participantId.toString()) || 0;
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
      // Clear typing status for disconnected user
      for (const [conversationId, users] of typingUsers.entries()) {
        if (users.has(socket.userId)) {
          users.delete(socket.userId);
          if (users.size === 0) {
            typingUsers.delete(conversationId);
          } else {
            socket.to(conversationId).emit('user:typing', {
              userId: socket.userId,
              username: socket.username,
              isTyping: false,
              conversationId
            });
          }
        }
      }
      
      // Clear any pending delivery updates for this user's messages
      for (const [messageId, timeoutId] of pendingDeliveryUpdates.entries()) {
        clearTimeout(timeoutId);
        pendingDeliveryUpdates.delete(messageId);
      }
      
      connectedUsers.delete(socket.userId);
      await User.findByIdAndUpdate(socket.userId, { isOnline: false });
      
      socket.broadcast.emit('user:status', { userId: socket.userId, isOnline: false });
    });
  });

  return io;
};
