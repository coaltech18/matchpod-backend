import winston from 'winston';
import { Request } from 'express';

export interface LogMetadata {
  [key: string]: any;
}

class LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        }),
        new winston.transports.File({
          filename: 'logs/combined.log',
        }),
      ],
    });
  }

  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(message, metadata);
  }

  error(message: string, error?: Error, metadata?: LogMetadata): void {
    this.logger.error(message, {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(message, metadata);
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.logger.debug(message, metadata);
  }

  http(req: Request, metadata?: LogMetadata): void {
    this.logger.http(`${req.method} ${req.url}`, {
      ...metadata,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}

export const Logger = new LoggerService();