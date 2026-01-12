/**
 * Rate Limiting Middleware
 * Phase 4: Backend Hardening - Rate Limiting & Abuse Prevention
 * 
 * Features:
 * - Redis-backed sliding window rate limiting
 * - Fail-open behavior when Redis unavailable (beta safety)
 * - Reviewer-safe limits and error messages
 * - No permanent lockouts
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/errors';
import { getRedisClient } from '../redis/client';

// =============================================================================
// Types
// =============================================================================

interface RateLimitInfo {
  remaining: number;
  reset: number;
  total: number;
}

interface RateLimiterConfig {
  /** Maximum requests allowed in window */
  points: number;
  /** Window duration in seconds */
  duration: number;
  /** Cooldown duration in seconds after limit exceeded */
  blockDuration: number;
}

// =============================================================================
// Rate Limiter Class
// =============================================================================

class RateLimiter {
  private readonly prefix: string;
  private readonly points: number;
  private readonly duration: number;
  private readonly blockDuration: number;

  constructor(prefix: string, config: RateLimiterConfig) {
    this.prefix = prefix;
    this.points = config.points;
    this.duration = config.duration;
    this.blockDuration = config.blockDuration;
  }

  private getKey(identifier: string): string {
    return `${this.prefix}:${identifier}`;
  }

  async consume(identifier: string): Promise<RateLimitInfo> {
    const redis = getRedisClient();
    const key = this.getKey(identifier);
    const now = Date.now();
    const clearBefore = now - this.duration * 1000;

    const multi = redis.multi();

    // Remove old entries (sliding window)
    multi.zRemRangeByScore(key, 0, clearBefore);

    // Add new request
    multi.zAdd(key, { score: now, value: now.toString() });

    // Get count
    multi.zCard(key);

    // Set expiry to prevent stale keys
    multi.expire(key, this.duration + this.blockDuration);

    const results = await multi.exec();
    const count = results ? (results[2] as any) || 0 : 0;

    if (count > this.points) {
      const resetAfter = Math.ceil(this.blockDuration);
      throw new RateLimitError('Too many requests. Please try again later.', {
        resetAfter,
        limit: this.points,
        remaining: 0,
      });
    }

    return {
      remaining: Math.max(0, this.points - count),
      reset: Math.ceil(this.duration),
      total: this.points,
    };
  }
}

// =============================================================================
// Rate Limit Configurations
// Phase 4: Reviewer-safe limits
// =============================================================================

const RATE_LIMIT_CONFIGS = {
  // General API rate limiting
  api: { points: 100, duration: 60, blockDuration: 300 },

  // Phase 4: Auth endpoint (increased for reviewer safety)
  // Was: 5/15min → Now: 10/15min
  auth: { points: 10, duration: 900, blockDuration: 1800 },

  // Phase 4: OTP requests (increased for reviewer safety)
  // Was: 3/10min → Now: 5/10min
  otp: { points: 5, duration: 600, blockDuration: 900 },

  // Phase 4: NEW - Login attempts per phone/email
  login: { points: 5, duration: 300, blockDuration: 600 },

  // Phase 4: NEW - Refresh token requests
  refresh: { points: 10, duration: 60, blockDuration: 300 },

  // Phase 4: NEW - Registration per IP
  register: { points: 3, duration: 3600, blockDuration: 3600 },

  // Chat message rate limiting
  chat: { points: 50, duration: 60, blockDuration: 300 },

  // Swipe rate limiting
  swipe: { points: 100, duration: 60, blockDuration: 600 },
} as const;

// Create rate limiter instances
const rateLimiters = {
  api: new RateLimiter('rl_api', RATE_LIMIT_CONFIGS.api),
  auth: new RateLimiter('rl_auth', RATE_LIMIT_CONFIGS.auth),
  otp: new RateLimiter('rl_otp', RATE_LIMIT_CONFIGS.otp),
  login: new RateLimiter('rl_login', RATE_LIMIT_CONFIGS.login),
  refresh: new RateLimiter('rl_refresh', RATE_LIMIT_CONFIGS.refresh),
  register: new RateLimiter('rl_register', RATE_LIMIT_CONFIGS.register),
  chat: new RateLimiter('rl_chat', RATE_LIMIT_CONFIGS.chat),
  swipe: new RateLimiter('rl_swipe', RATE_LIMIT_CONFIGS.swipe),
};

// =============================================================================
// Helpers
// =============================================================================

/**
 * Extract client IP from request, respecting proxy headers
 */
function getClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

/**
 * Check if Redis is available for rate limiting
 */
function isRedisAvailable(): boolean {
  try {
    const redis = getRedisClient();
    return redis.isOpen;
  } catch {
    return false;
  }
}

// =============================================================================
// Middleware Factory
// =============================================================================

type RateLimiterType = keyof typeof rateLimiters;

/**
 * Create rate limiting middleware
 * 
 * Features:
 * - Redis-backed when available
 * - Fail-open when Redis unavailable (beta safety)
 * - Proper rate limit headers
 * - Reviewer-safe 429 responses
 */
