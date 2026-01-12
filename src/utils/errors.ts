export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR',
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 401, 'AUTH_ERROR', details);
    this.name = 'AuthError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 403, 'FORBIDDEN', details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 429, 'RATE_LIMIT', details);
    this.name = 'RateLimitError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ServerError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'SERVER_ERROR', details);
    this.name = 'ServerError';
  }
}

export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

export function createErrorFromStatus(
  status: number,
  message: string,
  details?: any
): AppError {
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
