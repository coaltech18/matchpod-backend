/**
 * Global Express Error Handling Middleware
 * Phase 1: Backend Hardening for Beta
 * 
 * Provides centralized error handling for all Express routes.
 * - Catches all unhandled errors in route handlers
 * - Formats errors consistently for API responses
 * - Sanitizes error details in production
 */

import { Request, Response, NextFunction } from 'express';
import { AppError, isAppError } from '../utils/errors';
import { Logger } from '../services/logger';

/**
 * Global error handler middleware
 * Must be registered LAST after all routes
 */
export function globalErrorHandler(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Log the error with context
    Logger.error('Unhandled error in request', err, {
        method: req.method,
        url: req.originalUrl,
        body: req.body,
        userId: (req as any).user?.id || (req as any).user?._id,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
    });

    // Handle known application errors
    if (isAppError(err)) {
        res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                // Only include details in non-production environments
                ...(process.env.NODE_ENV !== 'production' && err.details && { details: err.details }),
            },
        });
        return;
    }

    // Handle unknown errors - don't leak internal details in production
    const isProduction = process.env.NODE_ENV === 'production';
    const statusCode = 500;
    const message = isProduction ? 'Internal server error' : err.message;

    res.status(statusCode).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message,
            // Only include stack trace in non-production environments
            ...(!isProduction && { stack: err.stack }),
        },
    });
}

/**
 * 404 Not Found handler for unmatched routes
 * Must be registered after all routes but before globalErrorHandler
 */
export function notFoundHandler(req: Request, res: Response): void {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Route ${req.method} ${req.path} not found`,
        },
    });
}
