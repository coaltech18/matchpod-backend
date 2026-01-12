"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketService = void 0;
exports.initializeSocketService = initializeSocketService;
exports.getSocketService = getSocketService;
const socket_io_1 = require("socket.io");
const authService_1 = require("./authService");
const Chat_1 = require("../models/Chat");
const User_1 = require("../models/User");
const Match_1 = require("../models/Match");
const client_1 = require("../redis/client");
// Phase 4: Socket.io rate limiting
const rateLimit_1 = require("../middleware/rateLimit");
class SocketService {
    getRedis() {
        return (0, client_1.getRedisClient)();
    }
    constructor(httpServer) {
        this.userSockets = new Map(); // userId -> Set of socketIds
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: '*', // Will be configured by CORS middleware
                methods: ['GET', 'POST'],
            },
            pingTimeout: 60000, // 1 minute
        });
        this.setupMiddleware();
        this.setupEventHandlers();
    }
    setupMiddleware() {
        this.io.use(async (socket, next) => {
            try {
                const authSocket = socket;
                const token = socket.handshake.auth.token;
                if (!token) {
                    return next(new Error('Authentication token required'));
                }
                const decoded = await (0, authService_1.verifyToken)(token);
                if (!decoded || !decoded.userId) {
                    return next(new Error('Invalid token'));
                }
                authSocket.userId = decoded.userId;
                authSocket.rooms = new Set();
                // Add user's MUTUAL matches to their allowed rooms
                // SAFETY: Only mutual matches can be joined
                const matches = await Match_1.MatchModel.find({
                    $or: [{ userA: decoded.userId }, { userB: decoded.userId }],
                    status: 'accepted',
                    isMutual: true // SAFETY: Only mutual matches
                });
                matches.forEach((match) => {
                    authSocket.rooms.add(match._id.toString());
                });
                next();
            }
            catch (error) {
                next(new Error('Authentication failed'));
            }
        });
    }
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            const authSocket = socket;
            this.handleConnection(authSocket);
            socket.on('disconnect', () => this.handleDisconnect(authSocket));
            socket.on('join:room', (roomId) => this.handleJoinRoom(authSocket, roomId));
            socket.on('leave:room', (roomId) => this.handleLeaveRoom(authSocket, roomId));
            socket.on('message:send', (data) => this.handleMessage(authSocket, data));
            socket.on('typing:start', (roomId) => this.handleTypingStart(authSocket, roomId));
            socket.on('typing:stop', (roomId) => this.handleTypingStop(authSocket, roomId));
            socket.on('message:read', (data) => this.handleMessageRead(authSocket, data));
        });
    }
    async handleConnection(socket) {
        // Store socket connection
        const userSockets = this.userSockets.get(socket.userId) || new Set();
        userSockets.add(socket.id);
        this.userSockets.set(socket.userId, userSockets);
        // Join user's match rooms
        socket.rooms.forEach(roomId => {
            socket.join(roomId);
        });
        // Update user's online status
        await User_1.UserModel.findByIdAndUpdate(socket.userId, {
            lastActive: new Date(),
            isActive: true,
        });
        // Notify matches about user's online status
        this.io.to(Array.from(socket.rooms)).emit('user:online', {
            userId: socket.userId,
            timestamp: new Date(),
        });
    }
    async handleDisconnect(socket) {
        // Remove socket from stored connections
        const userSockets = this.userSockets.get(socket.userId);
        if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
                this.userSockets.delete(socket.userId);
                // Update user's last active timestamp
                await User_1.UserModel.findByIdAndUpdate(socket.userId, {
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
    handleJoinRoom(socket, roomId) {
        // Phase 4: Rate limit room joins
        if (!rateLimit_1.socketRateLimiters.roomJoins.isAllowed(socket.userId)) {
            return socket.emit('error', {
                message: 'Too many room join attempts. Please slow down.',
                code: 'RATE_LIMITED'
            });
        }
        // SAFETY: Only allow joining rooms the user is authorized for
        if (socket.rooms.has(roomId)) {
            socket.join(roomId);
            socket.emit('room:joined', { roomId });
        }
        else {
            socket.emit('error', { message: 'Not authorized to join this room' });
        }
    }
    handleLeaveRoom(socket, roomId) {
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
    async handleMessage(socket, data) {
        try {
            const { matchId, content, type } = data;
            // Phase 4: Rate limit messages (50/min per user)
            if (!rateLimit_1.socketRateLimiters.messages.isAllowed(socket.userId)) {
                return socket.emit('error', {
                    message: 'You are sending messages too quickly. Please slow down.',
                    code: 'MESSAGE_RATE_LIMITED',
                    remaining: rateLimit_1.socketRateLimiters.messages.getRemaining(socket.userId)
                });
            }
            if (!matchId || !content) {
                return socket.emit('error', { message: 'matchId and content are required' });
            }
            // SAFETY: Verify match exists, is mutual, and user is part of it
            const match = await Match_1.MatchModel.findOne({
                _id: matchId,
                $or: [{ userA: socket.userId }, { userB: socket.userId }],
                status: 'accepted',
                isMutual: true // SAFETY: Only mutual matches can chat
            });
            if (!match) {
                return socket.emit('error', { message: 'Not authorized to send messages in this chat' });
            }
            // Create message in database
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
                    await redis.setEx(`chat:${matchId}:lastMessage`, 86400, // 24 hours
                    JSON.stringify(message));
                }
            }
            catch (redisError) {
                console.warn('Redis cache error:', redisError);
            }
        }
        catch (error) {
            console.error('Message handling error:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }
    handleTypingStart(socket, roomId) {
        // Phase 4: Rate limit typing events
        if (!rateLimit_1.socketRateLimiters.typing.isAllowed(socket.userId)) {
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
    handleTypingStop(socket, roomId) {
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
    async handleMessageRead(socket, data) {
        try {
            const { matchId, messageIds } = data;
            if (!matchId || !messageIds || !Array.isArray(messageIds)) {
                return socket.emit('error', { message: 'matchId and messageIds are required' });
            }
            // SAFETY: Verify match exists and user is part of it
            const match = await Match_1.MatchModel.findOne({
                _id: matchId,
                $or: [{ userA: socket.userId }, { userB: socket.userId }],
                status: 'accepted',
                isMutual: true // SAFETY: Only mutual matches
            });
            if (!match) {
                return socket.emit('error', { message: 'Not authorized for this chat' });
            }
            // Update message status
            await Chat_1.MessageModel.updateMany({
                _id: { $in: messageIds },
                matchId,
                senderId: { $ne: socket.userId },
            }, {
                $set: { status: 'read' },
                $addToSet: { readBy: socket.userId },
            });
            // Reset unread count for the user
            await Chat_1.ChatRoomModel.findOneAndUpdate({ matchId }, {
                [`unreadCount.${socket.userId}`]: 0,
            });
            // Notify room about read messages
            this.io.to(matchId).emit('message:read', {
                userId: socket.userId,
                messageIds,
            });
        }
        catch (error) {
            console.error('Message read handling error:', error);
            socket.emit('error', { message: 'Failed to mark messages as read' });
        }
    }
    // Public methods for external use
    broadcastToUser(userId, event, data) {
        const userSockets = this.userSockets.get(userId);
        if (userSockets) {
            userSockets.forEach(socketId => {
                this.io.to(socketId).emit(event, data);
            });
        }
    }
    broadcastToRoom(roomId, event, data) {
        this.io.to(roomId).emit(event, data);
    }
}
exports.SocketService = SocketService;
let socketService;
function initializeSocketService(httpServer) {
    socketService = new SocketService(httpServer);
    return socketService;
}
function getSocketService() {
    if (!socketService) {
        throw new Error('Socket service not initialized');
    }
    return socketService;
}
