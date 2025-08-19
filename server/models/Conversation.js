import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    lastMessageContent: { type: String },
    lastMessageTime: { type: Date },
    unreadCount: { type: Map, of: Number, default: new Map() },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });
conversationSchema.index({ lastMessageTime: -1 });

export default mongoose.model("Conversation", conversationSchema);
