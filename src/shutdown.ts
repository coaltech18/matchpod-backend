/**
 * Graceful Shutdown Coordinator
 * Phase 1: Backend Hardening for Beta
 * 
 * Handles SIGTERM/SIGINT signals for Render deployment compatibility.
 * - Closes HTTP server, Redis, and MongoDB in order
 * - Prevents race conditions with shutdown flag
 * - Forces exit after 10 seconds if cleanup hangs
 */

import { Server } from 'http';
import mongoose from 'mongoose';
import { closeRedis } from './redis/client';
import { Logger } from './services/logger';

/**
 * Shutdown state - prevents duplicate shutdown attempts
 */
let isShuttingDown = false;

/**
 * Check if server is currently shutting down
 * Used by health check to return 503
 */
export function isServerShuttingDown(): boolean {
    return isShuttingDown;
}

/**
 * Graceful shutdown coordinator
 * Called on SIGTERM (Render) or SIGINT (local Ctrl+C)
 * 
 * @param signal - The signal that triggered shutdown
 * @param httpServer - The HTTP server instance to close
 */
export async function gracefulShutdown(
    signal: string,
    httpServer: Server
): Promise<void> {
    // Prevent multiple shutdown attempts (race condition protection)
    if (isShuttingDown) {
        console.log(`⚠️ Shutdown already in progress, ignoring ${signal}`);
        return;
    }

    isShuttingDown = true;

    // Set exit code early in case async operations hang
    process.exitCode = 0;

    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    Logger.info('Graceful shutdown initiated', { signal });

    // Force exit after 10 seconds (Render sends SIGKILL after ~10s)
    const shutdownTimeout = setTimeout(() => {
        console.error('❌ Shutdown timeout (10s). Forcing exit.');
        Logger.error('Shutdown timeout - forcing exit', new Error('Shutdown timeout'));
        process.exit(1);
    }, 10000);

    // Prevent the timeout from keeping the process alive
    shutdownTimeout.unref();

    try {
        // 1. Stop accepting new HTTP connections
        console.log('📡 Closing HTTP server...');
        await new Promise<void>((resolve, reject) => {
            httpServer.close((err) => {
                if (err) {
                    // Server might not be listening yet
                    if ((err as any).code === 'ERR_SERVER_NOT_RUNNING') {
                        console.log('✅ HTTP server was not running');
                        resolve();
                    } else {
                        reject(err);
                    }
                } else {
                    console.log('✅ HTTP server closed');
                    resolve();
                }
            });
        });

        // 2. Close Redis connection
        console.log('🔴 Closing Redis...');
        try {
            await closeRedis();
            console.log('✅ Redis closed');
        } catch (redisError) {
            // Redis might not be connected - log but continue
            console.log('⚠️ Redis close warning:', redisError instanceof Error ? redisError.message : redisError);
        }

        // 3. Close MongoDB connection
        console.log('🍃 Closing MongoDB...');
        try {
            await mongoose.connection.close();
            console.log('✅ MongoDB closed');
        } catch (mongoError) {
            // MongoDB might not be connected - log but continue
            console.log('⚠️ MongoDB close warning:', mongoError instanceof Error ? mongoError.message : mongoError);
        }

        clearTimeout(shutdownTimeout);
        console.log('👋 Graceful shutdown complete');
        Logger.info('Graceful shutdown complete', { signal });

        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        Logger.error('Error during graceful shutdown', error instanceof Error ? error : new Error(String(error)));

        clearTimeout(shutdownTimeout);
        process.exit(1);
    }
}

/**
 * Register process-level safety handlers
 * Must be called early in application startup
 */
export function registerProcessHandlers(): void {
    // Handle unhandled promise rejections
    // MUST exit - process is in undefined state
    process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));

        Logger.error('Unhandled Promise Rejection', error, {
            type: 'unhandledRejection',
        });

        console.error('💥 Unhandled Rejection! Shutting down...');
        console.error('Reason:', reason);

        // Exit with non-zero code - Render will restart the process
        process.exit(1);
    });

    // Handle uncaught exceptions
    // MUST exit immediately - process is in undefined state
    process.on('uncaughtException', (error: Error, origin: string) => {
        Logger.error('Uncaught Exception', error, {
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
