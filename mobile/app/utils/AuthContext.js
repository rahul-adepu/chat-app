import React, { createContext, useContext, useState } from 'react';
import { authAPI, setAuthToken, clearAuthToken } from '../services/api.js';

const AuthContext = createContext(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const isAuthenticated = !!user;

  const getErrorMessage = (error) => {
    if (error.response?.data?.message) return error.response.data.message;
    if (error.response?.status === 400) return 'Invalid credentials. Please check your email and password.';
    if (error.response?.status === 401) return 'Authentication failed. Please try again.';
    if (error.response?.status === 404) return 'Service not found. Please try again later.';
    if (error.response?.status === 500) return 'Server error. Please try again later.';
    if (error.message === 'Network Error') return 'Network error. Please check your connection.';
    return 'An unexpected error occurred. Please try again.';
  };

  const login = async (email, password) => {
    try {
      const { token, user: userData } = await authAPI.login({ email, password });
      setAuthToken(token);
      setUser(userData);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  };

  const register = async (username, email, password) => {
    try {
      const { token, user: userData } = await authAPI.register({ username, email, password });
      setAuthToken(token);
      setUser(userData);
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
