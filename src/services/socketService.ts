import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './authService';
import { ChatRoomModel, MessageModel } from '../models/Chat';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { getRedisClient } from '../redis/client';
// Phase 4: Socket.io rate limiting
import { socketRateLimiters, SOCKET_RATE_LIMITS } from '../middleware/rateLimit';

interface AuthenticatedSocket extends Socket {
  userId: string;
  rooms: Set<string>;
}

interface IMatch {
  _id: any;
  userA: any;
  userB: any;
  status: string;
  isMutual: boolean;
}

export class SocketService {
  private io: Server;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  private getRedis() {
    return getRedisClient();
  }

  constructor(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*', // Will be configured by CORS middleware
        methods: ['GET', 'POST'],
      },
      pingTimeout: 60000, // 1 minute
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const authSocket = socket as AuthenticatedSocket;
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = await verifyToken(token);
        if (!decoded || !decoded.userId) {
          return next(new Error('Invalid token'));
        }

        authSocket.userId = decoded.userId;
        authSocket.rooms = new Set();

        // Add user's MUTUAL matches to their allowed rooms
        // SAFETY: Only mutual matches can be joined
        const matches = await MatchModel.find({
          $or: [{ userA: decoded.userId }, { userB: decoded.userId }],
          status: 'accepted',
          isMutual: true  // SAFETY: Only mutual matches
        }) as IMatch[];

        matches.forEach((match: IMatch) => {
          authSocket.rooms.add(match._id.toString());
        });

        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const authSocket = socket as AuthenticatedSocket;
      this.handleConnection(authSocket);

