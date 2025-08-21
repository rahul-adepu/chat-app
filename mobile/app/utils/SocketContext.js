import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext.js';
import { getAuthToken } from '../services/api.js';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Clean up existing socket when auth state changes
    if (socket) {
      socket.close();
      setSocket(null);
      setIsConnected(false);
    }

    if (isAuthenticated && user) {
      const token = getAuthToken();
      if (!token) {
        console.error('No auth token available');
        return;
      }

      console.log('Creating new socket connection for user:', user.username);
      
      const newSocket = io('http://192.168.1.104:5050', {
        auth: {
          token: token
        },
        transports: ['websocket'],
        forceNew: true // Force new connection
      });

      newSocket.on('connect', () => {
        console.log('Socket connected for user:', user.username);
        setIsConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected for user:', user.username);
        setIsConnected(false);
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error.message);
        setIsConnected(false);
      });

      newSocket.on('error', (error) => {
        console.error('Socket error:', error);
      });

      setSocket(newSocket);

      return () => {
        if (newSocket) {
          console.log('Cleaning up socket for user:', user.username);
          newSocket.close();
        }
      };
    } else {
      // Clear socket when not authenticated
      console.log('User not authenticated, clearing socket');
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [isAuthenticated, user?.id]); // Changed dependency to user.id for more precise updates

  const joinConversation = (conversationId) => {
    if (socket && (isConnected || socket.connected)) {
      console.log('Joining conversation:', conversationId);
      socket.emit('join:conversation', conversationId);
    } else {
      console.log('Cannot join conversation - socket not ready');
    }
  };

  const leaveConversation = (conversationId) => {
    if (socket && (isConnected || socket.connected)) {
      console.log('Leaving conversation:', conversationId);
      socket.emit('leave:conversation', conversationId);
    } else {
      console.log('Cannot leave conversation - socket not ready');
    }
  };

  const sendMessage = (conversationId, content, messageType = 'text', clientTempId) => {
    if (socket && (isConnected || socket.connected)) {
      console.log('Sending message to conversation:', conversationId);
      socket.emit('message:send', { conversationId, content, messageType, clientTempId });
    } else {
      console.log('Cannot send message - socket not ready');
    }
  };

  const sendTypingIndicator = (conversationId, isTyping) => {
    if (socket && (isConnected || socket.connected)) {
      console.log('Sending typing indicator:', isTyping, 'for conversation:', conversationId);
      socket.emit('message:typing', { conversationId, isTyping });
    } else {
      console.log('Cannot send typing indicator - socket not ready');
    }
  };

  const markMessageAsRead = (conversationId, messageId) => {
    if (socket && isConnected) {
      console.log('Marking message as read:', messageId);
      socket.emit('message:read', { conversationId, messageId });
    } else {
      console.log('Cannot mark message as read - socket not ready');
    }
  };

  const markConversationAsRead = (conversationId) => {
    if (socket && isConnected) {
      console.log('Marking conversation as read:', conversationId);
      socket.emit('conversation:markAllRead', { conversationId });
    } else {
      console.log('Cannot mark conversation as read - socket not ready');
    }
  };

  const value = {
    socket,
    isConnected,
    joinConversation,
    leaveConversation,
    sendMessage,
    sendTypingIndicator,
    markMessageAsRead,
    markConversationAsRead
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
