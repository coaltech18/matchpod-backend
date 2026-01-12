"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
// Phase 2: Backend Hardening - Environment validation (MUST be first)
const env_1 = require("./config/env");
const config = (0, env_1.validateEnv)();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const helmet_1 = __importDefault(require("helmet"));
const http_1 = require("http");
const socketService_1 = require("./services/socketService");
// Phase 3: Backend Hardening - Database configuration
const database_1 = require("./config/database");
// Phase 1: Backend Hardening - Error handling and shutdown
const errorHandler_1 = require("./middleware/errorHandler");
const shutdown_1 = require("./shutdown");
// Register process-level safety handlers EARLY (before any async operations)
(0, shutdown_1.registerProcessHandlers)();
const auth_1 = require("./routes/auth");
const users_1 = require("./routes/users");
const matches_1 = require("./routes/matches");
const chats_1 = require("./routes/chats");
const profile_1 = require("./routes/profile");
const images_1 = require("./routes/images");
const notifications_1 = require("./routes/notifications");
const onboarding_1 = require("./routes/onboarding");
const health_1 = require("./routes/health");
// Import models to ensure they're registered with Mongoose
require("./models/RefreshToken");
require("./models/PushToken");
const cors_2 = require("./security/cors");
const validate_1 = require("./middleware/validate");
const rateLimit_1 = require("./middleware/rateLimit");
// Note: Redis client is dynamically imported in startup if ENABLE_REDIS is true
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Initialize Socket.io
(0, socketService_1.initializeSocketService)(httpServer);
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));
// CORS configuration
app.use((0, cors_1.default)((0, cors_2.getCorsOptions)()));
// Add security headers
app.use((req, res, next) => {
    Object.entries(cors_2.corsSecurityHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
    next();
});
// Input sanitization
app.use(validate_1.sanitizeInput);
// Apply default API rate limiting
app.use('/api', rateLimit_1.apiRateLimit);
// Body parsing with size limits
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, morgan_1.default)(config.NODE_ENV === 'production' ? 'combined' : 'dev'));
// API info route
app.get('/api', (req, res) => {
    res.json({
        message: 'MatchPod API is running',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            users: '/api/users',
            matches: '/api/matches',
            chats: '/api/chats',
            profile: '/api/profile',
            images: '/api/images',
            notifications: '/api/notifications',
            onboarding: '/api/onboarding'
        }
    });
});
app.use('/api/health', health_1.healthRouter);
app.use('/api/auth', auth_1.router);
app.use('/api/users', users_1.router);
app.use('/api/matches', matches_1.router);
app.use('/api/chats', chats_1.router);
app.use('/api/profile', profile_1.router);
app.use('/api/images', images_1.router);
app.use('/api/notifications', notifications_1.router);
app.use('/api/onboarding', onboarding_1.router);
// Phase 1: Backend Hardening - Error handling middleware (MUST be last)
app.use(errorHandler_1.notFoundHandler);
app.use(errorHandler_1.globalErrorHandler);
// Phase 2: Use validated config for PORT and MONGODB_URI
const { PORT, MONGODB_URI } = config;
// Phase 3: Connect to MongoDB with hardened settings
(0, database_1.connectToDatabase)(MONGODB_URI)
    .then(async () => {
    console.log('Connected to MongoDB with hardened settings');
    // Initialize Redis client (only if enabled)
    if (config.ENABLE_REDIS) {
        console.log('Initializing Redis client...');
        const { getRedisClient, isRedisAvailable } = await Promise.resolve().then(() => __importStar(require('./redis/client')));
        getRedisClient();
        // Test Redis connection
        try {
            const redisAvailable = await isRedisAvailable();
            if (redisAvailable) {
                console.log('✅ Redis connected and ready');
            }
            else {
                console.log('⚠️ Redis not available, using in-memory fallback');
            }
        }
        catch (error) {
            console.log('⚠️ Redis connection failed, using in-memory fallback');
        }
    }
    else {
        console.log('ℹ️ Redis disabled via configuration');
    }
    console.log('ℹ️ Using backend OTP service (Beta mode)');
    httpServer.listen(PORT, () => {
        console.log(`Server listening on :${PORT}`);
        console.log('✅ Phase 1: Backend hardening active (error handlers + graceful shutdown)');
        console.log('✅ Phase 2: Environment configuration validated');
        console.log('✅ Phase 3: Database connection hardened (timeouts + query limits)');
        // Register shutdown handlers AFTER server starts
        process.on('SIGTERM', () => (0, shutdown_1.gracefulShutdown)('SIGTERM', httpServer));
        process.on('SIGINT', () => (0, shutdown_1.gracefulShutdown)('SIGINT', httpServer));
    });
})
    .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});