      socket.on('disconnect', () => this.handleDisconnect(authSocket));
      socket.on('join:room', (roomId: string) => this.handleJoinRoom(authSocket, roomId));
      socket.on('leave:room', (roomId: string) => this.handleLeaveRoom(authSocket, roomId));
      socket.on('message:send', (data) => this.handleMessage(authSocket, data));
      socket.on('typing:start', (roomId: string) => this.handleTypingStart(authSocket, roomId));
      socket.on('typing:stop', (roomId: string) => this.handleTypingStop(authSocket, roomId));
      socket.on('message:read', (data) => this.handleMessageRead(authSocket, data));
    });
  }

  private async handleConnection(socket: AuthenticatedSocket) {
    // Store socket connection
    const userSockets = this.userSockets.get(socket.userId) || new Set();
    userSockets.add(socket.id);
    this.userSockets.set(socket.userId, userSockets);

    // Join user's match rooms
    socket.rooms.forEach(roomId => {
      socket.join(roomId);
    });

    // Update user's online status
    await UserModel.findByIdAndUpdate(socket.userId, {
      lastActive: new Date(),
      isActive: true,
    });

    // Notify matches about user's online status
    this.io.to(Array.from(socket.rooms)).emit('user:online', {
      userId: socket.userId,
      timestamp: new Date(),
    });
  }

  private async handleDisconnect(socket: AuthenticatedSocket) {
    // Remove socket from stored connections
    const userSockets = this.userSockets.get(socket.userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        this.userSockets.delete(socket.userId);

        // Update user's last active timestamp
        await UserModel.findByIdAndUpdate(socket.userId, {
          lastActive: new Date(),
          isActive: false,
        });

        // Notify matches about user's offline status
        this.io.to(Array.from(socket.rooms)).emit('user:offline', {
          userId: socket.userId,
          timestamp: new Date(),
        });
      }
    }
  }

  private handleJoinRoom(socket: AuthenticatedSocket, roomId: string) {
    // Phase 4: Rate limit room joins
    if (!socketRateLimiters.roomJoins.isAllowed(socket.userId)) {
      return socket.emit('error', {
        message: 'Too many room join attempts. Please slow down.',
        code: 'RATE_LIMITED'
      });
    }

    // SAFETY: Only allow joining rooms the user is authorized for
    if (socket.rooms.has(roomId)) {
      socket.join(roomId);
      socket.emit('room:joined', { roomId });
    } else {
      socket.emit('error', { message: 'Not authorized to join this room' });
    }
  }

  private handleLeaveRoom(socket: AuthenticatedSocket, roomId: string) {
    socket.leave(roomId);
    socket.emit('room:left', { roomId });
  }

  /**
   * Handle message send via socket
   * 
   * SAFETY CHECKS:
   * - Match must exist
   * - Match must be mutual (isMutual === true)
   * - User must be part of the match
   */
  private async handleMessage(
    socket: AuthenticatedSocket,
    data: {
      matchId: string;
      content: string;
      type: 'text' | 'image' | 'location';
    }
  ) {
    try {
      const { matchId, content, type } = data;

      // Phase 4: Rate limit messages (50/min per user)
      if (!socketRateLimiters.messages.isAllowed(socket.userId)) {
        return socket.emit('error', {
          message: 'You are sending messages too quickly. Please slow down.',
          code: 'MESSAGE_RATE_LIMITED',
          remaining: socketRateLimiters.messages.getRemaining(socket.userId)
        });
      }

      if (!matchId || !content) {
        return socket.emit('error', { message: 'matchId and content are required' });
      }

      // SAFETY: Verify match exists, is mutual, and user is part of it
      const match = await MatchModel.findOne({
        _id: matchId,
        $or: [{ userA: socket.userId }, { userB: socket.userId }],
        status: 'accepted',
        isMutual: true  // SAFETY: Only mutual matches can chat
      });

      if (!match) {
        return socket.emit('error', { message: 'Not authorized to send messages in this chat' });
      }

      // Create message in database
      const message = await MessageModel.create({
        matchId,
        senderId: socket.userId,
        content,
        type: type || 'text',
        status: 'sent'
      });

      // Determine the other user ID
      const otherUserId = match.userA.toString() === socket.userId ? match.userB : match.userA;

      // Update chat room
      await ChatRoomModel.findOneAndUpdate(
        { matchId },
        {
          lastMessage: message._id,
          $inc: {
            [`unreadCount.${otherUserId}`]: 1,
          },
        },
        { upsert: true }
      );

      // Broadcast message to room
      this.io.to(matchId).emit('message:new', {
        message: {
          _id: message._id,
          matchId,
          senderId: socket.userId,
          content,
          type: type || 'text',
          status: 'sent',
          createdAt: message.createdAt
        }
      });

      // Store in Redis for faster recent message retrieval
      try {
        const redis = this.getRedis();
        if (redis.isOpen) {
          await redis.setEx(
            `chat:${matchId}:lastMessage`,
            86400, // 24 hours
            JSON.stringify(message)
          );
        }
      } catch (redisError) {
        console.warn('Redis cache error:', redisError);
      }

    } catch (error) {
      console.error('Message handling error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  }

  private handleTypingStart(socket: AuthenticatedSocket, roomId: string) {
    // Phase 4: Rate limit typing events
    if (!socketRateLimiters.typing.isAllowed(socket.userId)) {
      // Silently ignore excessive typing events (no error needed)
      return;
    }

    // SAFETY: Only emit to rooms user is authorized for
    if (socket.rooms.has(roomId)) {
      socket.to(roomId).emit('typing:start', {
        userId: socket.userId,
        roomId,
      });
    }
  }

  private handleTypingStop(socket: AuthenticatedSocket, roomId: string) {
    // SAFETY: Only emit to rooms user is authorized for
    if (socket.rooms.has(roomId)) {
      socket.to(roomId).emit('typing:stop', {
        userId: socket.userId,
        roomId,
      });
    }
  }

  /**
   * Handle marking messages as read
   * 
   * SAFETY CHECKS:
   * - Match must exist
   * - Match must be mutual
   * - User must be part of the match
   */
  private async handleMessageRead(
    socket: AuthenticatedSocket,
    data: { matchId: string; messageIds: string[] }
  ) {
    try {
      const { matchId, messageIds } = data;

      if (!matchId || !messageIds || !Array.isArray(messageIds)) {
        return socket.emit('error', { message: 'matchId and messageIds are required' });
      }

      // SAFETY: Verify match exists and user is part of it
      const match = await MatchModel.findOne({
        _id: matchId,
        $or: [{ userA: socket.userId }, { userB: socket.userId }],
        status: 'accepted',
        isMutual: true  // SAFETY: Only mutual matches
      });

      if (!match) {
        return socket.emit('error', { message: 'Not authorized for this chat' });
      }

      // Update message status
      await MessageModel.updateMany(
        {
          _id: { $in: messageIds },
          matchId,
          senderId: { $ne: socket.userId },
        },
        {
          $set: { status: 'read' },
          $addToSet: { readBy: socket.userId },
        }
      );

      // Reset unread count for the user
      await ChatRoomModel.findOneAndUpdate(
        { matchId },
        {
          [`unreadCount.${socket.userId}`]: 0,
        }
      );

      // Notify room about read messages
      this.io.to(matchId).emit('message:read', {
        userId: socket.userId,
        messageIds,
      });

    } catch (error) {
      console.error('Message read handling error:', error);
      socket.emit('error', { message: 'Failed to mark messages as read' });
    }
  }

  // Public methods for external use
  public broadcastToUser(userId: string, event: string, data: any) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.forEach(socketId => {
        this.io.to(socketId).emit(event, data);
      });
    }
  }

  public broadcastToRoom(roomId: string, event: string, data: any) {
    this.io.to(roomId).emit(event, data);
  }
}

let socketService: SocketService;

export function initializeSocketService(httpServer: HttpServer) {
  socketService = new SocketService(httpServer);
  return socketService;
}

export function getSocketService() {
  if (!socketService) {
    throw new Error('Socket service not initialized');
  }
  return socketService;
}
