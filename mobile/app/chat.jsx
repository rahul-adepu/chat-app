import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuth } from './utils/AuthContext.js';
import { useSocket } from './utils/SocketContext.js';
import { conversationsAPI } from './services/api.js';

const { width: screenWidth } = Dimensions.get('window');

export default function ChatScreen() {
  const { username, userId, isOnline } = useLocalSearchParams();
  const { user } = useAuth();
  const { socket, isConnected, joinConversation, leaveConversation, sendMessage, sendTypingIndicator, markMessageAsRead, markConversationAsRead } = useSocket();
  const router = useRouter();
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false); // Track if current user is typing
  
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const pendingMessages = useRef(new Map());
  const typingRefreshIntervalRef = useRef(null); // For continuous typing refresh

  useEffect(() => {
    if (conversationId) {
      joinConversation(conversationId);
      return () => {
        leaveConversation(conversationId);
        // Clear typing indicator when leaving conversation
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        if (typingRefreshIntervalRef.current) {
          clearInterval(typingRefreshIntervalRef.current);
          typingRefreshIntervalRef.current = null;
        }
        setIsUserTyping(false);
        sendTypingIndicator(conversationId, false);
      };
    }
  }, [conversationId]);

  // Cleanup typing indicator when component unmounts
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (typingRefreshIntervalRef.current) {
        clearInterval(typingRefreshIntervalRef.current);
        typingRefreshIntervalRef.current = null;
      }
      if (conversationId) {
        setIsUserTyping(false);
        sendTypingIndicator(conversationId, false);
      }
    };
  }, [conversationId]);

  useEffect(() => {
    if (socket && conversationId) {
      console.log('Setting up socket event listeners for chat screen');
      
      socket.on('message:new', handleNewMessage);
      socket.on('message:status', handleMessageStatus);
      socket.on('user:typing', handleUserTyping);
      socket.on('message:sent', handleMessageSent);
      socket.on('user:status', handleUserStatus);
      
      // Handle socket reconnection
      socket.on('connect', () => {
        console.log('Socket reconnected in chat, rejoining conversation');
        if (conversationId) {
          joinConversation(conversationId);
          markConversationAsRead(conversationId);
        }
      });

      return () => {
        console.log('Cleaning up socket event listeners for chat screen');
        socket.off('message:new');
        socket.off('message:status');
        socket.off('user:typing');
        socket.off('message:sent');
        socket.off('user:status');
        socket.off('connect');
      };
    }
  }, [socket, conversationId]);

  // Handle socket connection status changes
  useEffect(() => {
    if (socket && isConnected && conversationId) {
      console.log('Socket connected in chat, marking conversation as read');
      markConversationAsRead(conversationId);
      markAllMessagesAsReadAPI(conversationId);
    }
  }, [socket, isConnected, conversationId]);

  // Handle socket reconnection specifically
  useEffect(() => {
    if (socket && isConnected && conversationId) {
      console.log('Socket reconnected, ensuring conversation is joined and marked as read');
      joinConversation(conversationId);
      markConversationAsRead(conversationId);
    }
  }, [isConnected, conversationId]);

  useFocusEffect(
    React.useCallback(() => {
      if (conversationId && socket && isConnected) {
        setTimeout(() => {
          markConversationAsRead(conversationId);
        }, 100);
      }
    }, [conversationId, socket, isConnected])
  );

  useEffect(() => {
    if (conversationId && socket && isConnected) {
      markConversationAsRead(conversationId);
    }
  }, [conversationId, socket, isConnected]);

  useEffect(() => {
    return () => {
      if (conversationId && socket && isConnected) {
        markConversationAsRead(conversationId);
      }
    };
  }, [conversationId, socket, isConnected]);

  useEffect(() => {
    initializeChat();
  }, []);

  const initializeChat = async () => {
    try {
      setLoading(true);
      
      const conversation = await conversationsAPI.createConversation([user.id, userId]);
      
      setConversationId(conversation._id);
      
      const existingMessages = await conversationsAPI.getConversationMessages(conversation._id);
      const sortedMessages = existingMessages.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      const messagesWithOnlineStatus = sortedMessages.map(msg => ({
        ...msg,
        isSenderOnline: msg.sender._id === user.id ? true : false
      }));
      setMessages(messagesWithOnlineStatus);

      const unreadMessages = sortedMessages.filter(msg => 
        !msg.isRead && msg.sender._id !== user.id
      );
      for (const message of unreadMessages) {
        await conversationsAPI.markMessageAsRead(conversation._id, message._id);
      }
    } catch (error) {
      console.error('Error initializing chat:', error);
      Alert.alert('Error', 'Unable to load chat. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [messages]);

  const handleNewMessage = (message) => {
    console.log('New message received:', { 
      messageId: message._id, 
      content: message.content, 
      sender: message.sender.username,
      status: message.status 
    });
    
    const { _id, clientTempId } = message;
    if (clientTempId && pendingMessages.current.has(clientTempId)) {
      console.log('Updating pending message with clientTempId:', clientTempId);
      setMessages(prev => prev.map(msg => (msg._id === clientTempId ? message : msg)));
      pendingMessages.current.delete(clientTempId);
      return;
    }
    if (pendingMessages.current.has(_id)) {
      console.log('Updating pending message with _id:', _id);
      setMessages(prev => prev.map(msg => (msg._id === _id ? message : msg)));
      pendingMessages.current.delete(_id);
      return;
    }
    
    console.log('Adding new message to conversation');
    setMessages(prev => [...prev, message]);
    
    if (message.sender._id !== user.id && conversationId) {
      console.log('Marking received message as read');
      markMessageAsRead(conversationId, message._id);
    }
  };

  const handleMessageSent = ({ messageId, status }) => {
    console.log('Message sent status received:', { messageId, status });
    
    setMessages(prev => {
      const updatedMessages = prev.map(msg => 
        msg._id === messageId ? { ...msg, status } : msg
      );
      
      // Log the updated message
      const updatedMessage = updatedMessages.find(msg => msg._id === messageId);
      if (updatedMessage) {
        console.log('Message sent status updated:', {
          messageId,
          oldStatus: prev.find(msg => msg._id === messageId)?.status,
          newStatus: updatedMessage.status,
          content: updatedMessage.content
        });
      }
      
      return updatedMessages;
    });
    
    if (pendingMessages.current.has(messageId)) {
      pendingMessages.current.delete(messageId);
    }
  };

  const handleUserTyping = ({ userId: typingUserId, isTyping, conversationId: typingConversationId }) => {
    if (typingConversationId === conversationId && typingUserId !== user.id) {
      setOtherUserTyping(isTyping);
    }
  };

  const handleUserStatus = ({ userId: statusUserId, isOnline }) => {
    // Handle user status updates if needed
  };

  const handleTyping = (text) => {
    setNewMessage(text);
  
    if (!conversationId) return;
  
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
  
    // If user is typing, always send typing indicator (not only on first char)
    if (text.length > 0) {
      if (!isUserTyping) {
        // Only set to true the first time
        setIsUserTyping(true);
        sendTypingIndicator(conversationId, true);
      } else {
        // Refresh typing indicator while still typing
        sendTypingIndicator(conversationId, true);
      }
  
      // Reset the timeout: if no input after 3s, mark as stopped
      typingTimeoutRef.current = setTimeout(() => {
        setIsUserTyping(false);
        sendTypingIndicator(conversationId, false);
      }, 3000);
    } else {
      // If text cleared, stop typing immediately
      setIsUserTyping(false);
      sendTypingIndicator(conversationId, false);
    }
  };
  

  const sendMessageHandler = () => {
    if (!newMessage.trim() || !conversationId || !isConnected) return;
    
    
    // Clear typing indicator immediately when sending message
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    // Clear typing refresh interval
    if (typingRefreshIntervalRef.current) {
      clearInterval(typingRefreshIntervalRef.current);
      typingRefreshIntervalRef.current = null;
    }
    
    // Clear typing state
    setIsUserTyping(false);
    
    sendTypingIndicator(conversationId, false);
    
    const clientTempId = `temp_${Date.now()}`;
    const messageData = {
      _id: clientTempId,
      content: newMessage.trim(),
      sender: { _id: user.id, username: user.username },
      createdAt: new Date(),
      status: 'sending',
      isSenderOnline: true,
      conversationId
    };
    pendingMessages.current.set(clientTempId, clientTempId);
    setMessages(prev => [...prev, messageData]);
    setNewMessage('');
    sendMessage(conversationId, newMessage.trim(), 'text', clientTempId);
  };

  const getMessageStatusIcon = (status, isOwnMessage) => {
    if (!isOwnMessage) return null;
    switch (status) {
      case 'sending':
        return <ActivityIndicator size={12} color="#8E8E93" />;
      case 'sent':
        return <Ionicons name="checkmark" size={14} color="#8E8E93" />;
      case 'delivered':
        return (
          <View style={styles.doubleCheck}>
            <Ionicons name="checkmark" size={14} color="#8E8E93" />
            <Ionicons name="checkmark" size={14} color="#8E8E93" style={styles.secondCheck} />
          </View>
        );
      case 'read':
        return (
          <View style={styles.doubleCheck}>
            <Ionicons name="checkmark" size={14} color="#007AFF" />
            <Ionicons name="checkmark" size={14} color="#007AFF" style={styles.secondCheck} />
          </View>
        );
      default:
        return null;
    }
  };

  const handleMessageStatus = ({ messageId, status, readBy, readAt }) => {
    console.log('Message status update received:', { messageId, status, readBy, readAt });
    
    setMessages(prev => {
      const updatedMessages = prev.map(msg =>
        msg._id === messageId ? { 
          ...msg, 
          status,
          readBy: readBy ? [...(msg.readBy || []), readBy] : msg.readBy,
          readAt: readAt || msg.readAt
        } : msg
      );
      
      // Log the updated message
      const updatedMessage = updatedMessages.find(msg => msg._id === messageId);
      if (updatedMessage) {
        console.log('Message status updated:', {
          messageId,
          oldStatus: prev.find(msg => msg._id === messageId)?.status,
          newStatus: updatedMessage.status,
          content: updatedMessage.content
        });
      }
      
      return updatedMessages;
    });
  };

  const markAllMessagesAsReadAPI = async (conversationId) => {
    try {
      const unreadMessages = messages.filter(msg => 
        !msg.isRead && msg.sender._id !== user.id
      );
      for (const message of unreadMessages) {
        await conversationsAPI.markMessageAsRead(conversationId, message._id);
      }
    } catch (error) {
      console.error('Error marking all messages as read via API:', error);
    }
  };

  // Monitor typing indicator state changes
  useEffect(() => {
  }, [isUserTyping, conversationId]);

  // Monitor conversation ID changes
  useEffect(() => {
  }, [conversationId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{username}</Text>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusDot,
                { backgroundColor: otherUserTyping ? '#FF9500' : (isOnline === 'true' ? '#4CAF50' : '#9E9E9E') }
              ]} />
              <Text style={styles.statusText}>
                {otherUserTyping ? 'typing...' : (isOnline === 'true' ? 'Online' : 'Offline')}
              </Text>
            </View>
          </View>
        </View>



        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={({ item }) => {
            const isOwnMessage = item.sender._id === user.id;
            return (
              <View style={[
                styles.messageContainer,
                isOwnMessage ? styles.ownMessage : styles.otherMessage
              ]}>
                <View style={[
                  styles.messageBubble,
                  isOwnMessage ? styles.ownBubble : styles.otherBubble
                ]}>
                  <Text style={[
                    styles.messageText,
                    isOwnMessage ? styles.ownMessageText : styles.otherMessageText
                  ]}>
                    {item.content}
                  </Text>
                  <View style={styles.messageFooter}>
                    <Text style={styles.messageTime}>
                      {new Date(item.createdAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                      })}
                    </Text>
                    {getMessageStatusIcon(item.status, isOwnMessage)}
                  </View>
                </View>
              </View>
            );
          }}
          keyExtractor={(item) => item._id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.textInput}
              value={newMessage}
              onChangeText={handleTyping}
              placeholder="Type a message..."
              multiline
              maxLength={1000}
              textAlignVertical="top"
              returnKeyType="default"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!newMessage.trim() || !isConnected) && styles.sendButtonDisabled
              ]}
              onPress={sendMessageHandler}
              disabled={!newMessage.trim() || !isConnected}
            >
              <Ionicons 
                name="send" 
                size={20} 
                color={(!newMessage.trim() || !isConnected) ? "#C7C7CC" : "#FFFFFF"} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7', paddingTop: Platform.OS === 'android' ? 25 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E5EA', marginTop: Platform.OS === 'android' ? 10 : 0 },
  backButton: { marginRight: 15, padding: 5 },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#000', marginBottom: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  statusText: { fontSize: 12, color: '#8E8E93' },

  messagesList: { paddingVertical: 10, flexGrow: 1 },
  messageContainer: { marginVertical: 8, paddingHorizontal: 20 },
  ownMessage: { alignItems: 'flex-end' },
  otherMessage: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: screenWidth * 0.75, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  ownBubble: { backgroundColor: '#34C759', borderBottomRightRadius: 5 },
  otherBubble: { backgroundColor: '#E5E5EA', borderBottomLeftRadius: 5 },
  messageText: { fontSize: 16, lineHeight: 20, marginBottom: 5 },
  ownMessageText: { color: '#FFFFFF' },
  otherMessageText: { color: '#000000' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  messageTime: { fontSize: 11, color: '#8E8E93', marginRight: 5 },
  doubleCheck: { flexDirection: 'row', alignItems: 'center' },
  secondCheck: { marginLeft: -8 },
  inputContainer: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E5EA', paddingHorizontal: 20, paddingVertical: 15 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  textInput: { flex: 1, borderWidth: 1, borderColor: '#E5E5EA', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, maxHeight: 100, marginRight: 10, fontSize: 16, minHeight: 44 },
  sendButton: { backgroundColor: '#007AFF', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#E5E5EA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: Platform.OS === 'android' ? 25 : 0 },
});
