"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_MATCH_OPTIONS = exports.MATCH_THRESHOLDS = exports.MAX_CANDIDATE_SCAN = exports.MAX_RESULTS = exports.CACHE_TTL_SECONDS = exports.LIFESTYLE_SUB_WEIGHTS = exports.WEIGHTS = void 0;
exports.computeCacheKey = computeCacheKey;
const crypto_1 = __importDefault(require("crypto"));
const matchWeights_1 = require("./matchWeights");
/**
 * Matching algorithm weights configuration (loaded from environment)
 * These weights map to the new configurable system
 */
exports.WEIGHTS = {
    city: matchWeights_1.matchWeights.location,
    budget: matchWeights_1.matchWeights.budget,
    gender: matchWeights_1.matchWeights.gender,
    lifestyle: matchWeights_1.matchWeights.lifestyle + matchWeights_1.matchWeights.cleanliness + matchWeights_1.matchWeights.pets + matchWeights_1.matchWeights.schedule,
};
/**
 * Lifestyle sub-weights for detailed scoring
 * Normalized from the individual weights
 */
const lifestyleTotal = matchWeights_1.matchWeights.lifestyle + matchWeights_1.matchWeights.cleanliness + matchWeights_1.matchWeights.pets + matchWeights_1.matchWeights.schedule;
exports.LIFESTYLE_SUB_WEIGHTS = {
    smoking: matchWeights_1.matchWeights.lifestyle / lifestyleTotal,
    pets: matchWeights_1.matchWeights.pets / lifestyleTotal,
    nightOwl: matchWeights_1.matchWeights.schedule / lifestyleTotal,
    cleanliness: matchWeights_1.matchWeights.cleanliness / lifestyleTotal,
};
/**
 * Cache configuration
 */
exports.CACHE_TTL_SECONDS = 300; // 5 minutes
/**
 * Query limits
 */
exports.MAX_RESULTS = 50;
exports.MAX_CANDIDATE_SCAN = 1000;
/**
 * Computes a cache key hash from filter options
 * @param filters - Filter options object
 * @returns SHA-256 hash of the filters
 */
function computeCacheKey(filters) {
    const sortedFilters = Object.keys(filters)
        .sort()
        .reduce((result, key) => {
        result[key] = filters[key];
        return result;
    }, {});
    const filterString = JSON.stringify(sortedFilters);
    return crypto_1.default.createHash('sha256').update(filterString).digest('hex').substring(0, 16);
}
/**
 * Match quality thresholds
 */
exports.MATCH_THRESHOLDS = {
    EXCELLENT: 80,
    GOOD: 60,
    FAIR: 40,
    POOR: 20,
};
/**
 * Default matching options
 */
exports.DEFAULT_MATCH_OPTIONS = {
    limit: exports.MAX_RESULTS,
    minScore: 0,
    extraFilters: {},
};
