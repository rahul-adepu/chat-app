import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, SafeAreaView, StatusBar, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './utils/AuthContext.js';

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const { username, userId } = params;
  
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([
    { id: 1, text: 'Hey there! How are you?', sender: userId, timestamp: new Date(Date.now() - 60000), isRead: true },
    { id: 2, text: 'I\'m doing great! Thanks for asking.', sender: user?.id, timestamp: new Date(Date.now() - 30000), isRead: true },
    { id: 3, text: 'Would you like to grab coffee sometime?', sender: userId, timestamp: new Date(), isRead: false },
  ]);

  const sendMessage = () => {
    if (message.trim()) {
      const newMessage = {
        id: Date.now(),
        text: message.trim(),
        sender: user?.id,
        timestamp: new Date(),
        isRead: false
      };
      setMessages(prev => [newMessage, ...prev]);
      setMessage('');
    }
  };

  const renderMessage = ({ item }) => {
    const isOwnMessage = item.sender === user?.id;
    const messageTime = item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.messageContainer, isOwnMessage ? styles.ownMessage : styles.otherMessage]}>
        <View style={[styles.messageBubble, isOwnMessage ? styles.ownBubble : styles.otherBubble]}>
          <Text style={[styles.messageText, isOwnMessage ? styles.ownMessageText : styles.otherMessageText]}>
            {item.text}
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

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#3498db" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>{username}</Text>
          <Text style={styles.headerSubtitle}>Online</Text>
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
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id.toString()}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
        />
        
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type a message..."
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]} 
            onPress={sendMessage}
            disabled={!message.trim()}
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e1e8ed' },
  backButton: { padding: 8, marginRight: 8 },
  headerInfo: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#2c3e50' },
  headerSubtitle: { fontSize: 14, color: '#27ae60' },
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
