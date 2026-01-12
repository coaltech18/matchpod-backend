"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventSchemas = void 0;
exports.authenticateWebSocket = authenticateWebSocket;
exports.validateEvent = validateEvent;
const authService_1 = require("../services/authService");
const rate_limiter_flexible_1 = require("rate-limiter-flexible");
const client_1 = require("../redis/client");
const errors_1 = require("../utils/errors");
// Rate limiter for WebSocket connections
const wsRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: (0, client_1.getRedisClient)(),
    keyPrefix: 'ws_limit',
    points: 60, // Number of connections/events
    duration: 60, // Per minute
    blockDuration: 60 * 2, // 2 minutes block
});
// Rate limiter for events
const eventRateLimiter = new rate_limiter_flexible_1.RateLimiterRedis({
    storeClient: (0, client_1.getRedisClient)(),
    keyPrefix: 'ws_event_limit',
    points: 120, // Number of events
    duration: 60, // Per minute
    blockDuration: 60 * 5, // 5 minutes block
});
async function authenticateWebSocket(socket, next) {
    try {
        const authSocket = socket;
        // Get token from handshake auth
        const token = socket.handshake.auth.token;
        if (!token) {
            throw new errors_1.AuthError('Authentication token required');
        }
        // Rate limit connection attempts
        const clientIp = socket.handshake.address;
        await wsRateLimiter.consume(clientIp);
        // Verify token
        const decoded = await (0, authService_1.verifyToken)(token);
        if (!decoded || !decoded.userId) {
            throw new errors_1.AuthError('Invalid token');
        }
        // Attach user data to socket
        authSocket.userId = decoded.userId;
        authSocket.userRoles = decoded.roles || [];
        authSocket.deviceId = socket.handshake.auth.deviceId;
        // Join user's private room
        socket.join(`user:${decoded.userId}`);
        next();
    }
    catch (error) {
        if (error instanceof errors_1.RateLimitError) {
            next(new Error('Too many connection attempts. Please try again later.'));
        }
        else if (error instanceof Error) {
            next(error);
        }
        else {
            next(new Error('Authentication failed'));
        }
    }
}
async function validateEvent(socket, event, next) {
    try {
        const authSocket = socket;
        // Rate limit events per user
        const key = `${authSocket.userId}:${event}`;
        await eventRateLimiter.consume(key);
        // Validate event permissions based on user roles
        if (!hasEventPermission(authSocket.userRoles, event)) {
            throw new errors_1.AuthError('Unauthorized event');
        }
        next();
    }
    catch (error) {
        if (error instanceof errors_1.RateLimitError) {
            next(new Error('Too many events. Please slow down.'));
        }
        else if (error instanceof Error) {
            next(error);
        }
        else {
            next(new Error('Event validation failed'));
        }
    }
}
// Event permission mapping
const eventPermissions = {
    'chat:send': ['user'],
    'chat:typing': ['user'],
    'match:action': ['user'],
    'profile:update': ['user'],
    'admin:broadcast': ['admin'],
};
function hasEventPermission(userRoles, event) {
    const requiredRoles = eventPermissions[event] || [];
    return requiredRoles.some(role => userRoles.includes(role));
}
// WebSocket event validation schemas
exports.eventSchemas = {
    'chat:send': {
        type: 'object',
        required: ['matchId', 'content', 'type'],
        properties: {
            matchId: { type: 'string', minLength: 24, maxLength: 24 },
            content: { type: 'string', minLength: 1, maxLength: 2000 },
            type: { type: 'string', enum: ['text', 'image', 'location'] },
        },
    },
    'chat:typing': {
        type: 'object',
        required: ['matchId', 'isTyping'],
        properties: {
            matchId: { type: 'string', minLength: 24, maxLength: 24 },
            isTyping: { type: 'boolean' },
        },
    },
    'match:action': {
        type: 'object',
        required: ['targetUserId', 'action'],
        properties: {
            targetUserId: { type: 'string', minLength: 24, maxLength: 24 },
            action: { type: 'string', enum: ['like', 'pass'] },
        },
    },
};
