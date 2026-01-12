import { Request, Response, NextFunction } from 'express';
import { Logger, LogMetadata } from '../services/logger';
import { AppError } from '../utils/errors';

interface ResponseWithBody extends Response {
  body?: any;
}

export function requestLogger(req: Request, res: ResponseWithBody, next: NextFunction) {
  const startTime = process.hrtime();
  const chunks: Buffer[] = [];

  // Create proxies for write and end
  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);

  // Override write
  res.write = function(chunk: any, encoding: BufferEncoding = 'utf8', callback?: (error?: Error | null) => void): boolean {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return originalWrite(chunk, encoding, callback);
  } as Response['write'];

  // Override end
  res.end = function(chunk?: any, encoding: BufferEncoding = 'utf8', callback?: () => void): Response {
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
    } catch (e) {
      // Not JSON, use as is
    }

    // Log request details
    const metadata: LogMetadata = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      responseTime,
      requestBody: req.body,
      responseBody: body,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    };

    Logger.info('Request completed', metadata);
    return originalEnd(chunk, encoding, callback);
  } as Response['end'];

  next();
}

export function errorLogger(error: unknown, req: Request, res: Response, next: NextFunction) {
  const metadata: LogMetadata = {
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    user: (req as any).user,
  };

  if (error instanceof AppError) {
    Logger.error(error.message, error, metadata);
  } else if (error instanceof Error) {
    Logger.error('Unhandled error', error, metadata);
  } else {
    const unknownError = new Error('Unknown error');
    Logger.error('Unknown error type', unknownError, {
      ...metadata,
      originalError: error,
    });
  }

  next(error);
}

export function performanceLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(startTime);
    const duration = diff[0] * 1e3 + diff[1] * 1e-6; // Convert to milliseconds

    const metadata: LogMetadata = {
      method: req.method,
      url: req.originalUrl,
      duration,
      status: res.statusCode,
      contentLength: res.get('content-length'),
    };

    if (duration > 1000) { // Log slow requests (>1s)
      Logger.warn('Slow request detected', {
        ...metadata,
        body: req.body,
      });
    }

    // Log performance metrics
    Logger.info('Request performance', metadata);
  });

  next();
}

// Database operation logging decorator
export function logDatabaseOperation(operation: string) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      const startTime = process.hrtime();
      try {
        const result = await originalMethod.apply(this, args);
        const diff = process.hrtime(startTime);
        const duration = diff[0] * 1e3 + diff[1] * 1e-6;

        const metadata: LogMetadata = {
          operation,
          duration,
          args: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)),
        };

        Logger.info('Database operation completed', metadata);
        return result;
      } catch (error) {
        const diff = process.hrtime(startTime);
        const duration = diff[0] * 1e3 + diff[1] * 1e-6;

        if (error instanceof Error) {
          const metadata: LogMetadata = {
            operation,
            duration,
            args: args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)),
          };
          Logger.error('Database operation failed', error, metadata);
        }

        throw error;
      }
    };

    return descriptor;
  };
}