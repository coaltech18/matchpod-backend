import crypto from 'crypto';
import { matchWeights } from './matchWeights';

/**
 * Matching algorithm weights configuration (loaded from environment)
 * These weights map to the new configurable system
 */
export const WEIGHTS = {
  city: matchWeights.location,
  budget: matchWeights.budget,
  gender: matchWeights.gender,
  lifestyle: matchWeights.lifestyle + matchWeights.cleanliness + matchWeights.pets + matchWeights.schedule,
} as const;

/**
 * Lifestyle sub-weights for detailed scoring
 * Normalized from the individual weights
 */
const lifestyleTotal = matchWeights.lifestyle + matchWeights.cleanliness + matchWeights.pets + matchWeights.schedule;
export const LIFESTYLE_SUB_WEIGHTS = {
  smoking: matchWeights.lifestyle / lifestyleTotal,
  pets: matchWeights.pets / lifestyleTotal,
  nightOwl: matchWeights.schedule / lifestyleTotal,
  cleanliness: matchWeights.cleanliness / lifestyleTotal,
} as const;

/**
 * Cache configuration
 */
export const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Query limits
 */
export const MAX_RESULTS = 50;
export const MAX_CANDIDATE_SCAN = 1000;

/**
 * Computes a cache key hash from filter options
 * @param filters - Filter options object
 * @returns SHA-256 hash of the filters
 */
export function computeCacheKey(filters: Record<string, any>): string {
  const sortedFilters = Object.keys(filters)
    .sort()
    .reduce((result, key) => {
      result[key] = filters[key];
      return result;
    }, {} as Record<string, any>);
  
  const filterString = JSON.stringify(sortedFilters);
  return crypto.createHash('sha256').update(filterString).digest('hex').substring(0, 16);
}

/**
 * Match quality thresholds
 */
export const MATCH_THRESHOLDS = {
  EXCELLENT: 80,
  GOOD: 60,
  FAIR: 40,
  POOR: 20,
} as const;

/**
 * Default matching options
 */
export const DEFAULT_MATCH_OPTIONS = {
  limit: MAX_RESULTS,
  minScore: 0,
  extraFilters: {},
} as const;
