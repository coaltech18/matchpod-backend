"use strict";
/**
 * Graceful Shutdown Coordinator
 * Phase 1: Backend Hardening for Beta
 *
 * Handles SIGTERM/SIGINT signals for Render deployment compatibility.
 * - Closes HTTP server, Redis, and MongoDB in order
 * - Prevents race conditions with shutdown flag
 * - Forces exit after 10 seconds if cleanup hangs
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isServerShuttingDown = isServerShuttingDown;
exports.gracefulShutdown = gracefulShutdown;
exports.registerProcessHandlers = registerProcessHandlers;
const mongoose_1 = __importDefault(require("mongoose"));
const client_1 = require("./redis/client");
const logger_1 = require("./services/logger");
/**
 * Shutdown state - prevents duplicate shutdown attempts
 */
let isShuttingDown = false;
/**
 * Check if server is currently shutting down
 * Used by health check to return 503
 */
function isServerShuttingDown() {
    return isShuttingDown;
}
/**
 * Graceful shutdown coordinator
 * Called on SIGTERM (Render) or SIGINT (local Ctrl+C)
 *
 * @param signal - The signal that triggered shutdown
 * @param httpServer - The HTTP server instance to close
 */
async function gracefulShutdown(signal, httpServer) {
    // Prevent multiple shutdown attempts (race condition protection)
    if (isShuttingDown) {
        console.log(`⚠️ Shutdown already in progress, ignoring ${signal}`);
        return;
    }
    isShuttingDown = true;
    // Set exit code early in case async operations hang
    process.exitCode = 0;
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    logger_1.Logger.info('Graceful shutdown initiated', { signal });
    // Force exit after 10 seconds (Render sends SIGKILL after ~10s)
    const shutdownTimeout = setTimeout(() => {
        console.error('❌ Shutdown timeout (10s). Forcing exit.');
        logger_1.Logger.error('Shutdown timeout - forcing exit', new Error('Shutdown timeout'));
        process.exit(1);
    }, 10000);
    // Prevent the timeout from keeping the process alive
    shutdownTimeout.unref();
    try {
        // 1. Stop accepting new HTTP connections
        console.log('📡 Closing HTTP server...');
        await new Promise((resolve, reject) => {
            httpServer.close((err) => {
                if (err) {
                    // Server might not be listening yet
                    if (err.code === 'ERR_SERVER_NOT_RUNNING') {
                        console.log('✅ HTTP server was not running');
                        resolve();
                    }
                    else {
                        reject(err);
                    }
                }
                else {
                    console.log('✅ HTTP server closed');
                    resolve();
                }
            });
        });
        // 2. Close Redis connection
        console.log('🔴 Closing Redis...');
        try {
            await (0, client_1.closeRedis)();
            console.log('✅ Redis closed');
        }
        catch (redisError) {
            // Redis might not be connected - log but continue
            console.log('⚠️ Redis close warning:', redisError instanceof Error ? redisError.message : redisError);
        }
        // 3. Close MongoDB connection
        console.log('🍃 Closing MongoDB...');
        try {
            await mongoose_1.default.connection.close();
            console.log('✅ MongoDB closed');
        }
        catch (mongoError) {
            // MongoDB might not be connected - log but continue
            console.log('⚠️ MongoDB close warning:', mongoError instanceof Error ? mongoError.message : mongoError);
        }
        clearTimeout(shutdownTimeout);
        console.log('👋 Graceful shutdown complete');
        logger_1.Logger.info('Graceful shutdown complete', { signal });
        process.exit(0);
    }
    catch (error) {
        console.error('❌ Error during shutdown:', error);
        logger_1.Logger.error('Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)));
        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
}
/**
 * Register process-level safety handlers
 * Must be called early in application startup
 */
function registerProcessHandlers() {
    // Handle unhandled promise rejections
    // MUST exit - process is in undefined state
    process.on('unhandledRejection', (reason, promise) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        logger_1.Logger.error('Unhandled Promise Rejection', error, {
            type: 'unhandledRejection',
        });
        console.error('💥 Unhandled Rejection! Shutting down...');
        console.error('Reason:', reason);
        // Exit with non-zero code - Render will restart the process
        process.exit(1);
    });
    // Handle uncaught exceptions
    // MUST exit immediately - process is in undefined state
    process.on('uncaughtException', (error, origin) => {
        logger_1.Logger.error('Uncaught Exception', error, {
            type: 'uncaughtException',
            origin,
        });
        console.error('💥 UNCAUGHT EXCEPTION! Shutting down...');
        console.error('Origin:', origin);
        console.error('Error:', error);
        // Exit immediately - process cannot be trusted
        process.exit(1);
    });
    console.log('✅ Process-level safety handlers registered');
}
