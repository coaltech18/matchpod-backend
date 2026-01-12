/**
 * Redis Client
 * Phase 2: Uses centralized config for Redis settings
 */

import { createClient, RedisClientType } from 'redis';
import { getRedisConfig } from '../config/env';

/**
 * Get Redis configuration from centralized config
 * Uses lazy initialization to support dynamic import
 */
function getRedisConfiguration() {
  const cfg = getRedisConfig();
  return {
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    tls: cfg.tls || cfg.port === 6380, // Azure Redis Cache uses 6380 for TLS
    servername: cfg.host,
  };
}

/**
 * Build Redis client options from configuration
 */
function buildRedisOptions() {
  const config = getRedisConfiguration();

  return {
    socket: {
      host: config.host,
      port: config.port,
      // Azure Redis Cache TLS configuration
      ...(config.tls && {
        tls: {
          servername: config.servername,
          rejectUnauthorized: false, // Azure Redis Cache specific
        },
      }),
      // Connection settings optimized for Azure Redis Cache
      connectTimeout: 10000,
      commandTimeout: 5000,
      keepAlive: 30000,
      family: 4, // Force IPv4
    },
    // Password only - NO username for Azure Redis Cache
    password: config.password || undefined,
    // Database selection
    database: 0,
  } as any;
}

/**
 * Singleton Redis client instance
 */
let redisClient: RedisClientType | null = null;

/**
 * Cached config for logging (avoids repeated calls)
 */
let cachedConfig: ReturnType<typeof getRedisConfiguration> | null = null;

/**
 * Get or create Redis client instance
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    cachedConfig = getRedisConfiguration();
    console.log(`🔗 Creating Redis client for ${cachedConfig.host}:${cachedConfig.port}`);

    redisClient = createClient(buildRedisOptions());

    // Lifecycle event handlers with redacted logging
    redisClient.on('ready', () => {
      console.log(`✅ Redis connected to ${cachedConfig!.host}:${cachedConfig!.port}`);
    });

    redisClient.on('error', (err: Error) => {
      // Redact sensitive information from error logs
      const safeError = err.message.replace(/password[^,\s]*/gi, 'password=***');
      console.error(`❌ Redis error: ${safeError}`);
    });

    redisClient.on('end', () => {
      console.log('🔌 Redis connection ended');
    });

    redisClient.on('reconnecting', (delay: number) => {
      console.log(`🔄 Redis reconnecting in ${delay}ms`);
    });

    redisClient.on('close', () => {
      console.log('🔒 Redis connection closed');
    });

    redisClient.on('connect', () => {
      console.log(`🔗 Redis connecting to ${cachedConfig!.host}:${cachedConfig!.port}`);
    });
  }

  return redisClient;
}

/**
 * Ping Redis with timeout
 * @param timeoutMs - Timeout in milliseconds (default: 250ms)
 * @returns Promise<boolean> - true if Redis responds, false if timeout or error
 */
export async function pingRedis(timeoutMs: number = 250): Promise<boolean> {
  const client = getRedisClient();

  try {
    // Connect if not already connected
    if (!client.isOpen) {
      await client.connect();
    }

    // Race PING against timeout
    const pingPromise = client.ping();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('PING timeout')), timeoutMs);
    });

    const result = await Promise.race([pingPromise, timeoutPromise]);
    return result === 'PONG';
  } catch (error) {
    console.warn(`⚠️ Redis PING failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

/**
 * Safely close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      if (redisClient.isOpen) {
        await redisClient.quit();
      }
      console.log('✅ Redis connection closed gracefully');
    } catch (error) {
      console.error('❌ Error closing Redis connection:', error);
    } finally {
      redisClient = null;
      cachedConfig = null;
    }
  }
}

/**
 * Check if Redis is available and ready
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    // Check connection status first
    if (redisClient && !redisClient.isOpen) {
      return false;
    }
    return await pingRedis(250); // Reduced timeout for faster fallback
  } catch {
    return false;
  }
}

/**
 * Check Redis connection status without ping
 */
export function isRedisReady(): boolean {
  return redisClient ? redisClient.isOpen : false;
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): {
  connected: boolean;
  host: string;
  port: number;
  tls: boolean;
} {
  const config = cachedConfig || getRedisConfiguration();
  const client = redisClient;
  return {
    connected: client ? client.isOpen : false,
    host: config.host,
    port: config.port,
    tls: config.tls,
  };
}

// Phase 1: Backend Hardening
// NOTE: Graceful shutdown handlers removed - now coordinated centrally in shutdown.ts
// The closeRedis() function is called by the shutdown coordinator

// Phase 2: Lazy initialization
// NOTE: We no longer eagerly create the client on import
// The client is created on first call to getRedisClient()
// This supports dynamic import when ENABLE_REDIS is true
