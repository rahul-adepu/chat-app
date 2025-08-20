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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from './utils/AuthContext.js';
import { useSocket } from './utils/SocketContext.js';
import { conversationsAPI } from './services/api.js';

const { width: screenWidth } = Dimensions.get('window');

export default function ChatScreen() {
  const { username, userId } = useLocalSearchParams();
  const { user } = useAuth();
  const { socket, isConnected, joinConversation, leaveConversation, sendMessage, sendTypingIndicator, markMessageAsRead } = useSocket();
  const router = useRouter();
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [conversationId, setConversationId] = useState(null);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [otherUserTypingName, setOtherUserTypingName] = useState('');
  
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

      return () => {
        socket.off('message:new');
        socket.off('message:status');
        socket.off('user:typing');
        socket.off('message:sent');
      };
    }
  }, [socket]);

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
      
      setMessages(sortedMessages);
      
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

  const handleNewMessage = (message) => {
    // Check if this message is already in our pending messages
    if (pendingMessages.current.has(message._id)) {
      // Update the pending message with the real message data
      setMessages(prev => prev.map(msg => 
        msg._id === pendingMessages.current.get(message._id) ? message : msg
      ));
      pendingMessages.current.delete(message._id);
    } else {
      // Add new message to the end (since we're not using inverted FlatList)
      setMessages(prev => [...prev, message]);
    }
    
    // Mark message as read if it's from the other user
    if (message.sender._id !== user.id && conversationId) {
      markMessageAsRead(conversationId, message._id);
    }
  };

  const handleMessageStatus = ({ messageId, status, isSenderOnline }) => {
    setMessages(prev => prev.map(msg => 
      msg._id === messageId ? { ...msg, status, isSenderOnline } : msg
    ));
  };

  const handleMessageSent = ({ messageId, status }) => {
    setMessages(prev => prev.map(msg => 
      msg._id === messageId ? { ...msg, status } : msg
    ));
  };

  const handleUserTyping = ({ userId: typingUserId, username: typingUsername, isTyping, conversationId: typingConversationId }) => {
    if (typingConversationId === conversationId && typingUserId !== user.id) {
      setOtherUserTyping(isTyping);
      setOtherUserTypingName(isTyping ? typingUsername : '');
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
    
    const tempId = Date.now().toString();
    const messageData = {
      _id: tempId,
      content: newMessage.trim(),
      sender: { _id: user.id, username: user.username },
      createdAt: new Date(),
      status: 'sending'
    };
    
    // Add to pending messages map
    pendingMessages.current.set(tempId, tempId);
    
    // Add message to UI immediately
    setMessages(prev => [...prev, messageData]);
    setNewMessage('');
    
    // Stop typing indicator
    sendTypingIndicator(conversationId, false);
    
    // Send message via socket
    sendMessage(conversationId, newMessage.trim());
  };

  const getMessageStatusIcon = (status, isOwnMessage, isSenderOnline) => {
    if (!isOwnMessage) return null;
    
    switch (status) {
      case 'sending':
        return <ActivityIndicator size={12} color="#8E8E93" />;
      case 'sent':
        return <Ionicons name="checkmark" size={12} color="#8E8E93" />;
      case 'delivered':
        return <Ionicons name="checkmark" size={12} color="#8E8E93" />;
      case 'read':
        // Show different read receipts based on sender's online status
        if (isSenderOnline) {
          return (
            <View style={styles.doubleCheck}>
              <Ionicons name="checkmark" size={12} color="#007AFF" />
              <Ionicons name="checkmark" size={12} color="#007AFF" style={styles.secondCheck} />
            </View>
          );
        } else {
          return <Ionicons name="checkmark" size={12} color="#007AFF" />;
        }
      default:
        return null;
    }
  };

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
            {getMessageStatusIcon(item.status, isOwnMessage, item.isSenderOnline)}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading chat...</Text>
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
              { backgroundColor: isConnected ? '#4CAF50' : '#9E9E9E' }
            ]} />
            <Text style={styles.statusText}>
              {isConnected ? 'Connected' : 'Disconnected'}
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
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
    backgroundColor: '#F2F2F7'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA'
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
    marginVertical: 5,
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
    backgroundColor: '#007AFF',
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
    paddingVertical: 15
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
    paddingVertical: 10,
    maxHeight: 100,
    marginRight: 10,
    fontSize: 16,
    minHeight: 40
  },
  sendButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  sendButtonDisabled: {
    backgroundColor: '#E5E5EA'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#8E8E93'
  }
});

