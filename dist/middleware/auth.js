"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireOnboardingCompleted = requireOnboardingCompleted;
exports.optionalAuth = optionalAuth;
exports.generateToken = generateToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.extractToken = extractToken;
exports.isTokenExpired = isTokenExpired;
exports.getTokenExpiration = getTokenExpiration;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const User_1 = require("../models/User");
// JWT validation schema
const jwtPayloadSchema = zod_1.z.object({
    id: zod_1.z.string().min(1, 'User ID is required'),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().optional(),
    iat: zod_1.z.number().optional(),
    exp: zod_1.z.number().optional(),
    iss: zod_1.z.string().optional(),
    aud: zod_1.z.string().optional(),
    sub: zod_1.z.string().optional(),
    jti: zod_1.z.string().optional(),
});
// JWT options validation
const jwtOptionsSchema = zod_1.z.object({
    issuer: zod_1.z.string().optional(),
    audience: zod_1.z.string().optional(),
    algorithms: zod_1.z.array(zod_1.z.string()).optional(),
    clockTolerance: zod_1.z.number().optional(),
});
/**
 * Enhanced JWT validation middleware
 */
function requireAuth(req, res, next) {
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
        const options = {
            algorithms: ['HS256'], // Only allow HS256 algorithm
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE,
            clockTolerance: 30, // 30 seconds tolerance
        };
        // Verify JWT token
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(token, secret, options);
        }
        catch (jwtError) {
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
    }
    catch (error) {
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
async function requireOnboardingCompleted(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({
                error: 'Authentication required',
                code: 'UNAUTHORIZED'
            });
        }
        // Fetch user from database to get current onboarding status
        const user = await User_1.UserModel.findById(req.user.id).select('onboardingCompleted').lean();
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
    }
    catch (error) {
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
function optionalAuth(req, res, next) {
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
            const decoded = jsonwebtoken_1.default.verify(token, secret, {
                algorithms: ['HS256'],
                issuer: process.env.JWT_ISSUER,
                audience: process.env.JWT_AUDIENCE,
                clockTolerance: 30,
            });
            const payloadValidation = jwtPayloadSchema.safeParse(decoded);
            if (payloadValidation.success) {
                req.user = {
                    id: payloadValidation.data.id,
                    email: payloadValidation.data.email,
                    phone: payloadValidation.data.phone,
                };
            }
        }
        catch (jwtError) {
            // Ignore JWT errors for optional auth
            console.warn('Optional auth JWT error:', jwtError);
        }
        next();
    }
    catch (error) {
        console.error('Optional authentication middleware error:', error);
        next(); // Continue even on error
    }
}
/**
 * Generate JWT token with proper claims
 */
function generateToken(payload) {
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
    const options = {
        algorithm: 'HS256',
        expiresIn: payload.expiresIn || '15m', // Reduced from 1h to 15min
    };
    return jsonwebtoken_1.default.sign(tokenPayload, secret, options);
}
/**
 * Generate refresh token
 */
function generateRefreshToken(payload) {
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
    const options = {
        algorithm: 'HS256',
        expiresIn: '7d', // Refresh tokens last longer
    };
    return jsonwebtoken_1.default.sign(tokenPayload, secret, options);
}
/**
 * Verify refresh token
 */
function verifyRefreshToken(token) {
    const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_REFRESH_SECRET not configured');
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, secret, {
            algorithms: ['HS256'],
            issuer: process.env.JWT_ISSUER || 'matchpod-api',
            audience: process.env.JWT_AUDIENCE || 'matchpod-app',
            clockTolerance: 30,
        });
        // Check if it's a refresh token
        if (decoded.type !== 'refresh') {
            throw new Error('Invalid token type');
        }
        return decoded;
    }
    catch (error) {
        throw new Error('Invalid refresh token');
    }
}
/**
 * Extract token from request
 */
function extractToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice(7);
}
/**
 * Check if token is expired
 */
function isTokenExpired(token) {
    try {
        const decoded = jsonwebtoken_1.default.decode(token);
        if (!decoded || !decoded.exp) {
            return true;
        }
        return decoded.exp < Math.floor(Date.now() / 1000);
    }
    catch (error) {
        return true;
    }
}
/**
 * Get token expiration time
 */
function getTokenExpiration(token) {
    try {
        const decoded = jsonwebtoken_1.default.decode(token);
        if (!decoded || !decoded.exp) {
            return null;
        }
        return new Date(decoded.exp * 1000);
    }
    catch (error) {
        return null;
    }
}
exports.default = {
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
