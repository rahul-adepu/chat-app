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
    if (isAuthenticated && user) {
      const token = getAuthToken();
      if (!token) {
        console.error('No auth token available');
        return;
      }

      const newSocket = io('http://192.168.1.107:5050', {
        auth: {
          token: token
        },
        transports: ['websocket']
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
      });

      newSocket.on('disconnect', () => {
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
          newSocket.close();
        }
      };
    } else {
      // Clear socket when not authenticated
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [isAuthenticated, user]);

  const joinConversation = (conversationId) => {
    if (socket && (isConnected || socket.connected)) {
      socket.emit('join:conversation', conversationId);
    }
  };

  const leaveConversation = (conversationId) => {
    if (socket && (isConnected || socket.connected)) {
      socket.emit('leave:conversation', conversationId);
    }
  };

  const sendMessage = (conversationId, content, messageType = 'text', clientTempId) => {
    if (socket && (isConnected || socket.connected)) {
      socket.emit('message:send', { conversationId, content, messageType, clientTempId });
    }
  };

  const sendTypingIndicator = (conversationId, isTyping) => {
    if (socket && (isConnected || socket.connected)) {
      socket.emit('message:typing', { conversationId, isTyping });
    }
  };

  const markMessageAsRead = (conversationId, messageId) => {
    if (socket && isConnected) {
      socket.emit('message:read', { conversationId, messageId });
    }
  };

  const markConversationAsRead = (conversationId) => {
    if (socket && isConnected) {
      socket.emit('conversation:markAllRead', { conversationId });
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
