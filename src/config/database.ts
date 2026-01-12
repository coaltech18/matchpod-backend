/**
 * Database Configuration
 * Phase 3: Backend Hardening - Database & Query Safety
 * 
 * Centralized MongoDB connection options for predictable behavior.
 * - Explicit pool sizing for single-instance beta
 * - Conservative timeouts for fail-fast behavior
 * - Retry configuration for transient failures
 */

import mongoose from 'mongoose';
import { Logger } from '../services/logger';

// =============================================================================
// Connection Options
// =============================================================================

/**
 * MongoDB connection options optimized for beta deployment
 * 
 * These settings prioritize:
 * 1. Predictability - fail fast, don't hang
 * 2. Resource efficiency - modest pool for single instance
 * 3. Resilience - auto-retry transient failures
 */
export const MONGODB_CONNECTION_OPTIONS: mongoose.ConnectOptions = {
    // ---------------------------------------------------------------------------
    // Connection Pool Settings (Single-Instance Beta)
    // ---------------------------------------------------------------------------

    /** Maximum connections in pool - sufficient for single instance */
    maxPoolSize: 10,

    /** Minimum connections kept warm for faster queries */
    minPoolSize: 2,

    /** Close idle connections after 30 seconds */
    maxIdleTimeMS: 30000,

    // ---------------------------------------------------------------------------
    // Timeout Settings (Fail-Fast Behavior)
    // ---------------------------------------------------------------------------

    /** Fail if server selection takes >5s (MongoDB unreachable) */
    serverSelectionTimeoutMS: 5000,

    /** Fail if initial connection takes >10s */
    connectTimeoutMS: 10000,

    /** Fail if any socket operation takes >45s */
    socketTimeoutMS: 45000,

    /** How long to wait for a connection from pool */
    waitQueueTimeoutMS: 10000,

    // ---------------------------------------------------------------------------
    // Retry Settings (Transient Failure Resilience)
    // ---------------------------------------------------------------------------

    /** Automatically retry failed writes (recommended for Atlas) */
    retryWrites: true,

    /** Automatically retry failed reads (recommended for Atlas) */
    retryReads: true,

    // ---------------------------------------------------------------------------
    // Heartbeat Settings
    // ---------------------------------------------------------------------------

    /** How often to check server health */
    heartbeatFrequencyMS: 10000,
};

// =============================================================================
// Query Timeout Constants
// =============================================================================

/**
 * Query execution time limits in milliseconds.
 * These prevent hung queries from blocking responses.
 * 
 * App Store Review Note: APIs should respond within 10s for review safety.
 */
export const QUERY_TIMEOUTS = {
    /** Simple lookups: findOne, findById - should be instant with indexes */
    SIMPLE_LOOKUP: 5000,

    /** List queries with pagination */
    LIST_QUERY: 10000,

    /** Complex queries: match finding, aggregations */
    COMPLEX_QUERY: 15000,

    /** Batch operations: bulk updates (admin only) */
    BATCH_OPERATION: 30000,
} as const;

// =============================================================================
// Pagination Limits
// =============================================================================

/**
 * Pagination constants to prevent unbounded queries.
 * All list endpoints MUST enforce these limits.
 */
export const PAGINATION_LIMITS = {
    /** Default page size if not specified */
    DEFAULT_PAGE_SIZE: 20,

    /** Maximum items per page (hard limit) */
    MAX_PAGE_SIZE: 50,

    /** Match results limit (from matchService) */
    MATCHES_MAX: 15,

    /** Chat messages per request */
    MESSAGES_MAX: 100,

    /** Notifications per request */
    NOTIFICATIONS_MAX: 100,

    /** Users list (admin/search) */
    USERS_MAX: 50,
} as const;

// =============================================================================
// Query Plugins
// =============================================================================

/**
 * Mongoose plugin that applies default query timeouts.
 * Prevents any query from running indefinitely.
 * 
 * @param schema - Mongoose schema to apply plugin to
 */
export function queryTimeoutPlugin(schema: mongoose.Schema): void {
    // Apply timeout to find queries
    schema.pre('find', function () {
        if (!this.getOptions().maxTimeMS) {
            this.maxTimeMS(QUERY_TIMEOUTS.LIST_QUERY);
        }
    });

    // Apply timeout to findOne queries
    schema.pre('findOne', function () {
        if (!this.getOptions().maxTimeMS) {
            this.maxTimeMS(QUERY_TIMEOUTS.SIMPLE_LOOKUP);
        }
    });

    // Apply timeout to count queries
    schema.pre('countDocuments', function () {
        if (!this.getOptions().maxTimeMS) {
            this.maxTimeMS(QUERY_TIMEOUTS.SIMPLE_LOOKUP);
        }
    });

    // Apply timeout to aggregate queries
    schema.pre('aggregate', function () {
        this.options.maxTimeMS = this.options.maxTimeMS || QUERY_TIMEOUTS.COMPLEX_QUERY;
    });
}

