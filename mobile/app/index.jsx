import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.logo}>💬</Text>
        <Text style={styles.title}>ChatApp</Text>
        <Text style={styles.subtitle}>Connect with friends in real-time</Text>
      </View>
      <View style={styles.messageContainer}>
        <Text style={styles.welcomeText}>Welcome to your personal chat experience</Text>
        <Text style={styles.descriptionText}>Sign in to continue chatting or create a new account to get started</Text>
      </View>
      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/auth/login')}>
          <Text style={styles.loginButtonText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.registerButton} onPress={() => router.push('/auth/register')}>
          <Text style={styles.registerButtonText}>Create Account</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>Built with React Native & Node.js</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { alignItems: 'center', marginTop: 60, marginBottom: 40 },
  logo: { fontSize: 80, marginBottom: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#2c3e50', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#7f8c8d', textAlign: 'center', paddingHorizontal: 20 },
  messageContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  welcomeText: { fontSize: 24, fontWeight: '600', color: '#2c3e50', textAlign: 'center', marginBottom: 15 },
  descriptionText: { fontSize: 16, color: '#7f8c8d', textAlign: 'center', lineHeight: 24 },
  buttonContainer: { paddingHorizontal: 30, marginBottom: 40 },
  loginButton: { backgroundColor: '#3498db', paddingVertical: 16, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  loginButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  registerButton: { backgroundColor: '#ffffff', paddingVertical: 16, borderRadius: 12, borderWidth: 2, borderColor: '#3498db', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  registerButtonText: { color: '#3498db', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  footer: { alignItems: 'center', paddingBottom: 20 },
  footerText: { fontSize: 14, color: '#95a5a6' },
});
