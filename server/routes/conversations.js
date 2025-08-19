import express from "express";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import auth from "../middleware/auth.js";

const conversationsRouter = express.Router();

conversationsRouter.get("/", auth, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "username email isOnline")
      .populate("lastMessage", "content createdAt")
      .sort({ lastMessageTime: -1, createdAt: -1 });

    res.json(conversations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

conversationsRouter.post("/", auth, async (req, res) => {
  try {
    const { participantId } = req.body;
    const userId = req.user?.id;
    
    if (!userId || !participantId) {
      return res.status(400).json({ message: "Both users are required" });
    }

    if (userId === participantId) {
      return res.status(400).json({ message: "Cannot create conversation with yourself" });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [userId, participantId] }
    });

    if (!conversation) {
      conversation = new Conversation({
        participants: [userId, participantId],
        unreadCount: new Map([[participantId, 0], [userId, 0]])
      });
      await conversation.save();
    }

    res.json(conversation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

conversationsRouter.get("/:conversationId/messages", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({ conversationId })
      .populate("sender", "username")
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(messages);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

conversationsRouter.post("/:conversationId/messages", auth, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { content, messageType = "text" } = req.body;
    const userId = req.user?.id;
    
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!content) return res.status(400).json({ message: "Message content is required" });

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const message = new Message({
      conversationId,
      sender: userId,
      content,
      messageType,
      deliveredAt: new Date()
    });

    await message.save();

    conversation.lastMessage = message._id;
    conversation.lastMessageContent = content;
    conversation.lastMessageTime = new Date();
    
    const otherParticipant = conversation.participants.find(p => p.toString() !== userId);
    const currentUnreadCount = conversation.unreadCount.get(otherParticipant) || 0;
    conversation.unreadCount.set(otherParticipant, currentUnreadCount + 1);
    
    await conversation.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "username");

    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

conversationsRouter.put("/:conversationId/messages/:messageId/read", auth, async (req, res) => {
  try {
    const { conversationId, messageId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    if (message.sender.toString() === userId) {
      return res.status(400).json({ message: "Cannot mark own message as read" });
    }

    if (!message.isRead) {
      message.isRead = true;
      message.readAt = new Date();
      if (!message.readBy.includes(userId)) {
        message.readBy.push(userId);
      }
      await message.save();
    }

    res.json({ message: "Message marked as read" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default conversationsRouter;
