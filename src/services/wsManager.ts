import { Server as SocketServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { authenticateWebSocket, validateEvent, eventSchemas } from '../middleware/wsAuth';
import { RateLimitError, ValidationError } from '../utils/errors';
import { getRedisClient } from '../redis/client';
import { UserModel } from '../models/User';
import { MatchModel } from '../models/Match';
import { MessageModel, ChatRoomModel } from '../models/Chat';
import Ajv from 'ajv';

const ajv = new Ajv();

interface WsConnection {
  userId: string;
  socketId: string;
  deviceId?: string;
  connectedAt: Date;
  lastActivity: Date;
}

class WebSocketManager {
  private io: SocketServer;
  private redis = getRedisClient();
  private connections: Map<string, Set<WsConnection>> = new Map();
  private validators: { [event: string]: any } = {};

  constructor(httpServer: HttpServer) {
    this.io = new SocketServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000, // 1 minute
      pingInterval: 25000, // 25 seconds
      transports: ['websocket'],
      allowUpgrades: false,
    });

    // Compile validation schemas
    Object.entries(eventSchemas).forEach(([event, schema]) => {
      this.validators[event] = ajv.compile(schema);
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    this.io.use(authenticateWebSocket);
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: any) => {
      const userId = socket.userId;
      const deviceId = socket.deviceId;

      // Store connection
      this.addConnection(userId, socket.id, deviceId);

      // Update user's online status
      this.updateUserStatus(userId, true);

      // Handle events
      socket.on('disconnect', () => this.handleDisconnect(socket));
      socket.on('error', (error: Error) => this.handleError(socket, error));

      // Chat events
      socket.on('chat:send', async (data: any) => {
        await this.handleEvent(socket, 'chat:send', data, this.handleChatMessage);
      });

      socket.on('chat:typing', async (data: any) => {
        await this.handleEvent(socket, 'chat:typing', data, this.handleTypingStatus);
      });

      // Match events
      socket.on('match:action', async (data: any) => {
        await this.handleEvent(socket, 'match:action', data, this.handleMatchAction);
      });
    });
  }

  private async handleEvent(
    socket: any,
    event: string,
    data: any,
    handler: Function
  ) {
    try {
      // Validate event permission
      await validateEvent(socket, event, (error) => {
        if (error) throw error;
      });

      // Validate event data
      const validate = this.validators[event];
      if (validate && !validate(data)) {
        throw new ValidationError('Invalid event data', validate.errors);
      }

      // Handle event
      await handler.call(this, socket, data);

      // Update last activity
      this.updateConnectionActivity(socket.userId, socket.id);
    } catch (error) {
      this.handleError(socket, error);
    }
  }

  /**
   * Handle chat message send
   * 
   * SAFETY CHECKS:
   * - Match must exist
   * - Match must be mutual (isMutual === true)
   * - User must be part of the match
   * - Message is persisted to database
   */
  private async handleChatMessage(socket: any, data: any) {
    const { matchId, content, type } = data;

    if (!matchId || !content) {
      throw new ValidationError('matchId and content are required');
    }

    // SAFETY: Verify match exists, is mutual, and user is part of it
    const match = await MatchModel.findOne({
      _id: matchId,
      $or: [{ userA: socket.userId }, { userB: socket.userId }],
      status: 'accepted',
      isMutual: true  // SAFETY: Only mutual matches can chat
    });

    if (!match) {
      throw new ValidationError('Not authorized to send messages in this chat');
    }

    // PERSIST MESSAGE TO DATABASE (Fix for missing persistence)
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

    // Emit message to match room
    socket.to(matchId).emit('chat:message', {
      _id: message._id,
      matchId,
      senderId: socket.userId,
      content,
      type: type || 'text',
      status: 'sent',
      timestamp: new Date(),
    });

    // Also emit to sender for confirmation
    socket.emit('chat:message:sent', {
      _id: message._id,
      matchId,
      status: 'sent',
      timestamp: new Date(),
    });
  }

  /**
   * Handle typing status
   * 
   * SAFETY: Verify match before emitting
   */
  private async handleTypingStatus(socket: any, data: any) {
    const { matchId, isTyping } = data;

    // SAFETY: Verify match exists, is mutual, and user is part of it
    const match = await MatchModel.findOne({
      _id: matchId,
      $or: [{ userA: socket.userId }, { userB: socket.userId }],
      status: 'accepted',
      isMutual: true  // SAFETY: Only mutual matches
    });

    if (!match) {
      throw new ValidationError('Invalid match');
    }

    // Emit typing status to match room
    socket.to(matchId).emit('chat:typing', {
      matchId,
      userId: socket.userId,
      isTyping,
    });
  }

  private async handleMatchAction(socket: any, data: any) {
    const { targetUserId, action } = data;

    // Verify target user exists
    const targetUser = await UserModel.findById(targetUserId);
    if (!targetUser) {
      throw new ValidationError('Invalid target user');
    }

    // Emit match action to target user
    this.emitToUser(targetUserId, 'match:action', {
      userId: socket.userId,
      action,
      timestamp: new Date(),
    });
  }

  private addConnection(userId: string, socketId: string, deviceId?: string) {
    const connection: WsConnection = {
      userId,
      socketId,
      deviceId,
      connectedAt: new Date(),
      lastActivity: new Date(),
    };

    const userConnections = this.connections.get(userId) || new Set();
    userConnections.add(connection);
    this.connections.set(userId, userConnections);
  }

  private removeConnection(userId: string, socketId: string) {
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.forEach(conn => {
        if (conn.socketId === socketId) {
          userConnections.delete(conn);
        }
      });

      if (userConnections.size === 0) {
        this.connections.delete(userId);
        this.updateUserStatus(userId, false);
      }
    }
  }

  private updateConnectionActivity(userId: string, socketId: string) {
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.forEach(conn => {
        if (conn.socketId === socketId) {
          conn.lastActivity = new Date();
        }
      });
    }
  }

  private async updateUserStatus(userId: string, isOnline: boolean) {
    await UserModel.findByIdAndUpdate(userId, {
      isActive: isOnline,
      lastActive: new Date(),
    });

    // Notify user's MUTUAL matches about status change
    const matches = await MatchModel.find({
      $or: [{ userA: userId }, { userB: userId }],
      status: 'accepted',
      isMutual: true  // SAFETY: Only notify mutual matches
    });

    matches.forEach(match => {
      const otherUserId = match.userA.toString() === userId ? match.userB : match.userA;
      if (otherUserId) {
        this.emitToUser(otherUserId.toString(), 'user:status', {
          userId,
          isOnline,
          timestamp: new Date(),
        });
      }
    });
  }

  private handleDisconnect(socket: any) {
    this.removeConnection(socket.userId, socket.id);
  }

  private handleError(socket: any, error: any) {
    console.error('WebSocket error:', error);

    let errorMessage = 'An unexpected error occurred';
    let errorCode = 'INTERNAL_ERROR';

    if (error instanceof ValidationError) {
      errorMessage = error.message;
      errorCode = 'VALIDATION_ERROR';
    } else if (error instanceof RateLimitError) {
      errorMessage = error.message;
      errorCode = 'RATE_LIMIT_ERROR';
    }

    socket.emit('error', {
      code: errorCode,
      message: errorMessage,
    });
  }

  // Public methods
  public emitToUser(userId: string, event: string, data: any) {
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.forEach(conn => {
        this.io.to(conn.socketId).emit(event, data);
      });
    }
  }

  public emitToRoom(room: string, event: string, data: any) {
    this.io.to(room).emit(event, data);
  }

  public broadcastToAll(event: string, data: any) {
    this.io.emit(event, data);
  }

  public getActiveConnections(userId: string): WsConnection[] {
    return Array.from(this.connections.get(userId) || []);
  }

  public isUserOnline(userId: string): boolean {
    return this.connections.has(userId);
  }
}

let wsManager: WebSocketManager;

export function initializeWebSocketManager(httpServer: HttpServer) {
  wsManager = new WebSocketManager(httpServer);
  return wsManager;
}

export function getWebSocketManager() {
  if (!wsManager) {
    throw new Error('WebSocket manager not initialized');
  }
  return wsManager;
}
