import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../utils/errors';
import { validationResult, ValidationChain } from 'express-validator';
// import { sanitize } from 'express-validator/filter'; // Deprecated in newer versions

// Custom validation middleware that throws detailed errors
export const validate = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const errorDetails = errors.array().map((error: any) => ({
      field: error.param || error.path,
      message: error.msg || error.message,
      value: error.value,
    }));

    throw new ValidationError('Invalid request data', errorDetails);
  };
};

// Sanitize all request data
export const sanitizeAll = () => {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Sanitize body
    if (req.body) {
      Object.keys(req.body).forEach(key => {
        if (typeof req.body[key] === 'string') {
          req.body[key] = String(req.body[key]).trim();
        }
      });
    }

    // Sanitize query parameters
    if (req.query) {
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = String(req.query[key]).trim();
        }
      });
    }

    // Sanitize URL parameters
    if (req.params) {
      Object.keys(req.params).forEach(key => {
        if (typeof req.params[key] === 'string') {
          req.params[key] = String(req.params[key]).trim();
        }
      });
    }

    next();
  };
};

// Request size limits
export const requestSizeLimits = {
  json: '10mb',
  urlencoded: '10mb',
  raw: '10mb',
};

// Content type validation
export const validateContentType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'];
    if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
      throw new ValidationError('Invalid content type', {
        allowedTypes,
        received: contentType,
      });
    }
    next();
  };
};
