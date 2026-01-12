"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
exports.errorLogger = errorLogger;
exports.performanceLogger = performanceLogger;
exports.logDatabaseOperation = logDatabaseOperation;
const logger_1 = require("../services/logger");
const errors_1 = require("../utils/errors");
function requestLogger(req, res, next) {
    const startTime = process.hrtime();
    const chunks = [];
    // Create proxies for write and end
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    // Override write
    res.write = function (chunk, encoding = 'utf8', callback) {
        if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return originalWrite(chunk, encoding, callback);
    };
    // Override end
    res.end = function (chunk, encoding = 'utf8', callback) {
        if (chunk) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        // Calculate response time
        const diff = process.hrtime(startTime);
        const responseTime = diff[0] * 1e3 + diff[1] * 1e-6; // Convert to milliseconds
        // Get response body
        let body = Buffer.concat(chunks).toString('utf8');
        try {
            body = JSON.parse(body);
        }
        catch (e) {
            // Not JSON, use as is
        }
        // Log request details
        const metadata = {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            responseTime,
            requestBody: req.body,
            responseBody: body,
            userAgent: req.headers['user-agent'],
            ip: req.ip,
        };
        logger_1.Logger.info('Request completed', metadata);
        return originalEnd(chunk, encoding, callback);
    };
    next();
}
function errorLogger(error, req, res, next) {
    const metadata = {
        method: req.method,
        url: req.originalUrl,
        body: req.body,
        user: req.user,
    };
    if (error instanceof errors_1.AppError) {
        logger_1.Logger.error(error.message, error, metadata);
    }
    else if (error instanceof Error) {
        logger_1.Logger.error('Unhandled error', error, metadata);
    }
    else {
        const unknownError = new Error('Unknown error');
        logger_1.Logger.error('Unknown error type', unknownError, {
            ...metadata,
            originalError: error,
        });
    }
    next(error);
}
function performanceLogger(req, res, next) {
    const startTime = process.hrtime();
    res.on('finish', () => {
        const diff = process.hrtime(startTime);
        const duration = diff[0] * 1e3 + diff[1] * 1e-6; // Convert to milliseconds
        const metadata = {
            method: req.method,
            url: req.originalUrl,
            duration,
            status: res.statusCode,
            contentLength: res.get('content-length'),
        };
        if (duration > 1000) { // Log slow requests (>1s)
            logger_1.Logger.warn('Slow request detected', {
                ...metadata,
                body: req.body,
            });
        }
        // Log performance metrics
        logger_1.Logger.info('Request performance', metadata);
    });
    next();
}
// Database operation logging decorator
function logDatabaseOperation(operation) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = async function (...args) {
            const startTime = process.hrtime();
            try {
                const result = await originalMethod.apply(this, args);
                const diff = process.hrtime(startTime);
                const duration = diff[0] * 1e3 + diff[1] * 1e-6;
                const metadata = {
                    operation,
                    duration,
                    args: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)),
                };
                logger_1.Logger.info('Database operation completed', metadata);
                return result;
            }
            catch (error) {
                const diff = process.hrtime(startTime);
                const duration = diff[0] * 1e3 + diff[1] * 1e-6;
                if (error instanceof Error) {
                    const metadata = {
                        operation,
                        duration,
                        args: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)),
                    };
                    logger_1.Logger.error('Database operation failed', error, metadata);
                }
                throw error;
            }
        };
        return descriptor;
    };
}
