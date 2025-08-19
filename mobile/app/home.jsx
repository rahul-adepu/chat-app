import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from './utils/AuthContext.js';
import { usersAPI } from './services/api.js';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const allUsers = await usersAPI.getAllUsers();
      const filteredUsers = allUsers.filter(u => u._id !== user.id);
      setUsers(filteredUsers);
    } catch (error) {
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { 
        text: 'Logout', 
        onPress: () => {
          logout();
          router.replace('/');
        }
      }
    ]);
  };

  const renderUser = ({ item }) => (
    <TouchableOpacity style={styles.userItem}>
      <View style={styles.avatarContainer}>
        <Text style={styles.avatarText}>{item.username.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.username}>{item.username}</Text>
        <Text style={styles.email}>{item.email}</Text>
      </View>
      <View style={styles.statusContainer}>
        <View style={[styles.statusDot, { backgroundColor: item.isOnline ? '#27ae60' : '#95a5a6' }]} />
        <Text style={styles.statusText}>{item.isOnline ? 'Online' : 'Offline'}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#e74c3c" />
        </TouchableOpacity>
      </View>
      <View style={styles.userInfoHeader}>
        <Text style={styles.welcomeText}>Welcome, {user?.username}!</Text>
        <Text style={styles.subtitle}>Select a user to start chatting</Text>
      </View>
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.userList}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#e1e8ed' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
  logoutButton: { padding: 8 },
  userInfoHeader: { paddingHorizontal: 20, paddingVertical: 20, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e1e8ed' },
  welcomeText: { fontSize: 18, fontWeight: '600', color: '#2c3e50', marginBottom: 5 },
  subtitle: { fontSize: 14, color: '#7f8c8d' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 16, color: '#7f8c8d' },
  userList: { paddingVertical: 10 },
  userItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, backgroundColor: '#ffffff', marginHorizontal: 20, marginVertical: 5, borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  avatarContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#3498db', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  userInfo: { flex: 1 },
  username: { fontSize: 16, fontWeight: '600', color: '#2c3e50', marginBottom: 2 },
  email: { fontSize: 14, color: '#7f8c8d' },
  statusContainer: { alignItems: 'center' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 5 },
  statusText: { fontSize: 12, color: '#7f8c8d' },
});
