import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from './utils/AuthContext.js';
import { useSocket } from './utils/SocketContext.js';
import { usersAPI } from './services/api.js';

export default function HomeScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { user, logout, authState } = useAuth();
  const { socket, isConnected } = useSocket();
  const router = useRouter();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const usersData = await usersAPI.getAllUsers();
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      // Refresh users when screen comes into focus (e.g., returning from chat)
      if (isConnected) {
        fetchUsers();
      }
    }, [isConnected])
  );

  // Refresh users when authentication state changes (login/logout)
  useEffect(() => {
    if (authState === 'authenticated' && isConnected) {
      fetchUsers();
    } else if (authState === 'unauthenticated') {
      // Clear users when logging out
      setUsers([]);
      setLoading(false);
    }
  }, [authState, isConnected]);

  // Handle socket connection changes
  useEffect(() => {
    console.log('Socket connection status changed:', { isConnected, hasSocket: !!socket });
    if (isConnected && socket) {
      console.log('Socket is connected, setting up listeners');
      // The main socket effect will handle setting up listeners
    }
  }, [isConnected, socket]);

  // Handle app state changes (background/foreground)
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active' && isConnected) {
        // App came to foreground, refresh user status
        fetchUsers();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [isConnected]);

  useEffect(() => {
    if (socket && isConnected) {
      console.log('Setting up socket listeners in home screen');
      
      // Set up event listeners
      socket.on('user:status', handleUserStatus);
      socket.on('conversation:unreadUpdate', handleUnreadUpdate);
      
      // Add a test listener to verify socket is working
      socket.on('connect', () => {
        console.log('Socket connected in home screen');
      });

      // Test response listener
      socket.on('test:pong', (data) => {
        console.log('Test pong received from server:', data);
      });
      
      // Refresh users immediately when socket connects to get latest status
      fetchUsers();
      
      console.log('Socket listeners set up successfully');

      return () => {
        console.log('Cleaning up socket listeners in home screen');
        socket.off('user:status');
        socket.off('conversation:unreadUpdate');
        socket.off('connect');
        socket.off('test:pong');
      };
    }
  }, [socket, isConnected]);

  const handleUserStatus = ({ userId, isOnline }) => {
    console.log('User status update received in home screen:', { userId, isOnline });
    console.log('Current users before update:', users.map(u => ({ id: u._id, username: u.username, isOnline: u.isOnline })));
    
    setUsers(prev => {
      const updated = prev.map(user => 
        user._id === userId ? { ...user, isOnline } : user
      );
      console.log('Users after update:', updated.map(u => ({ id: u._id, username: u.username, isOnline: u.isOnline })));
      return updated;
    });
  };

  const handleMessageStatus = ({ messageId, status, readBy }) => {
    if (status === 'read' && readBy === user.id) {
      // Update unread count when message is read
      setUsers(prev => prev.map(userItem => {
        // Find the conversation and update unread count
        // This is a simplified approach - you might want to implement a more sophisticated solution
        return userItem;
      }));
    }
  };

  const handleUnreadUpdate = ({ conversationId, unreadCount }) => {
    
    setUsers(prev => prev.map(u => {
      // If this user has this conversationId, update their unread count
      if (u.conversationId === conversationId) {
        return { ...u, unreadCount };
      }
      return u;
    }));
  };

  const handleUserPress = (username, userId, isOnline) => {
    // Optimistically clear unread for the tapped user
    setUsers(prev => prev.map(u =>
      u._id === userId ? { ...u, unreadCount: 0 } : u
    ));

    router.push({
      pathname: '/chat',
      params: { username, userId, isOnline: isOnline.toString() }
    });
  };

  // Force refresh users list to get latest online status
  const forceRefreshUsers = () => {
    console.log('Manual refresh triggered');
    fetchUsers();
  };

  // Test socket connection and events
  const testSocketConnection = () => {
    if (socket && isConnected) {
      console.log('Testing socket connection...');
      console.log('Socket ID:', socket.id);
      console.log('Is connected:', socket.connected);
      
      // Try to emit a test event
      socket.emit('test:ping', { message: 'Hello from home screen' });
    } else {
      console.log('Socket not available or not connected');
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/');
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const truncateMessage = (message, maxLength = 30) => {
    if (!message) return '';
    return message.length > maxLength 
      ? message.substring(0, maxLength) + '...' 
      : message;
  };

  const renderUserItem = ({ item }) => (
    <TouchableOpacity
      style={styles.userItem}
      onPress={() => handleUserPress(item.username, item._id, item.isOnline)}
    >
      <View style={styles.userInfo}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {item.username.charAt(0).toUpperCase()}
          </Text>
        </View>
        
        <View style={styles.userDetails}>
          <View style={styles.nameRow}>
            <Text style={styles.username}>{item.username}</Text>
            <View style={styles.statusContainer}>
              <View style={[
                styles.statusDot,
                { backgroundColor: item.isOnline ? '#4CAF50' : '#9E9E9E' }
              ]} />
              <Text style={styles.statusText}>
                {item.isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
          </View>
          
          {item.hasConversation && item.lastMessage ? (
            <View style={styles.messagePreview}>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {truncateMessage(item.lastMessage.content)}
              </Text>
              <Text style={styles.messageTime}>
                {formatTime(item.lastMessageTime)}
              </Text>
            </View>
          ) : (
            <Text style={styles.noMessage}>No messages yet</Text>
          )}
        </View>
      </View>
      
      {item.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadCount}>
            {item.unreadCount > 99 ? '99+' : item.unreadCount}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={testSocketConnection} style={styles.testButton}>
            <Ionicons name="bug" size={24} color="#FF9500" />
          </TouchableOpacity>
          <TouchableOpacity onPress={forceRefreshUsers} style={styles.refreshButton}>
            <Ionicons name="refresh" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={users}
        renderItem={renderUserItem}
        keyExtractor={(item) => item._id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    marginTop: Platform.OS === 'android' ? 10 : 0 // Additional margin for Android
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000'
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  testButton: {
    padding: 8
  },
  refreshButton: {
    padding: 8
  },
  logoutButton: {
    padding: 8
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
  },
  listContainer: {
    paddingVertical: 10
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 10,
    marginVertical: 5,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold'
  },
  userDetails: {
    flex: 1
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000'
  },
  statusContainer: {
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
  messagePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    color: '#8E8E93',
    marginRight: 10
  },
  messageTime: {
    fontSize: 12,
    color: '#C7C7CC'
  },
  noMessage: {
    fontSize: 14,
    color: '#C7C7CC',
    fontStyle: 'italic'
  },
  unreadBadge: {
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8
  },
  unreadCount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold'
  }
});