/**
 * Register the global query timeout plugin.
 * Call this BEFORE connecting to MongoDB.
 */
export function registerQueryPlugins(): void {
    mongoose.plugin(queryTimeoutPlugin);
    console.log('✅ Query timeout plugins registered');
}

// =============================================================================
// Connection Event Handlers
// =============================================================================

/**
 * Register MongoDB connection event handlers for observability.
 * Logs connection state changes for debugging and monitoring.
 */
export function registerConnectionEvents(): void {
    const connection = mongoose.connection;

    connection.on('connected', () => {
        Logger.info('MongoDB connected', {
            host: connection.host,
            port: connection.port,
            name: connection.name,
        });
        console.log(`✅ MongoDB connected to ${connection.name}`);
    });

    connection.on('disconnected', () => {
        Logger.warn('MongoDB disconnected');
        console.log('⚠️ MongoDB disconnected');
    });

    connection.on('reconnected', () => {
        Logger.info('MongoDB reconnected');
        console.log('🔄 MongoDB reconnected');
    });

    connection.on('error', (error) => {
        Logger.error('MongoDB connection error', error);
        console.error('❌ MongoDB error:', error.message);
    });

    connection.on('close', () => {
        Logger.info('MongoDB connection closed');
        console.log('🔒 MongoDB connection closed');
    });

    console.log('✅ MongoDB connection event handlers registered');
}

// =============================================================================
// Connection Helper
// =============================================================================

/**
 * Connect to MongoDB with hardened settings.
 * 
 * @param uri - MongoDB connection string
 * @returns Promise that resolves when connected
 */
export async function connectToDatabase(uri: string): Promise<typeof mongoose> {
    // Register plugins before connecting
    registerQueryPlugins();

    // Register event handlers
    registerConnectionEvents();

    console.log('🔗 Connecting to MongoDB...');

    try {
        await mongoose.connect(uri, MONGODB_CONNECTION_OPTIONS);
        return mongoose;
    } catch (error) {
        console.error('❌ Failed to connect to MongoDB:', error);
        throw error;
    }
}

/**
 * Gracefully close the MongoDB connection.
 * Called during graceful shutdown.
 */
export async function closeDatabaseConnection(): Promise<void> {
    try {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed gracefully');
    } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error);
        throw error;
    }
}

// =============================================================================
// Query Safety Helpers
// =============================================================================

/**
 * Sanitize and validate pagination parameters.
 * Ensures page size never exceeds maximum limits.
 * 
 * @param page - Requested page number (1-indexed)
 * @param limit - Requested page size
 * @param maxLimit - Maximum allowed limit for this endpoint
 * @returns Sanitized pagination parameters
 */
export function sanitizePagination(
    page?: number | string,
    limit?: number | string,
    maxLimit: number = PAGINATION_LIMITS.MAX_PAGE_SIZE
): { page: number; limit: number; skip: number } {
    // Parse and validate page
    let parsedPage = typeof page === 'string' ? parseInt(page, 10) : (page || 1);
    if (isNaN(parsedPage) || parsedPage < 1) {
        parsedPage = 1;
    }

    // Parse and validate limit
    let parsedLimit = typeof limit === 'string' ? parseInt(limit, 10) : (limit || PAGINATION_LIMITS.DEFAULT_PAGE_SIZE);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
        parsedLimit = PAGINATION_LIMITS.DEFAULT_PAGE_SIZE;
    }

    // Enforce maximum limit
    parsedLimit = Math.min(parsedLimit, maxLimit);

    // Calculate skip
    const skip = (parsedPage - 1) * parsedLimit;

    return {
        page: parsedPage,
        limit: parsedLimit,
        skip,
    };
}

/**
 * Apply standard pagination to a Mongoose query.
 * 
 * @param query - Mongoose query to paginate
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @returns The query with skip and limit applied
 */
export function applyPagination<T>(
    query: mongoose.Query<T[], any>,
    page: number,
    limit: number
): mongoose.Query<T[], any> {
    const { skip } = sanitizePagination(page, limit);
    return query.skip(skip).limit(limit);
}
