import mongoose, { Document, Types } from 'mongoose';

export interface IMessage extends Document {
  matchId: Types.ObjectId | string;
  senderId: Types.ObjectId | string;
  content: string;
  type: 'text' | 'image' | 'location';
  status: 'sent' | 'delivered' | 'read';
  readBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new mongoose.Schema<IMessage>(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['text', 'image', 'location'],
      default: 'text',
    },
    status: {
      type: String,
      required: true,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
    },
    readBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  {
    timestamps: true,
  }
);

// Indexes
messageSchema.index({ matchId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ status: 1, createdAt: -1 });

export interface IChatRoom extends Document {
  matchId: Types.ObjectId | string;
  lastMessage?: Types.ObjectId | string; // Reference to last message
  unreadCount: Map<string, number>; // userId -> unread count
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const chatRoomSchema = new mongoose.Schema<IChatRoom>(
  {
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
      unique: true,
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: new Map(),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
chatRoomSchema.index({ matchId: 1, updatedAt: -1 });
chatRoomSchema.index({ isActive: 1, updatedAt: -1 });

export const MessageModel = mongoose.model<IMessage>('Message', messageSchema);
export const ChatRoomModel = mongoose.model<IChatRoom>('ChatRoom', chatRoomSchema);
export const ChatModel = ChatRoomModel; // Alias for backward compatibility