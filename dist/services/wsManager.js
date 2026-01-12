"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeWebSocketManager = initializeWebSocketManager;
exports.getWebSocketManager = getWebSocketManager;
const socket_io_1 = require("socket.io");
const wsAuth_1 = require("../middleware/wsAuth");
const errors_1 = require("../utils/errors");
const client_1 = require("../redis/client");
const User_1 = require("../models/User");
const Match_1 = require("../models/Match");
const Chat_1 = require("../models/Chat");
const ajv_1 = __importDefault(require("ajv"));
const ajv = new ajv_1.default();
class WebSocketManager {
    constructor(httpServer) {
        this.redis = (0, client_1.getRedisClient)();
        this.connections = new Map();
        this.validators = {};
        this.io = new socket_io_1.Server(httpServer, {
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
        Object.entries(wsAuth_1.eventSchemas).forEach(([event, schema]) => {
            this.validators[event] = ajv.compile(schema);
        });
        this.setupMiddleware();
        this.setupEventHandlers();
    }
    setupMiddleware() {
        this.io.use(wsAuth_1.authenticateWebSocket);
    }
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            const userId = socket.userId;
            const deviceId = socket.deviceId;
            // Store connection
            this.addConnection(userId, socket.id, deviceId);
            // Update user's online status
            this.updateUserStatus(userId, true);
            // Handle events
            socket.on('disconnect', () => this.handleDisconnect(socket));
            socket.on('error', (error) => this.handleError(socket, error));
            // Chat events
            socket.on('chat:send', async (data) => {
                await this.handleEvent(socket, 'chat:send', data, this.handleChatMessage);
            });
            socket.on('chat:typing', async (data) => {
                await this.handleEvent(socket, 'chat:typing', data, this.handleTypingStatus);
            });
            // Match events
            socket.on('match:action', async (data) => {
                await this.handleEvent(socket, 'match:action', data, this.handleMatchAction);
            });
        });
    }
    async handleEvent(socket, event, data, handler) {
        try {
            // Validate event permission
            await (0, wsAuth_1.validateEvent)(socket, event, (error) => {
                if (error)
                    throw error;
            });
            // Validate event data
            const validate = this.validators[event];
            if (validate && !validate(data)) {
                throw new errors_1.ValidationError('Invalid event data', validate.errors);
            }
            // Handle event
            await handler.call(this, socket, data);
            // Update last activity
            this.updateConnectionActivity(socket.userId, socket.id);
        }
        catch (error) {
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
    async handleChatMessage(socket, data) {
        const { matchId, content, type } = data;
        if (!matchId || !content) {
            throw new errors_1.ValidationError('matchId and content are required');
        }
        // SAFETY: Verify match exists, is mutual, and user is part of it
        const match = await Match_1.MatchModel.findOne({
            _id: matchId,
            $or: [{ userA: socket.userId }, { userB: socket.userId }],
            status: 'accepted',
            isMutual: true // SAFETY: Only mutual matches can chat
        });
        if (!match) {
            throw new errors_1.ValidationError('Not authorized to send messages in this chat');
        }
        // PERSIST MESSAGE TO DATABASE (Fix for missing persistence)
        const message = await Chat_1.MessageModel.create({
            matchId,
            senderId: socket.userId,
            content,
            type: type || 'text',
            status: 'sent'
        });
        // Determine the other user ID
        const otherUserId = match.userA.toString() === socket.userId ? match.userB : match.userA;
        // Update chat room
        await Chat_1.ChatRoomModel.findOneAndUpdate({ matchId }, {
            lastMessage: message._id,
            $inc: {
                [`unreadCount.${otherUserId}`]: 1,
            },
        }, { upsert: true });
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
    async handleTypingStatus(socket, data) {
        const { matchId, isTyping } = data;
        // SAFETY: Verify match exists, is mutual, and user is part of it
        const match = await Match_1.MatchModel.findOne({
            _id: matchId,
            $or: [{ userA: socket.userId }, { userB: socket.userId }],
            status: 'accepted',
            isMutual: true // SAFETY: Only mutual matches
        });
        if (!match) {
            throw new errors_1.ValidationError('Invalid match');
        }
        // Emit typing status to match room
        socket.to(matchId).emit('chat:typing', {
            matchId,
            userId: socket.userId,
            isTyping,
        });
    }
    async handleMatchAction(socket, data) {
        const { targetUserId, action } = data;
        // Verify target user exists
        const targetUser = await User_1.UserModel.findById(targetUserId);
        if (!targetUser) {
            throw new errors_1.ValidationError('Invalid target user');
        }
        // Emit match action to target user
        this.emitToUser(targetUserId, 'match:action', {
            userId: socket.userId,
            action,
            timestamp: new Date(),
        });
    }
    addConnection(userId, socketId, deviceId) {
        const connection = {
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
    removeConnection(userId, socketId) {
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
    updateConnectionActivity(userId, socketId) {
        const userConnections = this.connections.get(userId);
        if (userConnections) {
            userConnections.forEach(conn => {
                if (conn.socketId === socketId) {
                    conn.lastActivity = new Date();
                }
            });
        }
    }
    async updateUserStatus(userId, isOnline) {
        await User_1.UserModel.findByIdAndUpdate(userId, {
            isActive: isOnline,
            lastActive: new Date(),
        });
        // Notify user's MUTUAL matches about status change
        const matches = await Match_1.MatchModel.find({
            $or: [{ userA: userId }, { userB: userId }],
            status: 'accepted',
            isMutual: true // SAFETY: Only notify mutual matches
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
    handleDisconnect(socket) {
        this.removeConnection(socket.userId, socket.id);
    }
    handleError(socket, error) {
        console.error('WebSocket error:', error);
        let errorMessage = 'An unexpected error occurred';
        let errorCode = 'INTERNAL_ERROR';
        if (error instanceof errors_1.ValidationError) {
            errorMessage = error.message;
            errorCode = 'VALIDATION_ERROR';
        }
        else if (error instanceof errors_1.RateLimitError) {
            errorMessage = error.message;
            errorCode = 'RATE_LIMIT_ERROR';
        }
        socket.emit('error', {
            code: errorCode,
            message: errorMessage,
        });
    }
    // Public methods
    emitToUser(userId, event, data) {
        const userConnections = this.connections.get(userId);
        if (userConnections) {
            userConnections.forEach(conn => {
                this.io.to(conn.socketId).emit(event, data);
            });
        }
    }
    emitToRoom(room, event, data) {
        this.io.to(room).emit(event, data);
    }
    broadcastToAll(event, data) {
        this.io.emit(event, data);
    }
    getActiveConnections(userId) {
        return Array.from(this.connections.get(userId) || []);
    }
    isUserOnline(userId) {
        return this.connections.has(userId);
    }
}
let wsManager;
function initializeWebSocketManager(httpServer) {
    wsManager = new WebSocketManager(httpServer);
    return wsManager;
}
function getWebSocketManager() {
    if (!wsManager) {
        throw new Error('WebSocket manager not initialized');
    }
    return wsManager;
}
