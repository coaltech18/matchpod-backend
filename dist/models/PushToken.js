"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushTokenModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const pushTokenSchema = new mongoose_1.default.Schema({
    userId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    token: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    platform: {
        type: String,
        required: true,
        enum: ['ios', 'android'],
    },
    deviceId: {
        type: String,
        sparse: true,
    },
    isValid: {
        type: Boolean,
        default: true,
        index: true,
    },
    lastUsed: {
        type: Date,
        default: Date.now,
    },
    expoPushToken: {
        type: String,
        sparse: true,
    },
}, {
    timestamps: true,
});
// Indexes
pushTokenSchema.index({ userId: 1, isValid: 1 });
pushTokenSchema.index({ token: 1, isValid: 1 });
pushTokenSchema.index({ lastUsed: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days TTL
// Middleware to update lastUsed
pushTokenSchema.pre('save', function (next) {
    const doc = this;
    if (doc.isValid) {
        doc.lastUsed = new Date();
    }
    next();
});
exports.PushTokenModel = mongoose_1.default.model('PushToken', pushTokenSchema);
