"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchServiceError = void 0;
exports.findMatches = findMatches;
exports.invalidateMatchesCacheForUser = invalidateMatchesCacheForUser;
exports.getMatchStats = getMatchStats;
const mongoose_1 = require("mongoose");
const User_1 = require("../models/User");
const Match_1 = require("../models/Match");
const client_1 = require("../redis/client");
/**
 * MatchPod Beta Matching Service
 *
 * Simple, explainable matching using ONLY these 4 hard filters:
 * 1. role (opposite roles only)
 * 2. city (same city only)
 * 3. budget (ranges must overlap)
 * 4. timeline (compatible timelines only)
 *
 * NO scoring, NO weights, NO ranking, NO ML/AI.
 */
// Constants
const MAX_RESULTS = 15;
const CACHE_TTL_SECONDS = 300; // 5 minutes
/**
 * Timeline compatibility matrix
 * - 'immediately' matches 'immediately' or 'soon'
 * - 'soon' matches 'immediately', 'soon', or 'flexible'
 * - 'flexible' matches 'soon' or 'flexible'
 */
const TIMELINE_COMPATIBILITY = {
    immediately: ['immediately', 'soon'],
    soon: ['immediately', 'soon', 'flexible'],
    flexible: ['soon', 'flexible'],
};
/**
 * Custom error class for match service errors
 */
class MatchServiceError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'MatchServiceError';
        this.status = status;
    }
}
exports.MatchServiceError = MatchServiceError;
/**
 * Validates MongoDB ObjectId format
 */
function validateUserId(userId) {
    if (!userId || typeof userId !== 'string') {
        throw new MatchServiceError('Invalid user ID provided', 400);
    }
    if (!mongoose_1.Types.ObjectId.isValid(userId)) {
        throw new MatchServiceError('Invalid user ID format', 400);
    }
    return userId;
}
/**
 * Checks if two budget ranges overlap
 */
function budgetsOverlap(userBudget, candidateBudget) {
    const userMin = Math.min(userBudget.min || 0, userBudget.max || 0);
    const userMax = Math.max(userBudget.min || 0, userBudget.max || 0);
    const candidateMin = Math.min(candidateBudget.min || 0, candidateBudget.max || 0);
    const candidateMax = Math.max(candidateBudget.min || 0, candidateBudget.max || 0);
    return userMin <= candidateMax && candidateMin <= userMax;
}
/**
 * Checks if two timelines are compatible
 */
function timelinesCompatible(userTimeline, candidateTimeline) {
    // If either is missing, treat as compatible (for beta flexibility)
    if (!userTimeline || !candidateTimeline) {
        return true;
    }
    const compatibleTimelines = TIMELINE_COMPATIBILITY[userTimeline] || [];
    return compatibleTimelines.includes(candidateTimeline);
}
/**
 * Gets the opposite role for matching
 */
function getOppositeRole(role) {
    return role === 'has_room' ? 'seeking_room' : 'has_room';
}
/**
 * Creates a candidate profile from user data
 */
function createCandidateProfile(user) {
    return {
        _id: user._id.toString(),
        name: user.name || 'Anonymous',
        age: user.age || 0,
        gender: user.gender || 'other',
        occupation: user.occupation,
        city: user.city || '',
        budget: {
            min: user.budget?.min || 0,
            max: user.budget?.max || 0,
        },
        timeline: user.timeline || 'flexible',
        lifestyle: user.lifestyle ? {
            smoking: user.lifestyle.smoking,
            pets: user.lifestyle.pets,
            nightOwl: user.lifestyle.nightOwl,
            cleanliness: user.lifestyle.cleanliness,
        } : undefined,
        bio: user.bio,
        photoUrls: user.photoUrls || user.photos,
        updatedAt: user.updatedAt || new Date(),
    };
}
/**
 * Gets IDs of users the current user has already swiped on
 */
async function getAlreadySwipedUserIds(userId) {
    const matches = await Match_1.MatchModel.find({
        $or: [
            { userA: userId },
            { userB: userId }
        ]
    }).select('userA userB').lean();
    const swipedIds = new Set();
    for (const match of matches) {
        const userAId = match.userA?.toString();
        const userBId = match.userB?.toString();
        if (userAId && userAId !== userId) {
            swipedIds.add(userAId);
        }
        if (userBId && userBId !== userId) {
            swipedIds.add(userBId);
        }
    }
    return Array.from(swipedIds);
}
/**
 * Safely gets data from Redis cache
 */
async function safeRedisGet(key) {
    try {
        const redis = (0, client_1.getRedisClient)();
        if (!redis.isOpen) {
            return null;
        }
        const data = await redis.get(key);
        return data && typeof data === 'string' ? JSON.parse(data) : null;
    }
    catch (error) {
        console.warn('Redis GET error:', error);
        return null;
    }
}
/**
 * Safely sets data in Redis cache
 */
async function safeRedisSet(key, data, ttl) {
    try {
        const redis = (0, client_1.getRedisClient)();
        if (!redis.isOpen) {
            return;
        }
        await redis.setEx(key, ttl, JSON.stringify(data));
    }
    catch (error) {
        console.warn('Redis SET error:', error);
    }
}
/**
 * Safely deletes Redis keys matching a pattern
 */
