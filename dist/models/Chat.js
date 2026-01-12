"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatModel = exports.ChatRoomModel = exports.MessageModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const messageSchema = new mongoose_1.default.Schema({
    matchId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Match',
        required: true,
        index: true,
    },
    senderId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
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
            type: mongoose_1.default.Schema.Types.ObjectId,
            ref: 'User',
        }],
}, {
    timestamps: true,
});
// Indexes
messageSchema.index({ matchId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ status: 1, createdAt: -1 });
const chatRoomSchema = new mongoose_1.default.Schema({
    matchId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Match',
        required: true,
        unique: true,
    },
    lastMessage: {
        type: mongoose_1.default.Schema.Types.ObjectId,
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
}, {
    timestamps: true,
});
// Indexes
chatRoomSchema.index({ matchId: 1, updatedAt: -1 });
chatRoomSchema.index({ isActive: 1, updatedAt: -1 });
exports.MessageModel = mongoose_1.default.model('Message', messageSchema);
exports.ChatRoomModel = mongoose_1.default.model('ChatRoom', chatRoomSchema);
exports.ChatModel = exports.ChatRoomModel; // Alias for backward compatibility
