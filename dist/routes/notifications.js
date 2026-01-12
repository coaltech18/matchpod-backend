"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const PushToken_1 = require("../models/PushToken");
const expoPushService_1 = require("../services/expoPushService");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const database_1 = require("../config/database");
exports.router = (0, express_1.Router)();
// Validation schemas
const registerTokenSchema = zod_1.z.object({
    expoPushToken: zod_1.z.string().min(1, 'Expo push token is required'),
    deviceId: zod_1.z.string().min(1, 'Device ID is required'),
    platform: zod_1.z.enum(['ios', 'android', 'web']),
});
const unregisterTokenSchema = zod_1.z.object({
    deviceId: zod_1.z.string().min(1, 'Device ID is required'),
});
/**
 * POST /api/notifications/register
 * Register a push notification token
 */
exports.router.post('/register', auth_1.requireAuth, auth_1.requireOnboardingCompleted, (0, validate_1.validateBody)(registerTokenSchema), async (req, res) => {
    try {
        const { expoPushToken, deviceId, platform } = req.body;
        const userId = req.user.id;
        // Check if feature is enabled
        const featureEnabled = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';
        if (!featureEnabled) {
            return res.status(403).json({
                error: 'Push notifications feature is not enabled',
                code: 'FEATURE_DISABLED',
            });
        }
        // Validate token format
        if (!expoPushService_1.ExpoPushService.isValidExpoPushToken(expoPushToken)) {
            return res.status(400).json({
                error: 'Invalid Expo push token format',
                code: 'INVALID_TOKEN_FORMAT',
            });
        }
        // Upsert push token (update if exists, create if not)
        const pushToken = await PushToken_1.PushTokenModel.findOneAndUpdate({ userId, deviceId }, {
            expoPushToken,
            platform,
            enabled: true,
        }, { upsert: true, new: true });
        console.log(`✅ Registered push token for user ${userId}, device ${deviceId}`);
        return res.json({
            message: 'Push token registered successfully',
            tokenId: pushToken._id,
        });
    }
    catch (error) {
        console.error('Register push token error:', error);
        return res.status(500).json({
            error: 'Failed to register push token',
            code: 'REGISTRATION_FAILED',
        });
    }
});
/**
 * DELETE /api/notifications/unregister
 * Unregister a push notification token
 */
exports.router.delete('/unregister', auth_1.requireAuth, auth_1.requireOnboardingCompleted, (0, validate_1.validateBody)(unregisterTokenSchema), async (req, res) => {
    try {
        const { deviceId } = req.body;
        const userId = req.user.id;
        // Delete push token
        const result = await PushToken_1.PushTokenModel.deleteOne({ userId, deviceId });
        if (result.deletedCount === 0) {
            return res.status(404).json({
                error: 'Push token not found',
                code: 'TOKEN_NOT_FOUND',
            });
        }
        console.log(`✅ Unregistered push token for user ${userId}, device ${deviceId}`);
        return res.json({
            message: 'Push token unregistered successfully',
        });
    }
    catch (error) {
        console.error('Unregister push token error:', error);
        return res.status(500).json({
            error: 'Failed to unregister push token',
            code: 'UNREGISTRATION_FAILED',
        });
    }
});
/**
 * GET /api/notifications/tokens
 * Get all registered tokens for current user
 */
exports.router.get('/tokens', auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        const userId = req.user.id;
        // Phase 3: Add .lean() and limit for query safety
        const tokens = await PushToken_1.PushTokenModel.find({ userId, enabled: true })
            .select('deviceId platform createdAt updatedAt')
            .limit(database_1.PAGINATION_LIMITS.NOTIFICATIONS_MAX)
            .lean();
        return res.json({
            tokens,
            count: tokens.length,
        });
    }
    catch (error) {
        console.error('Get push tokens error:', error);
        return res.status(500).json({
            error: 'Failed to retrieve push tokens',
            code: 'GET_TOKENS_FAILED',
        });
    }
});
/**
 * POST /api/notifications/test
 * Send a test notification (development only)
 */
exports.router.post('/test', auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        // Only allow in development
        if (process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                error: 'Test notifications not allowed in production',
                code: 'NOT_ALLOWED',
            });
        }
        const userId = req.user.id;
        // Get user's tokens
        // Phase 3: Add limit for query safety
        const tokens = await PushToken_1.PushTokenModel.find({ userId, enabled: true })
            .limit(10)
            .lean();
        if (tokens.length === 0) {
            return res.status(404).json({
                error: 'No push tokens registered',
                code: 'NO_TOKENS',
            });
        }
        // Send test notification
        const expoPushTokens = tokens.map(t => t.expoPushToken).filter(Boolean);
        await expoPushService_1.ExpoPushService.sendPushNotification(expoPushTokens, 'Test Notification', 'This is a test notification from MatchPod', { type: 'test' });
        return res.json({
            message: 'Test notification sent',
            recipients: tokens.length,
        });
    }
    catch (error) {
        console.error('Send test notification error:', error);
        return res.status(500).json({
            error: 'Failed to send test notification',
            code: 'TEST_SEND_FAILED',
        });
    }
});
exports.default = exports.router;
