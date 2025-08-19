import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from './utils/AuthContext.js';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/register" options={{ headerShown: false }} />
      </Stack>
    </AuthProvider>
  );
}
