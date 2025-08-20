import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
    messageType: { type: String, enum: ["text", "image", "file"], default: "text" },
    isRead: { type: Boolean, default: false },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent'
    },
    isSenderOnline: {
      type: Boolean,
      default: false
    },
    deliveredAt: { type: Date },
    readAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model("Message", messageSchema);
