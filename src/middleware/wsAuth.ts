import { Socket } from 'socket.io';
import { verifyToken } from '../services/authService';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { getRedisClient } from '../redis/client';
import { AuthError, RateLimitError } from '../utils/errors';

// Rate limiter for WebSocket connections
const wsRateLimiter = new RateLimiterRedis({
  storeClient: getRedisClient(),
  keyPrefix: 'ws_limit',
  points: 60, // Number of connections/events
  duration: 60, // Per minute
  blockDuration: 60 * 2, // 2 minutes block
});

// Rate limiter for events
const eventRateLimiter = new RateLimiterRedis({
  storeClient: getRedisClient(),
  keyPrefix: 'ws_event_limit',
  points: 120, // Number of events
  duration: 60, // Per minute
  blockDuration: 60 * 5, // 5 minutes block
});

export interface AuthenticatedSocket extends Socket {
  userId: string;
  userRoles: string[];
  deviceId?: string;
}

export async function authenticateWebSocket(
  socket: Socket,
  next: (err?: Error) => void
) {
  try {
    const authSocket = socket as AuthenticatedSocket;
    // Get token from handshake auth
    const token = socket.handshake.auth.token;
    if (!token) {
      throw new AuthError('Authentication token required');
    }

    // Rate limit connection attempts
    const clientIp = socket.handshake.address;
    await wsRateLimiter.consume(clientIp);

    // Verify token
    const decoded = await verifyToken(token);
    if (!decoded || !decoded.userId) {
      throw new AuthError('Invalid token');
    }

    // Attach user data to socket
    authSocket.userId = decoded.userId;
    authSocket.userRoles = decoded.roles || [];
    authSocket.deviceId = socket.handshake.auth.deviceId;

    // Join user's private room
    socket.join(`user:${decoded.userId}`);

    next();
  } catch (error) {
    if (error instanceof RateLimitError) {
      next(new Error('Too many connection attempts. Please try again later.'));
    } else if (error instanceof Error) {
      next(error);
    } else {
      next(new Error('Authentication failed'));
    }
  }
}

export async function validateEvent(
  socket: Socket,
  event: string,
  next: (err?: Error) => void
) {
  try {
    const authSocket = socket as AuthenticatedSocket;
    // Rate limit events per user
    const key = `${authSocket.userId}:${event}`;
    await eventRateLimiter.consume(key);

    // Validate event permissions based on user roles
    if (!hasEventPermission(authSocket.userRoles, event)) {
      throw new AuthError('Unauthorized event');
    }

    next();
  } catch (error) {
    if (error instanceof RateLimitError) {
      next(new Error('Too many events. Please slow down.'));
    } else if (error instanceof Error) {
      next(error);
    } else {
      next(new Error('Event validation failed'));
    }
  }
}

// Event permission mapping
const eventPermissions: { [key: string]: string[] } = {
  'chat:send': ['user'],
  'chat:typing': ['user'],
  'match:action': ['user'],
  'profile:update': ['user'],
  'admin:broadcast': ['admin'],
};

function hasEventPermission(userRoles: string[], event: string): boolean {
  const requiredRoles = eventPermissions[event] || [];
  return requiredRoles.some(role => userRoles.includes(role));
}

// WebSocket event validation schemas
export const eventSchemas = {
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