function createRateLimiter(type: RateLimiterType, getIdentifier?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Phase 4: Fail-open when Redis unavailable
      if (!isRedisAvailable()) {
        console.log(`[Rate Limit] Redis unavailable, skipping ${type} limit (fail-open)`);
        return next();
      }

      const limiter = rateLimiters[type];
      const identifier = getIdentifier ? getIdentifier(req) : getClientIp(req);

      const result = await limiter.consume(identifier);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': result.total.toString(),
        'X-RateLimit-Remaining': result.remaining.toString(),
        'X-RateLimit-Reset': result.reset.toString(),
      });

      next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        // Phase 4: Reviewer-safe 429 response
        res.set({
          'X-RateLimit-Limit': error.details.limit.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': error.details.resetAfter.toString(),
          'Retry-After': error.details.resetAfter.toString(),
        });

        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: error.message,
            retryAfter: error.details.resetAfter,
          },
        });
      }

      // Phase 4: Fail-open on any error (beta safety)
      console.warn(`[Rate Limit] Error in ${type} limiter, skipping (fail-open):`, error);
      next();
    }
  };
}

// =============================================================================
// Exported Middleware
// =============================================================================

/** General API rate limiting - 100 req/min */
export const apiRateLimit = createRateLimiter('api');

/** Auth endpoint rate limiting - 10 req/15min (Phase 4: reviewer-safe) */
export const authRateLimit = createRateLimiter('auth');

/** OTP request rate limiting - 5 req/10min (Phase 4: reviewer-safe) */
export const otpRateLimit = createRateLimiter('otp');

/** 
 * Login attempt rate limiting - 5 attempts/5min per phone/email
 * Phase 4: NEW - Prevents brute force on specific accounts
 */
export const loginRateLimit = createRateLimiter('login', (req) => {
  // Rate limit by phone number or email, falling back to IP
  const phone = req.body?.phoneNumber || req.body?.phone;
  const email = req.body?.email;
  return phone || email || getClientIp(req);
});

/**
 * Refresh token rate limiting - 10 req/min
 * Phase 4: NEW - Prevents token refresh spam
 */
export const refreshRateLimit = createRateLimiter('refresh');

/**
 * Registration rate limiting - 3 accounts/hour per IP
 * Phase 4: NEW - Prevents account creation abuse
 */
export const registerRateLimit = createRateLimiter('register');

/** Chat message rate limiting - 50 msg/min */
export const chatRateLimit = createRateLimiter('chat');

/** Swipe rate limiting - 100 swipes/min */
export const swipeRateLimit = createRateLimiter('swipe');

// =============================================================================
// Socket.io Rate Limiting Helpers
// Phase 4: Server-side throttling for Socket.io
// =============================================================================

/**
 * Socket.io rate limit configuration
 */
export const SOCKET_RATE_LIMITS = {
  /** Maximum messages per minute per user */
  MESSAGES_PER_MINUTE: 50,

  /** Maximum typing events per minute */
  TYPING_PER_MINUTE: 60,

  /** Maximum room joins per minute */
  ROOM_JOINS_PER_MINUTE: 10,

  /** Throttle window in milliseconds */
  WINDOW_MS: 60000,
} as const;

/**
 * In-memory rate limiter for Socket.io
 * Used when Redis is unavailable or for simple throttling
 */
export class SocketRateLimiter {
  private counts: Map<string, { count: number; resetAt: number }> = new Map();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number = SOCKET_RATE_LIMITS.WINDOW_MS) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Check if action is allowed, returns false if rate limited
   */
  isAllowed(userId: string): boolean {
    const now = Date.now();
    const entry = this.counts.get(userId);

    if (!entry || now >= entry.resetAt) {
      // Start new window
      this.counts.set(userId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Get remaining attempts for a user
   */
  getRemaining(userId: string): number {
    const entry = this.counts.get(userId);
    if (!entry || Date.now() >= entry.resetAt) {
      return this.limit;
    }
    return Math.max(0, this.limit - entry.count);
  }

  /**
   * Clear old entries (call periodically for memory management)
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.counts.entries()) {
      if (now >= entry.resetAt) {
        this.counts.delete(key);
      }
    }
  }
}

// Pre-configured socket rate limiters
export const socketRateLimiters = {
  messages: new SocketRateLimiter(SOCKET_RATE_LIMITS.MESSAGES_PER_MINUTE),
  typing: new SocketRateLimiter(SOCKET_RATE_LIMITS.TYPING_PER_MINUTE),
  roomJoins: new SocketRateLimiter(SOCKET_RATE_LIMITS.ROOM_JOINS_PER_MINUTE),
};

// Cleanup interval for socket rate limiters (every 5 minutes)
setInterval(() => {
  socketRateLimiters.messages.cleanup();
  socketRateLimiters.typing.cleanup();
  socketRateLimiters.roomJoins.cleanup();
}, 5 * 60 * 1000);