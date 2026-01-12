import { Router, Request, Response } from 'express';
import { pingRedis, isRedisReady } from '../redis/client';

const router = Router();

/**
 * Redis health probe endpoint
 * GET /api/health/redis
 * 
 * Returns Redis connection status with response time:
 * - 200 { status: "healthy", responseTime } - Redis responding <250ms
 * - 200 { status: "degraded", responseTime } - Redis responding >=250ms
 * - 503 { status: "down" } - Redis timeout or error
 */
router.get('/redis', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Check Redis connection status first
    const isReady = isRedisReady();
    
    if (!isReady) {
      // Redis not ready - down
      return res.status(503).json({
        status: 'down',
        reason: 'not_ready',
        timestamp: new Date().toISOString()
      });
    }
    
    // Ping Redis with 250ms timeout
    const pingResult = await pingRedis(250);
    const responseTime = Date.now() - startTime;
    
    if (pingResult) {
      // Redis is responding
      if (responseTime < 250) {
        // Fast response - healthy
        return res.status(200).json({
          status: 'healthy',
          responseTime,
          timestamp: new Date().toISOString()
        });
      } else {
        // Slow response - degraded
        return res.status(200).json({
          status: 'degraded',
          responseTime,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // Redis ping failed
      return res.status(503).json({
        status: 'down',
        reason: 'ping_failed',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    // Redis error or timeout
    const responseTime = Date.now() - startTime;
    
    // Log error (sanitized, no secrets)
    console.warn(`Redis health check failed after ${responseTime}ms:`, 
      error instanceof Error ? error.message : 'Unknown error');
    
    return res.status(503).json({
      status: 'down',
      reason: 'error',
      responseTime,
      timestamp: new Date().toISOString()
    });
  }
});

export { router as redisHealthRouter };