async function safeRedisScanDelete(pattern) {
    try {
        const redis = (0, client_1.getRedisClient)();
        if (!redis.isOpen) {
            return 0;
        }
        let cursor = '0';
        let deletedCount = 0;
        do {
            const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
            cursor = result.cursor;
            const keys = result.keys;
            if (keys.length > 0) {
                const deleted = await redis.del(keys);
                deletedCount += deleted;
            }
        } while (cursor !== '0');
        return deletedCount;
    }
    catch (error) {
        console.warn('Redis SCAN/DELETE error:', error);
        return 0;
    }
}
/**
 * Finds matching candidates for a user using the 4 hard filters.
 *
 * Algorithm (step by step):
 * 1. Validate user ID
 * 2. Fetch current user from database
 * 3. Determine opposite role (has_room ↔ seeking_room)
 * 4. Get IDs of users already swiped by current user
 * 5. Query candidates matching:
 *    - role = opposite role
 *    - city = same city
 *    - budget ranges overlap
 *    - timeline is compatible
 *    - not already swiped
 *    - is active
 * 6. Limit to MAX_RESULTS (15)
 * 7. Return flat array (no scoring, no ranking)
 *
 * @param userId - ID of the user to find matches for
 * @returns Array of candidate profiles
 */
async function findMatches(userId) {
    // Step 1: Validate user ID
    const validUserId = validateUserId(userId);
    // Check cache first
    const cacheKey = `matches:beta:${validUserId}`;
    const cachedResults = await safeRedisGet(cacheKey);
    if (cachedResults) {
        console.log(`[Match] Cache hit for user ${validUserId}`);
        return cachedResults;
    }
    console.log(`[Match] Cache miss for user ${validUserId}, querying database`);
    // Step 2: Fetch current user
    const user = await User_1.UserModel.findById(validUserId).lean();
    if (!user) {
        throw new MatchServiceError('User not found', 404);
    }
    // Check required fields for matching
    if (!user.role) {
        throw new MatchServiceError('User profile incomplete: role is required', 400);
    }
    if (!user.city) {
        throw new MatchServiceError('User profile incomplete: city is required', 400);
    }
    if (!user.budget || (!user.budget.min && !user.budget.max)) {
        throw new MatchServiceError('User profile incomplete: budget is required', 400);
    }
    // Step 3: Determine opposite role
    const targetRole = getOppositeRole(user.role);
    // Step 4: Get already swiped user IDs
    const alreadySwipedIds = await getAlreadySwipedUserIds(validUserId);
    // Step 5: Build MongoDB query with hard filters
    const query = {
        _id: {
            $ne: new mongoose_1.Types.ObjectId(validUserId),
            $nin: alreadySwipedIds.map(id => new mongoose_1.Types.ObjectId(id))
        },
        isActive: true,
        role: targetRole,
        city: user.city,
    };
    // Budget overlap filter
    // We need: candidate.min <= user.max AND candidate.max >= user.min
    const userBudgetMin = Math.min(user.budget.min || 0, user.budget.max || 0);
    const userBudgetMax = Math.max(user.budget.min || 0, user.budget.max || 0);
    query['budget.min'] = { $lte: userBudgetMax };
    query['budget.max'] = { $gte: userBudgetMin };
    // Timeline filter (only if user has timeline set)
    if (user.timeline) {
        const compatibleTimelines = TIMELINE_COMPATIBILITY[user.timeline] || [];
        if (compatibleTimelines.length > 0) {
            query.timeline = { $in: [...compatibleTimelines, null, undefined] };
        }
    }
    // Step 6: Execute query with limit
    const candidates = await User_1.UserModel
        .find(query)
        .select('_id name age gender occupation city budget timeline lifestyle bio photoUrls photos updatedAt')
        .limit(MAX_RESULTS)
        .lean();
    // Step 7: Transform to candidate profiles
    const results = candidates.map(candidate => createCandidateProfile(candidate));
    // Cache results
    await safeRedisSet(cacheKey, results, CACHE_TTL_SECONDS);
    console.log(`[Match] Found ${results.length} candidates for user ${validUserId}`);
    return results;
}
/**
 * Invalidates cached matches for a user
 * Call this when user profile changes or after a swipe
 */
async function invalidateMatchesCacheForUser(userId) {
    const validUserId = validateUserId(userId);
    const pattern = `matches:beta:${validUserId}*`;
    const deletedCount = await safeRedisScanDelete(pattern);
    console.log(`[Match] Invalidated ${deletedCount} cache keys for user ${validUserId}`);
    return deletedCount;
}
/**
 * Gets basic match statistics for a user (no scores)
 */
async function getMatchStats(userId) {
    const validUserId = validateUserId(userId);
    try {
        const matches = await findMatches(validUserId);
        return {
            totalCandidates: matches.length,
            cacheStatus: 'hit',
        };
    }
    catch (error) {
        console.error('[Match] Error getting match stats:', error);
        return {
            totalCandidates: 0,
            cacheStatus: 'error',
        };
    }
}
