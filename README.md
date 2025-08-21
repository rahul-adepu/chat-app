# 💬 Real-Time Chat Application

A full-stack real-time chat application built with **React Native** (mobile), **Node.js** (backend), **Socket.IO** (real-time communication), and **MongoDB** (database).

## ✨ Features

### 🔐 Authentication
- **User Registration & Login** with JWT tokens
- **Secure password hashing** using bcrypt
- **Token-based authentication** for all protected routes
- **Automatic token refresh** and session management

### 👥 User Management
- **Real-time online/offline status** indicators
- **Profile management** with username and email
- **Secure user data** storage and retrieval

### 💬 Real-Time Messaging
- **Instant message delivery** with Socket.IO
- **Message status indicators** (sent → delivered → read)
- **Typing indicators** showing when users are typing
- **Unread message counts** and notifications
- **Message history** persistence in MongoDB

### 📱 Cross-Platform Support
- **React Native** for mobile applications
- **Expo** for easy development and deployment
- **Web compatibility** through Expo web
- **Responsive design** for various screen sizes

### 🔒 Security Features
- **JWT token authentication**
- **Password encryption** with bcrypt
- **CORS protection** for API endpoints
- **Input validation** and sanitization
- **Secure socket connections**

## 🚀 Quick Start

### Prerequisites
- **Node.js** (v16 or higher)
- **MongoDB** (local or Atlas)
- **Expo CLI** (`npm install -g @expo/cli`)
- **Git**

### 1. Clone the Repository
```bash
git clone https://github.com/rahul-adepu/chat-app.git
cd chat-app
```

### 2. Backend Setup
```bash
cd server
npm install
```

Create a `.env` file in the `server/` directory:
```env
# Database Configuration
MONGO_URI=mongodb://localhost:27017/chat-app
# or for MongoDB Atlas:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/chat-app

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random

# Server Configuration
PORT=5050

```

Start the server:
```bash
npm run dev
```

### 3. Mobile App Setup
```bash
cd mobile
npm install
```

Create a `.env` file in the `mobile/` directory:
```env
# API Configuration
REACT_APP_API_URL=http://yourWifiIpAddress:backendPortNumber
REACT_APP_SOCKET_URL=http://yourWifiIpAddress:backendPortNumber

```

Start the mobile app:
```bash
# For mobile development
npm run dev

# For web development
press w
```

## 📱 Mobile App Usage

### Authentication Flow
1. **Register** a new account with username, email, and password
2. **Login** with your credentials to get authenticated
3. **Automatic redirection** to the main chat interface

### Chat Features
1. **View Users**: See all available users with online/offline status
2. **Start Conversations**: Tap on a user to begin chatting
3. **Real-time Messaging**: Send and receive messages instantly
4. **Status Indicators**: Track message delivery and read status
5. **Typing Indicators**: See when someone is typing

### Message Status Flow
- **Single tick (gray)**: Message sent
- **Double tick (gray)**: Message delivered to recipient
- **Double tick (blue)**: Message read by recipient

## 🔌 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

#### Login User
```http
POST /auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

### User Endpoints

#### Get All Users
```http
GET /users
Authorization: Bearer <jwt-token>
```

#### Get User Profile
```http
GET /auth/profile
Authorization: Bearer <jwt-token>
```

### Conversation Endpoints

#### Create Conversation
```http
POST /conversations
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "participants": ["user1_id", "user2_id"]
}
```

#### Get Conversation Messages
```http
GET /conversations/:conversationId/messages
Authorization: Bearer <jwt-token>
```

#### Mark Message as Read
```http
PUT /conversations/:conversationId/messages/:messageId/read
Authorization: Bearer <jwt-token>
```

## 🔌 Socket.IO Events

### Client to Server
- `message:send` - Send a new message
- `message:typing` - Send typing indicator
- `message:read` - Mark message as read
- `conversation:markAllRead` - Mark all messages as read
- `join:conversation` - Join a conversation room
- `leave:conversation` - Leave a conversation room

### Server to Client
- `message:new` - New message received
- `message:status` - Message status update
- `message:sent` - Message sent confirmation
- `user:typing` - User typing indicator
- `user:status` - User online/offline status
- `conversation:unreadUpdate` - Unread count update


## 🔧 Configuration

### Environment Variables

#### Server (.env)
| Variable | Description | Example |
|----------|-------------|---------|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/chat-app` |
| `JWT_SECRET` | Secret key for JWT tokens | `your-super-secret-key` |
| `PORT` | Server port number | `5050` |

#### Mobile (.env)
| Variable | Description | Example |
|----------|-------------|---------|
| `REACT_APP_API_URL` | Backend API URL | `http://yourWifiIpAddress:backendPortNumber` |
| `REACT_APP_SOCKET_URL` | Socket.IO server URL | `http:/yourWifiIpAddress:backendPortNumber` |




### Backend Testing
```bash
cd server
npm run dev
```

### Mobile App Testing
```bash
cd mobile
npm run dev
# Test on device or simulator
```

## 🔒 Security Considerations

### Authentication
- **JWT tokens** with expiration
- **Password hashing** using bcrypt
- **Secure token storage** on client side

### Data Protection
- **Input validation** on all endpoints

## 🐛 Troubleshooting

### Common Issues

#### Connection Refused
- Check if MongoDB is running
- Verify server port configuration
- Check firewall settings

#### Authentication Errors
- Ensure JWT_SECRET is set
- Check token expiration
- Verify user credentials

#### Socket Connection Issues
- Check Socket.IO server status
- Verify CORS configuration
- Check network connectivity


**Thank you! Happy Chatting! 💬✨**
