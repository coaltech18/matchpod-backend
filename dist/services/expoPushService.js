"use strict";
/**
 * Expo Push Notification Service
 * Sends push notifications via Expo Push API
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpoPushService = void 0;
const axios_1 = __importDefault(require("axios"));
const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
class ExpoPushService {
    /**
     * Send push notification(s)
     * @param tokens Expo push token(s)
     * @param title Notification title
     * @param body Notification body
     * @param data Optional data payload
     * @returns Array of push receipts
     */
    static async sendPushNotification(tokens, title, body, data) {
        try {
            // Check if feature is enabled
            const featureEnabled = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';
            if (!featureEnabled) {
                console.log('📴 Push notifications feature disabled');
                return [];
            }
            // Ensure tokens is an array
            const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
            // Filter invalid tokens
            const validTokens = tokenArray.filter(token => token && token.startsWith('ExponentPushToken['));
            if (validTokens.length === 0) {
                console.log('No valid Expo push tokens');
                return [];
            }
            // Construct messages
            const messages = validTokens.map(token => ({
                to: token,
                title,
                body,
                data: data || {},
                sound: 'default',
                priority: 'high',
                ttl: 3600, // 1 hour
                channelId: 'default',
            }));
            console.log(`📤 Sending ${messages.length} push notification(s)`);
            // Send notifications
            const response = await axios_1.default.post(EXPO_PUSH_API_URL, messages, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
            });
            const receipts = response.data.data;
            // Log results
            const successful = receipts.filter(r => r.status === 'ok').length;
            const failed = receipts.filter(r => r.status === 'error').length;
            console.log(`✅ Push notifications sent: ${successful} successful, ${failed} failed`);
            // Log errors
            receipts.filter(r => r.status === 'error').forEach(receipt => {
                console.error('Push notification error:', receipt.message, receipt.details);
            });
            return receipts;
        }
        catch (error) {
            console.error('Error sending push notifications:', error.message);
            throw error;
        }
    }
    /**
     * Validate Expo push token format
     * @param token Expo push token
     * @returns true if valid format
     */
    static isValidExpoPushToken(token) {
        return typeof token === 'string' && token.startsWith('ExponentPushToken[');
    }
    /**
     * Get push notification receipt status
     * @param receiptIds Array of receipt IDs
     * @returns Receipt status information
     */
    static async getPushNotificationReceipts(receiptIds) {
        try {
            const response = await axios_1.default.post('https://exp.host/--/api/v2/push/getReceipts', { ids: receiptIds }, {
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            return response.data.data;
        }
        catch (error) {
            console.error('Error getting push notification receipts:', error.message);
            throw error;
        }
    }
}
exports.ExpoPushService = ExpoPushService;
exports.default = ExpoPushService;
