"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.privacyService = void 0;
const encryption_1 = require("./encryption");
const User_1 = require("../models/User");
const Chat_1 = require("../models/Chat");
class PrivacyService {
    /**
     * Encrypts sensitive user data before storage
     */
    async encryptUserData(data) {
        const sensitiveFields = ['email', 'phoneNumber'];
        const encrypted = { ...data };
        for (const field of sensitiveFields) {
            if (encrypted[field]) {
                encrypted[field] = await encryption_1.encryptionService.encrypt(encrypted[field]);
            }
        }
        return encrypted;
    }
    /**
     * Decrypts sensitive user data for authorized access
     */
    async decryptUserData(data) {
        const sensitiveFields = ['email', 'phoneNumber'];
        const decrypted = { ...data };
        for (const field of sensitiveFields) {
            if (decrypted[field]) {
                decrypted[field] = await encryption_1.encryptionService.decrypt(decrypted[field]);
            }
        }
        return decrypted;
    }
    /**
     * Anonymizes user data for deletion
     */
    async anonymizeUser(userId) {
        const anonymousData = {
            name: 'Deleted User',
            email: null,
            phoneNumber: null,
            photos: [],
            bio: null,
            location: null,
            isActive: false,
            isAnonymized: true,
            anonymizedAt: new Date(),
        };
        await User_1.UserModel.findByIdAndUpdate(userId, {
            $set: anonymousData,
            $unset: {
                interests: 1,
                preferences: 1,
            },
        });
        // Anonymize messages
        await Chat_1.MessageModel.updateMany({ senderId: userId }, {
            $set: {
                content: '[Message deleted]',
                type: 'text',
            },
            $unset: {
                attachments: 1,
            },
        });
        // Remove from chat rooms
        await Chat_1.ChatRoomModel.updateMany({ users: userId }, {
            $pull: { users: userId },
            $set: { isActive: false },
        });
    }
    /**
     * Applies user's privacy settings
     */
    async applyPrivacySettings(userId, settings) {
        await User_1.UserModel.findByIdAndUpdate(userId, {
            $set: { privacySettings: settings },
        });
    }
    /**
     * Cleans up old data based on retention policies
     */
    async cleanupOldData() {
        const now = new Date();
        // Get users with their privacy settings
        const users = await User_1.UserModel.find({}, 'privacySettings');
        for (const user of users) {
            const settings = user.privacySettings || {};
            const retention = settings.dataRetention || {
                messages: 365, // 1 year default
                location: 30, // 30 days default
                activity: 90, // 90 days default
            };
            // Clean up old messages
            const messageDate = new Date(now.getTime() - retention.messages * 24 * 60 * 60 * 1000);
            await Chat_1.MessageModel.updateMany({
                senderId: user._id,
                createdAt: { $lt: messageDate },
            }, {
                $set: {
                    content: '[Message expired]',
                    type: 'text',
                },
                $unset: {
                    attachments: 1,
                },
            });
            // Clean up location history
            const locationDate = new Date(now.getTime() - retention.location * 24 * 60 * 60 * 1000);
            await User_1.UserModel.updateMany({
                _id: user._id,
                'locationHistory.timestamp': { $lt: locationDate },
            }, {
                $pull: {
                    locationHistory: { timestamp: { $lt: locationDate } },
                },
            });
            // Clean up activity logs
            const activityDate = new Date(now.getTime() - retention.activity * 24 * 60 * 60 * 1000);
            // Implement activity log cleanup based on your activity tracking system
        }
    }
    /**
     * Exports user data for GDPR compliance
     */
    async exportUserData(userId) {
        const user = await User_1.UserModel.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        const messages = await Chat_1.MessageModel.find({ senderId: userId });
        const chatRooms = await Chat_1.ChatRoomModel.find({ users: userId });
        const decryptedUser = await this.decryptUserData(user.toObject());
        return {
            personalInfo: {
                name: decryptedUser.name,
                email: decryptedUser.email,
                phoneNumber: decryptedUser.phoneNumber,
                dateJoined: decryptedUser.createdAt,
            },
            profile: {
                bio: decryptedUser.bio,
                interests: decryptedUser.interests,
                preferences: decryptedUser.preferences,
            },
            activity: {
                lastActive: decryptedUser.lastActive,
                totalMessages: messages.length,
                totalMatches: chatRooms.length,
            },
            messages: messages.map(msg => ({
                content: msg.content,
                type: msg.type,
                timestamp: msg.createdAt,
            })),
        };
    }
}
exports.privacyService = new PrivacyService();
