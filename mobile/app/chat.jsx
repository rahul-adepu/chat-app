import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, SafeAreaView, StatusBar, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './utils/AuthContext.js';
import { useSocket } from './utils/SocketContext.js';
import { conversationsAPI } from './services/api.js';

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { socket, isConnected, joinConversation, leaveConversation, sendMessage, sendTypingIndicator } = useSocket();
  const params = useLocalSearchParams();
  const { username, userId } = params;
  
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const typingTimeoutRef = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    initializeChat();
    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (socket && conversationId) {
      socket.on('message:new', handleNewMessage);
      socket.on('user:typing', handleUserTyping);
      socket.on('message:sent', handleMessageSent);
      socket.on('message:error', handleMessageError);

      return () => {
        socket.off('message:new');
        socket.off('user:typing');
        socket.off('message:sent');
        socket.off('message:error');
      };
    }
  }, [socket, conversationId]);

  const initializeChat = async () => {
    try {
      setLoading(true);
      const conversation = await conversationsAPI.createConversation(userId);
      setConversationId(conversation._id);
      joinConversation(conversation._id);
      
      const chatMessages = await conversationsAPI.getConversationMessages(conversation._id);
      setMessages(chatMessages.reverse());
    } catch (error) {
      Alert.alert('Error', 'Failed to initialize chat');
    } finally {
      setLoading(false);
    }
  };

  const handleNewMessage = (newMessage) => {
    setMessages(prev => [newMessage, ...prev]);
  };

  const handleUserTyping = (data) => {
    if (data.userId === userId) {
      setOtherUserTyping(data.isTyping);
    }
  };

  const handleMessageSent = (data) => {
    console.log('Message sent:', data);
  };

  const handleMessageError = (data) => {
    Alert.alert('Error', data.error);
  };

  const handleTyping = (text) => {
    setMessage(text);
    
    if (!isTyping) {
      setIsTyping(true);
      sendTypingIndicator(conversationId, true);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTypingIndicator(conversationId, false);
    }, 1000);
  };

  const sendMessageHandler = () => {
    if (message.trim() && conversationId) {
      sendMessage(conversationId, message.trim());
      setMessage('');
      setIsTyping(false);
      sendTypingIndicator(conversationId, false);
    }
  };

  const renderMessage = ({ item }) => {
    const isOwnMessage = item.sender._id === user?.id;
    const messageTime = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageContainer, isOwnMessage ? styles.ownMessage : styles.otherMessage]}>
        <View style={[styles.messageBubble, isOwnMessage ? styles.ownBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isOwnMessage ? styles.ownMessageText : styles.otherMessageText]}>
            {item.content}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={styles.messageTime}>{messageTime}</Text>
            {isOwnMessage && (
              <Ionicons 
                name={item.isRead ? "checkmark-done" : "checkmark"} 
                size={16} 
                color={item.isRead ? "#27ae60" : "#95a5a6"} 
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Initializing chat...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3498db" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{username}</Text>
          <View style={styles.headerStatus}>
            <Text style={styles.headerSubtitle}>
              {otherUserTyping ? 'typing...' : 'Online'}
            </Text>
            {!isConnected && <Text style={styles.connectionStatus}> (Offline)</Text>}
          </View>
        </View>
        <TouchableOpacity style={styles.moreButton}>
          <Ionicons name="ellipsis-vertical" size={24} color="#7f8c8d" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.chatContainer}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item._id}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
        />
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            value={message}
            onChangeText={handleTyping}
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendButton, (!message.trim() || !isConnected) && styles.sendButtonDisabled]} 
            onPress={sendMessageHandler}
            disabled={!message.trim() || !isConnected}
          >
            <Ionicons name="send" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, color: '#7f8c8d' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e1e8ed' },
  backButton: { padding: 8, marginRight: 8 },
  headerInfo: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#2c3e50' },
  headerStatus: { flexDirection: 'row', alignItems: 'center' },
  headerSubtitle: { fontSize: 14, color: '#27ae60' },
  connectionStatus: { fontSize: 12, color: '#e74c3c' },
  moreButton: { padding: 8 },
  chatContainer: { flex: 1 },
  messagesList: { paddingVertical: 16 },
  messageContainer: { marginHorizontal: 16, marginVertical: 4 },
  ownMessage: { alignItems: 'flex-end' },
  otherMessage: { alignItems: 'flex-start' },
  messageBubble: { maxWidth: '80%', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20 },
  ownBubble: { backgroundColor: '#3498db', borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: '#ffffff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e1e8ed' },
  messageText: { fontSize: 16, lineHeight: 20 },
  ownMessageText: { color: '#ffffff' },
  otherMessageText: { color: '#2c3e50' },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  messageTime: { fontSize: 12, color: '#95a5a6', marginRight: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e1e8ed' },
  textInput: { flex: 1, backgroundColor: '#f8f9fa', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 12, maxHeight: 100, fontSize: 16 },
  sendButton: { backgroundColor: '#3498db', width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#bdc3c7' },
});
