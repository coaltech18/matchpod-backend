import { Router } from 'express';
import { z } from 'zod';
import { PushTokenModel } from '../models/PushToken';
import { ExpoPushService } from '../services/expoPushService';
import { requireAuth, requireOnboardingCompleted, type AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { PAGINATION_LIMITS } from '../config/database';

export const router = Router();

// Validation schemas
const registerTokenSchema = z.object({
  expoPushToken: z.string().min(1, 'Expo push token is required'),
  deviceId: z.string().min(1, 'Device ID is required'),
  platform: z.enum(['ios', 'android', 'web']),
});

const unregisterTokenSchema = z.object({
  deviceId: z.string().min(1, 'Device ID is required'),
});

/**
 * POST /api/notifications/register
 * Register a push notification token
 */
router.post(
  '/register',
  requireAuth,
  requireOnboardingCompleted,
  validateBody(registerTokenSchema),
  async (req: AuthRequest, res) => {
    try {
      const { expoPushToken, deviceId, platform } = req.body;
      const userId = req.user!.id;

      // Check if feature is enabled
      const featureEnabled = process.env.ENABLE_PUSH_NOTIFICATIONS === 'true';
      if (!featureEnabled) {
        return res.status(403).json({
          error: 'Push notifications feature is not enabled',
          code: 'FEATURE_DISABLED',
        });
      }

      // Validate token format
      if (!ExpoPushService.isValidExpoPushToken(expoPushToken)) {
        return res.status(400).json({
          error: 'Invalid Expo push token format',
          code: 'INVALID_TOKEN_FORMAT',
        });
      }

      // Upsert push token (update if exists, create if not)
      const pushToken = await PushTokenModel.findOneAndUpdate(
        { userId, deviceId },
        {
          expoPushToken,
          platform,
          enabled: true,
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Registered push token for user ${userId}, device ${deviceId}`);

      return res.json({
        message: 'Push token registered successfully',
        tokenId: pushToken._id,
      });
    } catch (error: any) {
      console.error('Register push token error:', error);
      return res.status(500).json({
        error: 'Failed to register push token',
        code: 'REGISTRATION_FAILED',
      });
    }
  }
);

/**
 * DELETE /api/notifications/unregister
 * Unregister a push notification token
 */
router.delete(
  '/unregister',
  requireAuth,
  requireOnboardingCompleted,
  validateBody(unregisterTokenSchema),
  async (req: AuthRequest, res) => {
    try {
      const { deviceId } = req.body;
      const userId = req.user!.id;

      // Delete push token
      const result = await PushTokenModel.deleteOne({ userId, deviceId });

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
    } catch (error: any) {
      console.error('Unregister push token error:', error);
      return res.status(500).json({
        error: 'Failed to unregister push token',
        code: 'UNREGISTRATION_FAILED',
      });
    }
  }
);

/**
 * GET /api/notifications/tokens
 * Get all registered tokens for current user
 */
router.get('/tokens', requireAuth, requireOnboardingCompleted, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Phase 3: Add .lean() and limit for query safety
    const tokens = await PushTokenModel.find({ userId, enabled: true })
      .select('deviceId platform createdAt updatedAt')
      .limit(PAGINATION_LIMITS.NOTIFICATIONS_MAX)
      .lean();

    return res.json({
      tokens,
      count: tokens.length,
    });
  } catch (error: any) {
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
router.post('/test', requireAuth, requireOnboardingCompleted, async (req: AuthRequest, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        error: 'Test notifications not allowed in production',
        code: 'NOT_ALLOWED',
      });
    }

    const userId = req.user!.id;

    // Get user's tokens
    // Phase 3: Add limit for query safety
    const tokens = await PushTokenModel.find({ userId, enabled: true })
      .limit(10)
      .lean();

    if (tokens.length === 0) {
      return res.status(404).json({
        error: 'No push tokens registered',
        code: 'NO_TOKENS',
      });
    }

    // Send test notification
    const expoPushTokens = tokens.map(t => t.expoPushToken).filter(Boolean) as string[];
    await ExpoPushService.sendPushNotification(
      expoPushTokens,
      'Test Notification',
      'This is a test notification from MatchPod',
      { type: 'test' }
    );

    return res.json({
      message: 'Test notification sent',
      recipients: tokens.length,
    });
  } catch (error: any) {
    console.error('Send test notification error:', error);
    return res.status(500).json({
      error: 'Failed to send test notification',
      code: 'TEST_SEND_FAILED',
    });
  }
});

export default router;

