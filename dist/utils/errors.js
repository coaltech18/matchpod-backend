"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerError = exports.ConflictError = exports.RateLimitError = exports.NotFoundError = exports.ForbiddenError = exports.AuthError = exports.ValidationError = exports.AppError = void 0;
exports.isAppError = isAppError;
exports.createErrorFromStatus = createErrorFromStatus;
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message, details) {
        super(message, 400, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class AuthError extends AppError {
    constructor(message, details) {
        super(message, 401, 'AUTH_ERROR', details);
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
class ForbiddenError extends AppError {
    constructor(message, details) {
        super(message, 403, 'FORBIDDEN', details);
        this.name = 'ForbiddenError';
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError {
    constructor(message, details) {
        super(message, 404, 'NOT_FOUND', details);
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class RateLimitError extends AppError {
    constructor(message, details) {
        super(message, 429, 'RATE_LIMIT', details);
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class ConflictError extends AppError {
    constructor(message, details) {
        super(message, 409, 'CONFLICT', details);
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
class ServerError extends AppError {
    constructor(message, details) {
        super(message, 500, 'SERVER_ERROR', details);
        this.name = 'ServerError';
    }
}
exports.ServerError = ServerError;
function isAppError(error) {
    return error instanceof AppError;
}
function createErrorFromStatus(status, message, details) {
    switch (status) {
        case 400:
            return new ValidationError(message, details);
        case 401:
            return new AuthError(message, details);
        case 403:
            return new ForbiddenError(message, details);
        case 404:
            return new NotFoundError(message, details);
        case 409:
            return new ConflictError(message, details);
        case 429:
            return new RateLimitError(message, details);
        default:
            return new ServerError(message, details);
    }
}
