"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const client_1 = require("../redis/client");
const health_redis_1 = require("./health.redis");
const shutdown_1 = require("../shutdown");
const router = (0, express_1.Router)();
exports.healthRouter = router;
/**
 * Health check endpoint
 */
router.get('/', async (req, res) => {
    // Phase 1: Backend Hardening - Return 503 during shutdown
    // This signals Render to stop routing new traffic to this instance
    if ((0, shutdown_1.isServerShuttingDown)()) {
        return res.status(503).json({
            status: 'shutting_down',
            timestamp: new Date().toISOString(),
            message: 'Server is shutting down gracefully',
        });
    }
    try {
        const health = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            services: {
                api: 'healthy',
                database: 'unknown',
                redis: 'unknown'
            }
        };
        // Check MongoDB connection
        try {
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState === 1) {
                health.services.database = 'healthy';
            }
            else {
                health.services.database = 'unhealthy';
            }
        }
        catch (error) {
            health.services.database = 'error';
        }
        // Check Redis connection (only if enabled)
        try {
            const redisEnabled = process.env.ENABLE_REDIS !== 'false';
            if (!redisEnabled) {
                health.services.redis = 'disabled';
                health.redis = {
                    available: false,
                    connected: false,
                    enabled: false,
                    reason: 'Redis disabled via ENABLE_REDIS=false'
                };
            }
            else {
                const redisAvailable = await (0, client_1.isRedisAvailable)();
                const redisStatus = (0, client_1.getRedisStatus)();
                if (redisAvailable) {
                    health.services.redis = 'healthy';
                }
                else {
                    health.services.redis = 'unhealthy';
                }
                // Add Redis status details
                health.redis = {
                    available: redisAvailable,
                    connected: redisStatus.connected,
                    host: redisStatus.host,
                    port: redisStatus.port,
                    tls: redisStatus.tls,
                    enabled: true
                };
            }
        }
        catch (error) {
            health.services.redis = 'error';
            console.error('Redis health check error:', error);
        }
        // Only return 503 if critical services are down (database, not Redis)
        const criticalServices = ['api', 'database'];
        const isHealthy = criticalServices.every(service => health.services[service] === 'healthy');
        res.status(isHealthy ? 200 : 503).json(health);
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Register Redis health probe route
router.use('/', health_redis_1.redisHealthRouter);
