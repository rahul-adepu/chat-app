import axios from 'axios';

const API_BASE_URL = 'http://192.168.1.107:5050';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) clearAuthToken();
    return Promise.reject(error);
  }
);

let authToken = null;

export const setAuthToken = (token) => {
  authToken = token;
};

export const getAuthToken = () => {
  return authToken;
};

export const clearAuthToken = () => {
  authToken = null;
};

export const authAPI = {
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/auth/profile');
    return response.data;
  },
};

export const usersAPI = {
  getAllUsers: async () => {
    try {
      const token = getAuthToken();
      const response = await api.get('/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getUserById: async (userId) => {
    const response = await api.get(`/users/${userId}`);
    return response.data;
  },
};

export const conversationsAPI = {
  getUserConversations: async () => {
    const response = await api.get('/conversations');
    return response.data;
  },

  createConversation: async (participantId) => {
    const response = await api.post('/conversations', { participantId });
    return response.data;
  },

  getConversationMessages: async (conversationId) => {
    const response = await api.get(`/conversations/${conversationId}/messages`);
    return response.data;
  },

  sendMessage: async (conversationId, messageData) => {
    const response = await api.post(`/conversations/${conversationId}/messages`, messageData);
    return response.data;
  },

  markMessageAsRead: async (conversationId, messageId) => {
    const response = await api.put(`/conversations/${conversationId}/messages/${messageId}/read`);
    return response.data;
  },
};

export default api;
