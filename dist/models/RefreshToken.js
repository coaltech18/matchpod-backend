"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshTokenModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const refreshTokenSchema = new mongoose_1.default.Schema({
    userId: {
        type: String,
        required: true,
        index: true,
    },
    tokenId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: true,
    },
    revoked: {
        type: Boolean,
        default: false,
        index: true,
    },
    revokedAt: {
        type: Date,
    },
    deviceId: {
        type: String,
    },
    ipAddress: {
        type: String,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});
// Index for cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Index for finding user tokens
refreshTokenSchema.index({ userId: 1, revoked: 1 });
exports.RefreshTokenModel = mongoose_1.default.model('RefreshToken', refreshTokenSchema);
