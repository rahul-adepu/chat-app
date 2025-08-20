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
  const [otherUserTypingName, setOtherUserTypingName] = useState('');
  const [otherUserOnline, setOtherUserOnline] = useState(isOnline === 'true');
  
  const flatListRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const pendingMessages = useRef(new Map()); // Track pending messages to prevent duplicates

  useEffect(() => {
    if (conversationId) {
      joinConversation(conversationId);
      return () => leaveConversation(conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    if (socket) {
      socket.on('message:new', handleNewMessage);
      socket.on('message:status', handleMessageStatus);
      socket.on('user:typing', handleUserTyping);
      socket.on('message:sent', handleMessageSent);
      socket.on('user:status', handleUserStatus);

      return () => {
        socket.off('message:new');
        socket.off('message:status');
        socket.off('user:typing');
        socket.off('message:sent');
        socket.off('user:status');
      };
    }
  }, [socket]);

  // Mark all messages as read when socket is connected and conversation is ready
  useEffect(() => {
    if (socket && isConnected && conversationId) {
      console.log('Marking conversation as read:', conversationId);
      markConversationAsRead(conversationId);
      
      // Also mark individual messages as read through API as backup
      markAllMessagesAsReadAPI(conversationId);
    }
  }, [socket, isConnected, conversationId]);

  // Also mark as read when the screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      if (conversationId && socket && isConnected) {
        console.log('Chat screen focused, marking conversation as read:', conversationId);
        // Add a small delay to ensure the socket is ready
        setTimeout(() => {
          markConversationAsRead(conversationId);
        }, 100);
      }
    }, [conversationId, socket, isConnected])
  );

  // Mark as read immediately when component mounts
  useEffect(() => {
    if (conversationId && socket && isConnected) {
      console.log('Chat component mounted, marking conversation as read:', conversationId);
      markConversationAsRead(conversationId);
    }
  }, [conversationId, socket, isConnected]);

  // Mark as read when component unmounts (user navigates back)
  useEffect(() => {
    return () => {
      if (conversationId && socket && isConnected) {
        console.log('Chat component unmounting, marking conversation as read:', conversationId);
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
      
      // Create or get existing conversation
      const conversation = await conversationsAPI.createConversation([user.id, userId]);
      setConversationId(conversation._id);
      
      // Fetch existing messages
      const existingMessages = await conversationsAPI.getConversationMessages(conversation._id);
      
      // Sort messages by creation time (oldest first for proper display)
      const sortedMessages = existingMessages.sort((a, b) => 
        new Date(a.createdAt) - new Date(b.createdAt)
      );
      
      // Set isSenderOnline for existing messages based on current user's online status
      const messagesWithOnlineStatus = sortedMessages.map(msg => ({
        ...msg,
        isSenderOnline: msg.sender._id === user.id ? true : false // Set based on current user's online status
      }));
      
      setMessages(messagesWithOnlineStatus);
      
      
      // Mark messages as read
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

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [messages]);

  const handleNewMessage = (message) => {
    const { _id, clientTempId } = message;
    
    if (clientTempId && pendingMessages.current.has(clientTempId)) {
      // Replace temp message with real message
      setMessages(prev => prev.map(msg => (msg._id === clientTempId ? message : msg)));
      pendingMessages.current.delete(clientTempId);
      return;
    }
    
    // If message id itself is tracked as pending (fallback)
    if (pendingMessages.current.has(_id)) {
      setMessages(prev => prev.map(msg => (msg._id === _id ? message : msg)));
      pendingMessages.current.delete(_id);
      return;
    }

    setMessages(prev => [...prev, message]);

    if (message.sender._id !== user.id && conversationId) {
      markMessageAsRead(conversationId, message._id);
    }
  };


  const handleMessageSent = ({ messageId, status, conversationId: sentConvId }) => {
    setMessages(prev => prev.map(msg => 
      msg._id === messageId ? { ...msg, status } : msg
    ));
    // Clear pending map if server echoed back the same ID (when server uses DB ID)
    if (pendingMessages.current.has(messageId)) {
      pendingMessages.current.delete(messageId);
    }
  };

  const handleUserTyping = ({ userId: typingUserId, username: typingUsername, isTyping, conversationId: typingConversationId }) => {
    if (typingConversationId === conversationId && typingUserId !== user.id) {
      setOtherUserTyping(isTyping);
      setOtherUserTypingName(isTyping ? typingUsername : '');
    }
  };

  const handleUserStatus = ({ userId: statusUserId, isOnline }) => {
    if (statusUserId === userId) {
      setOtherUserOnline(isOnline);
    }
  };

  const handleTyping = (text) => {
    setNewMessage(text);
    
    if (conversationId) {
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Send typing indicator
      sendTypingIndicator(conversationId, true);
      
      // Set timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        sendTypingIndicator(conversationId, false);
      }, 1000);
    }
  };

  const sendMessageHandler = () => {
    if (!newMessage.trim() || !conversationId || !isConnected) return;
    
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
    sendTypingIndicator(conversationId, false);
    
    // Send with clientTempId so server can echo back
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
  
  
  const handleMessageStatus = ({ messageId, status, conversationId: statusConvId, readBy, readAt }) => {
    console.log('Message status update received:', { messageId, status, conversationId: statusConvId, readBy, readAt });
    
    setMessages(prev =>
      prev.map(msg =>
        msg._id === messageId ? { 
          ...msg, 
          status,
          readBy: readBy ? [...(msg.readBy || []), readBy] : msg.readBy,
          readAt: readAt || msg.readAt
        } : msg
      )
    );
  };
  

  useEffect(() => {
    if (socket) {
      const onUnreadUpdate = ({ conversationId: convId, unreadCount, action }) => {
        console.log('Unread update for conversation', convId, unreadCount, action);
        // This will be handled by the home screen when we return to it
      };
      socket.on('conversation:unreadUpdate', onUnreadUpdate);
      return () => socket.off('conversation:unreadUpdate', onUnreadUpdate);
    }
  }, [socket]);
  

  const renderMessage = ({ item }) => {
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
  };

  const markAllMessagesAsReadAPI = async (conversationId) => {
    try {
      // Get all unread messages and mark them as read
      const unreadMessages = messages.filter(msg => 
        !msg.isRead && msg.sender._id !== user.id
      );
      
      for (const message of unreadMessages) {
        await conversationsAPI.markMessageAsRead(conversationId, message._id);
      }
      
      console.log(`Marked ${unreadMessages.length} messages as read via API`);
    } catch (error) {
      console.error('Error marking all messages as read via API:', error);
    }
  };

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
              { backgroundColor: otherUserOnline ? '#4CAF50' : '#9E9E9E' }
            ]} />
            <Text style={styles.statusText}>
              {otherUserOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
      </View>

      {otherUserTyping && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>
            {otherUserTypingName} is typing...
          </Text>
          <View style={styles.typingDots}>
            <View style={[styles.dot, styles.dot1]} />
            <View style={[styles.dot, styles.dot2]} />
            <View style={[styles.dot, styles.dot3]} />
          </View>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        initialNumToRender={20}
        maxToRenderPerBatch={10}
        windowSize={10}
        removeClippedSubviews={false}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 120 : 0}
        enabled={Platform.OS === 'ios'}
      >
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingTop: Platform.OS === 'android' ? 25 : 0 // Add top padding for Android notification bar
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    marginTop: Platform.OS === 'android' ? 10 : 0 // Additional margin for Android
  },
  backButton: {
    marginRight: 15,
    padding: 5
  },
  headerInfo: {
    flex: 1
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5
  },
  statusText: {
    fontSize: 12,
    color: '#8E8E93'
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA'
  },
  typingText: {
    fontSize: 14,
    color: '#8E8E93',
    marginRight: 10
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#8E8E93',
    marginHorizontal: 1
  },
  dot1: {
    opacity: 0.4
  },
  dot2: {
    opacity: 0.7
  },
  dot3: {
    opacity: 1
  },
  messagesList: {
    paddingVertical: 10,
    flexGrow: 1
  },
  messageContainer: {
    marginVertical: 8,
    paddingHorizontal: 20
  },
  ownMessage: {
    alignItems: 'flex-end'
  },
  otherMessage: {
    alignItems: 'flex-start'
  },
  messageBubble: {
    maxWidth: screenWidth * 0.75,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20
  },
  ownBubble: {
    backgroundColor: '#34C759',
    borderBottomRightRadius: 5
  },
  otherBubble: {
    backgroundColor: '#E5E5EA',
    borderBottomLeftRadius: 5
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 5
  },
  ownMessageText: {
    color: '#FFFFFF'
  },
  otherMessageText: {
    color: '#000000'
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end'
  },
  messageTime: {
    fontSize: 11,
    color: '#8E8E93',
    marginRight: 5
  },
  doubleCheck: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  secondCheck: {
    marginLeft: -8
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingBottom: Platform.OS === 'ios' ? 15 : 20 // Extra padding for iOS
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 100,
    marginRight: 10,
    fontSize: 16,
    minHeight: 44
  },
  sendButton: {
    backgroundColor: '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    backgroundColor: '#E5E5EA'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 25 : 0
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#8E8E93'
  }
});

