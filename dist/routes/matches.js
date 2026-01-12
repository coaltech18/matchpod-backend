"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Match_1 = require("../models/Match");
const rateLimit_1 = require("../middleware/rateLimit");
const matchService_1 = require("../services/matchService");
const database_1 = require("../config/database");
exports.router = (0, express_1.Router)();
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
exports.router.get('/potential', rateLimit_1.swipeRateLimit, auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        const userId = req.user.id;
        const matches = await (0, matchService_1.findMatches)(userId);
        res.json({
            success: true,
            data: {
                matches,
                count: matches.length,
            },
        });
    }
    catch (error) {
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
});
/**
 * GET /api/matches/stats/:userId
 * Get match statistics for a user
 */
exports.router.get('/stats/:userId', auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        const { userId } = req.params;
        // Only allow users to get their own stats
        if (req.user.id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: Cannot access other user stats',
            });
        }
        const stats = await (0, matchService_1.getMatchStats)(userId);
        res.json({
            success: true,
            data: stats,
        });
    }
    catch (error) {
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
});
/**
 * POST /api/matches/cache/invalidate
 * Invalidate match cache for the authenticated user
 */
exports.router.post('/cache/invalidate', auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        const userId = req.user.id;
        const deletedCount = await (0, matchService_1.invalidateMatchesCacheForUser)(userId);
        res.json({
            success: true,
            data: {
                deletedCacheKeys: deletedCount,
                message: `Invalidated ${deletedCount} cache entries`,
            },
        });
    }
    catch (error) {
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
});
/**
 * POST /api/matches/swipe
 * Record a swipe action (like or nope) on another user
 */
exports.router.post('/swipe', rateLimit_1.swipeRateLimit, auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    const { targetUserId, action } = req.body;
    if (!targetUserId) {
        return res.status(400).json({ error: 'targetUserId required' });
    }
    if (!action || !['like', 'nope'].includes(action)) {
        return res.status(400).json({ error: 'action must be "like" or "nope"' });
    }
    const currentUserId = req.user.id;
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
        const existing = await Match_1.MatchModel.findOne({ userA, userB });
        if (!existing) {
            await Match_1.MatchModel.create({
                userA,
                userB,
                isMutual: false,
                status: 'rejected',
                initiator: currentUserId
            });
        }
        // Invalidate cache to remove this user from results
        await (0, matchService_1.invalidateMatchesCacheForUser)(currentUserId);
        return res.json({ success: true, isMutual: false });
    }
    // For 'like'
    const ids = [currentUserId, targetUserId].sort();
    const [userA, userB] = ids;
    // Check if match already exists
    let match = await Match_1.MatchModel.findOne({ userA, userB });
    if (match) {
        // Check if this is a mutual like
        if (!match.isMutual && match.initiator?.toString() !== currentUserId) {
            // Other user liked first, this is now mutual!
            match.isMutual = true;
            match.status = 'accepted';
            await match.save();
            // Invalidate cache for both users
            await (0, matchService_1.invalidateMatchesCacheForUser)(currentUserId);
            await (0, matchService_1.invalidateMatchesCacheForUser)(targetUserId);
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
    match = await Match_1.MatchModel.create({
        userA,
        userB,
        isMutual: false,
        status: 'pending',
        initiator: currentUserId
    });
    // Invalidate cache
    await (0, matchService_1.invalidateMatchesCacheForUser)(currentUserId);
    return res.status(201).json({
        success: true,
        matchId: match._id,
        isMutual: false
    });
});
/**
 * GET /api/matches/mine
 * List user's mutual matches
 * Phase 3: Enforces pagination limit and uses .lean()
 */
exports.router.get('/mine', auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        const matches = await Match_1.MatchModel.find({
            $or: [
                { userA: req.user.id },
                { userB: req.user.id }
            ],
            isMutual: true
        })
            .populate('userA userB', 'name age photoUrls occupation bio')
            .limit(database_1.PAGINATION_LIMITS.MAX_PAGE_SIZE)
            .lean();
        res.json({
            success: true,
            data: {
                matches,
                count: matches.length,
            }
        });
    }
    catch (error) {
        console.error('Error getting matches:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get matches',
        });
    }
});
exports.default = exports.router;
