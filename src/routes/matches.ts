import { Router } from 'express';
import { requireAuth, requireOnboardingCompleted, AuthRequest } from '../middleware/auth';
import { MatchModel } from '../models/Match';
import { swipeRateLimit } from '../middleware/rateLimit';
import {
  findMatches,
  invalidateMatchesCacheForUser,
  getMatchStats
} from '../services/matchService';
import { PAGINATION_LIMITS } from '../config/database';

export const router = Router();

/**
 * GET /api/matches/potential
 * Get potential matches for the authenticated user
 * 
 * Returns candidates matching:
 * - Opposite role (has_room ↔ seeking_room)
 * - Same city
 * - Overlapping budget
 * - Compatible timeline
 * - Not already swiped
 */
router.get('/potential',
  swipeRateLimit,
  requireAuth,
  requireOnboardingCompleted,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      const matches = await findMatches(userId);

      res.json({
        success: true,
        data: {
          matches,
          count: matches.length,
        },
      });
    } catch (error: any) {
      console.error('Error finding matches:', error);

      if (error.status) {
        return res.status(error.status).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * GET /api/matches/stats/:userId
 * Get match statistics for a user
 */
router.get('/stats/:userId',
  requireAuth,
  requireOnboardingCompleted,
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;

      // Only allow users to get their own stats
      if (req.user!.id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden: Cannot access other user stats',
        });
      }

      const stats = await getMatchStats(userId);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('Error getting match stats:', error);

      if (error.status) {
        return res.status(error.status).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/matches/cache/invalidate
 * Invalidate match cache for the authenticated user
 */
router.post('/cache/invalidate',
  requireAuth,
  requireOnboardingCompleted,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      const deletedCount = await invalidateMatchesCacheForUser(userId);

      res.json({
        success: true,
        data: {
          deletedCacheKeys: deletedCount,
          message: `Invalidated ${deletedCount} cache entries`,
        },
      });
    } catch (error: any) {
      console.error('Error invalidating cache:', error);

      if (error.status) {
        return res.status(error.status).json({
          success: false,
          error: error.message,
        });
      }

      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/matches/swipe
 * Record a swipe action (like or nope) on another user
 */
router.post('/swipe',
  swipeRateLimit,
  requireAuth,
  requireOnboardingCompleted,
  async (req: AuthRequest, res) => {
    const { targetUserId, action } = req.body as { targetUserId: string; action: 'like' | 'nope' };

    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId required' });
    }

    if (!action || !['like', 'nope'].includes(action)) {
      return res.status(400).json({ error: 'action must be "like" or "nope"' });
    }

    const currentUserId = req.user!.id;

    // Cannot swipe on yourself
    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: 'Cannot swipe on yourself' });
    }

    // For 'nope', record and return
    if (action === 'nope') {
      // Create a rejected match record to prevent showing again
      const ids = [currentUserId, targetUserId].sort();
      const [userA, userB] = ids;

      // Check if already exists
      const existing = await MatchModel.findOne({ userA, userB });
      if (!existing) {
        await MatchModel.create({
          userA,
          userB,
          isMutual: false,
          status: 'rejected',
          initiator: currentUserId
        });
      }

      // Invalidate cache to remove this user from results
      await invalidateMatchesCacheForUser(currentUserId);

      return res.json({ success: true, isMutual: false });
    }

    // For 'like'
    const ids = [currentUserId, targetUserId].sort();
    const [userA, userB] = ids;

    // Check if match already exists
    let match = await MatchModel.findOne({ userA, userB });

    if (match) {
      // Check if this is a mutual like
      if (!match.isMutual && match.initiator?.toString() !== currentUserId) {
        // Other user liked first, this is now mutual!
        match.isMutual = true;
        match.status = 'accepted';
        await match.save();

        // Invalidate cache for both users
        await invalidateMatchesCacheForUser(currentUserId);
        await invalidateMatchesCacheForUser(targetUserId);

        return res.json({
          success: true,
          matchId: match._id,
          isMutual: true,
          isNewMatch: true
        });
      }

      // Already liked or mutual
      return res.json({
        success: true,
        matchId: match._id,
        isMutual: match.isMutual
      });
    }

    // Create new match (first like)
    match = await MatchModel.create({
      userA,
      userB,
      isMutual: false,
      status: 'pending',
      initiator: currentUserId
    });

    // Invalidate cache
    await invalidateMatchesCacheForUser(currentUserId);

    return res.status(201).json({
      success: true,
      matchId: match._id,
      isMutual: false
    });
  }
);

/**
 * GET /api/matches/mine
 * List user's mutual matches
 * Phase 3: Enforces pagination limit and uses .lean()
 */
router.get('/mine', requireAuth, requireOnboardingCompleted, async (req: AuthRequest, res) => {
  try {
    const matches = await MatchModel.find({
      $or: [
        { userA: req.user!.id },
        { userB: req.user!.id }
      ],
      isMutual: true
    })
      .populate('userA userB', 'name age photoUrls occupation bio')
      .limit(PAGINATION_LIMITS.MAX_PAGE_SIZE)
      .lean();

    res.json({
      success: true,
      data: {
        matches,
        count: matches.length,
      }
    });
  } catch (error: any) {
    console.error('Error getting matches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get matches',
    });
  }
});

export default router;