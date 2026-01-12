import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UserModel } from '../models/User';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    phone?: string;
    onboardingCompleted?: boolean;
  };
}

// JWT validation schema
const jwtPayloadSchema = z.object({
  id: z.string().min(1, 'User ID is required'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
  iss: z.string().optional(),
  aud: z.string().optional(),
  sub: z.string().optional(),
  jti: z.string().optional(),
});

// JWT options validation
const jwtOptionsSchema = z.object({
  issuer: z.string().optional(),
  audience: z.string().optional(),
  algorithms: z.array(z.string()).optional(),
  clockTolerance: z.number().optional(),
});

/**
 * Enhanced JWT validation middleware
 */
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid authorization header',
        code: 'MISSING_TOKEN'
      });
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    if (!token) {
      return res.status(401).json({
        error: 'Token is required',
        code: 'EMPTY_TOKEN'
      });
    }

    // Get JWT secret from environment
    const secret = process.env.JWT_SECRET;
    if (!secret || secret === 'dev_secret_change_me') {
      console.error('JWT_SECRET not properly configured');
      return res.status(500).json({
        error: 'Server configuration error',
        code: 'CONFIG_ERROR'
      });
    }

    // JWT validation options
    const options: jwt.VerifyOptions = {
      algorithms: ['HS256'], // Only allow HS256 algorithm
      issuer: process.env.JWT_ISSUER,
      audience: process.env.JWT_AUDIENCE,
      clockTolerance: 30, // 30 seconds tolerance
    };

    // Verify JWT token
    let decoded: any;
    try {
      decoded = jwt.verify(token, secret, options);
    } catch (jwtError: any) {
      console.error('JWT verification failed:', jwtError.message);

      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Token has expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }

      if (jwtError.name === 'NotBeforeError') {
        return res.status(401).json({
          error: 'Token not active yet',
          code: 'TOKEN_NOT_ACTIVE'
        });
      }

      return res.status(401).json({
        error: 'Token verification failed',
        code: 'TOKEN_VERIFICATION_FAILED'
      });
    }

    // Validate JWT payload structure
    const payloadValidation = jwtPayloadSchema.safeParse(decoded);
    if (!payloadValidation.success) {
      console.error('Invalid JWT payload structure:', payloadValidation.error);
      return res.status(401).json({
        error: 'Invalid token payload',
        code: 'INVALID_PAYLOAD'
      });
    }

    const payload = payloadValidation.data;

    // Check token expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return res.status(401).json({
        error: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    // Check token not before
    if (payload.iat && payload.iat > Math.floor(Date.now() / 1000)) {
      return res.status(401).json({
        error: 'Token not valid yet',
        code: 'TOKEN_NOT_VALID'
      });
    }

    // Validate issuer if configured
    if (process.env.JWT_ISSUER && payload.iss !== process.env.JWT_ISSUER) {
      return res.status(401).json({
        error: 'Invalid token issuer',
        code: 'INVALID_ISSUER'
      });
    }

    // Validate audience if configured
    if (process.env.JWT_AUDIENCE && payload.aud !== process.env.JWT_AUDIENCE) {
      return res.status(401).json({
        error: 'Invalid token audience',
        code: 'INVALID_AUDIENCE'
      });
    }

    // Attach user information to request
    req.user = {
      id: payload.id,
      email: payload.email,
      phone: payload.phone,
    };

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Middleware to require onboarding completion
 * Must be used AFTER requireAuth middleware
 * Fetches user from DB and checks onboardingCompleted status
 */
export async function requireOnboardingCompleted(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
    }

    // Fetch user from database to get current onboarding status
    const user = await UserModel.findById(req.user.id).select('onboardingCompleted').lean();

    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    // Explicit check: onboardingCompleted must be exactly true
    // undefined, null, or false all mean onboarding is incomplete
    if (user.onboardingCompleted !== true) {
      return res.status(403).json({
        code: 'ONBOARDING_INCOMPLETE',
        message: 'Please complete onboarding to continue'
      });
    }

    // Attach onboarding status to request for downstream use
    req.user.onboardingCompleted = true;

    next();
  } catch (error) {
    console.error('Onboarding check middleware error:', error);
    return res.status(500).json({
      error: 'Failed to verify onboarding status',
      code: 'ONBOARDING_CHECK_ERROR'
    });
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = authHeader.slice(7);
    if (!token) {
      return next(); // Continue without authentication
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(); // Continue without authentication
    }

    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
        clockTolerance: 30,
      }) as any;

      const payloadValidation = jwtPayloadSchema.safeParse(decoded);
      if (payloadValidation.success) {
        req.user = {
          id: payloadValidation.data.id,
          email: payloadValidation.data.email,
          phone: payloadValidation.data.phone,
        };
      }
    } catch (jwtError) {
      // Ignore JWT errors for optional auth
      console.warn('Optional auth JWT error:', jwtError);
    }

    next();
  } catch (error) {
    console.error('Optional authentication middleware error:', error);
    next(); // Continue even on error
  }
}

/**
 * Generate JWT token with proper claims
 */
export function generateToken(payload: {
  id: string;
  email?: string;
  phone?: string;
  expiresIn?: string | number;
}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  const now = Math.floor(Date.now() / 1000);

  const tokenPayload = {
    id: payload.id,
    email: payload.email,
    phone: payload.phone,
    iat: now,
    nbf: now, // Not before: token is valid immediately
    iss: process.env.JWT_ISSUER || 'matchpod-api',
    aud: process.env.JWT_AUDIENCE || 'matchpod-app',
    jti: `at_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };

  const options: jwt.SignOptions = {
    algorithm: 'HS256',
    expiresIn: payload.expiresIn || '15m' as any, // Reduced from 1h to 15min
  };

  return jwt.sign(tokenPayload, secret, options);
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(payload: {
  id: string;
  email?: string;
  phone?: string;
  deviceId?: string;
}): string {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET not configured');
  }

  const now = Math.floor(Date.now() / 1000);

  const tokenPayload = {
    id: payload.id,
    email: payload.email,
    phone: payload.phone,
    type: 'refresh',
    deviceId: payload.deviceId,
    iat: now,
    nbf: now,
    iss: process.env.JWT_ISSUER || 'matchpod-api',
    aud: process.env.JWT_AUDIENCE || 'matchpod-app',
    jti: `rt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };

  const options: jwt.SignOptions = {
    algorithm: 'HS256',
    expiresIn: '7d', // Refresh tokens last longer
  };

  return jwt.sign(tokenPayload, secret, options);
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): any {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET not configured');
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: process.env.JWT_ISSUER || 'matchpod-api',
      audience: process.env.JWT_AUDIENCE || 'matchpod-app',
      clockTolerance: 30,
    }) as any;

    // Check if it's a refresh token
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    return decoded;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}

/**
 * Extract token from request
 */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7);
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) {
      return true;
    }

    return decoded.exp < Math.floor(Date.now() / 1000);
  } catch (error) {
    return true;
  }
}

/**
 * Get token expiration time
 */
export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  } catch (error) {
    return null;
  }
}

export default {
  requireAuth,
  requireOnboardingCompleted,
  optionalAuth,
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  extractToken,
  isTokenExpired,
  getTokenExpiration,
};