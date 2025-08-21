import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../utils/AuthContext.js';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  
  // Check if we're in a web environment
  const isWeb = typeof window !== 'undefined' && !window.ReactNativeWebView;

  const handleRegister = async () => {
    if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) { 
      Alert.alert('Error', 'Please fill in all fields'); 
      return; 
    }
    if (password.length < 6) { 
      Alert.alert('Error', 'Password must be at least 6 characters'); 
      return; 
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) { 
      Alert.alert('Error', 'Please enter a valid email address'); 
      return; 
    }
    if (password !== confirmPassword) { 
      Alert.alert('Error', 'Passwords do not match'); 
      return; 
    }
    
    setIsLoading(true);
    try {
      const result = await register(username.trim(), email.trim(), password);
      
      // Clear form fields
      setUsername('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      
      // Show success message and set redirect flag
      // In web environments, alerts can be unreliable, so we set redirect immediately
      setShouldRedirect(true);
      
      // Show alert for user feedback
      if (isWeb) {
        // In web, show a simple alert and redirect immediately
        alert(result.message);
      } else {
        // In mobile, use the native Alert component
        Alert.alert('Success', result.message, [
          { 
            text: 'OK', 
            onPress: () => {
              // Alert dismissed, but redirect should already be happening
            }
          }
        ]);
      }
    } catch (error) {
      const errorMessage = error.message || 'Registration failed. Please try again.';
      if (isWeb) {
        alert('Error: ' + errorMessage);
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally { 
      setIsLoading(false); 
    }
  };

  // Handle redirect after successful registration
  useEffect(() => {
    if (shouldRedirect) {
      console.log('Registration successful, initiating redirect to login...');
      // Use a more reliable navigation approach
      const timer = setTimeout(() => {
        try {
          console.log('Attempting navigation to login page...');
          // Try push first
          router.push('/auth/login');
          console.log('Navigation successful with push');
        } catch (error) {
          console.log('Push navigation failed, trying replace:', error);
          // Fallback to replace if push fails
          try {
            router.replace('/auth/login');
            console.log('Navigation successful with replace');
          } catch (replaceError) {
            console.log('Replace navigation also failed:', replaceError);
            // Last resort: try to navigate programmatically
            if (typeof window !== 'undefined') {
              console.log('Using window.location.href as fallback');
              window.location.href = '/auth/login';
            }
          }
        }
        setShouldRedirect(false);
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [shouldRedirect, router]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardAvoidingView}>
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Text style={styles.backButtonText}>←</Text></TouchableOpacity>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join our chat community</Text>
          </View>
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Username</Text>
              <TextInput style={styles.input} placeholder="Enter your username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              <TextInput style={styles.input} placeholder="Enter your email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput style={[styles.input, styles.passwordInput]} placeholder="Create a password" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" />
                <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#7f8c8d" />
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput style={[styles.input, styles.passwordInput]} placeholder="Confirm your password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry={!showConfirmPassword} autoCapitalize="none" />
                <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={24} color="#7f8c8d" />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={[styles.registerButton, isLoading && styles.registerButtonDisabled]} onPress={handleRegister} disabled={isLoading}>
              <Text style={styles.registerButtonText}>{isLoading ? 'Creating Account...' : 'Create Account'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/auth/login')}><Text style={styles.footerLink}>Sign In</Text></TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  keyboardAvoidingView: { flex: 1 },
  scrollContainer: { flexGrow: 1, paddingHorizontal: 24 },
  header: { alignItems: 'center', marginTop: 40, marginBottom: 40 },
  backButton: { position: 'absolute', left: 0, top: 0, padding: 8 },
  backButtonText: { fontSize: 24, color: '#3498db' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2c3e50', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#7f8c8d', textAlign: 'center' },
  form: { flex: 1, justifyContent: 'center' },
  inputContainer: { marginBottom: 20 },
  label: { fontSize: 16, fontWeight: '600', color: '#2c3e50', marginBottom: 8 },
  input: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e1e8ed', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 16, fontSize: 16, color: '#2c3e50' },
  passwordContainer: { position: 'relative' },
  passwordInput: { paddingRight: 50 },
  eyeIcon: { position: 'absolute', right: 16, top: 16, padding: 4 },
  registerButton: { backgroundColor: '#27ae60', paddingVertical: 16, borderRadius: 12, marginTop: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5 },
  registerButtonDisabled: { backgroundColor: '#bdc3c7' },
  registerButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  footerText: { color: '#7f8c8d', fontSize: 16 },
  footerLink: { color: '#3498db', fontSize: 16, fontWeight: '600' },
});
