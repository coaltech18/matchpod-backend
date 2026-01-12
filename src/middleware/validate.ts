import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Create validation middleware for request body
 */
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }
      
      req.body = result.data;
      next();
    } catch (error) {
      console.error('Validation error:', error);
      return res.status(500).json({ error: 'Validation failed' });
    }
  };
}

/**
 * Create validation middleware for request query parameters
 */
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        return res.status(400).json({
          error: 'Query validation failed',
          details: errors
        });
      }
      
      req.query = result.data;
      next();
    } catch (error) {
      console.error('Query validation error:', error);
      return res.status(500).json({ error: 'Query validation failed' });
    }
  };
}

/**
 * Create validation middleware for request parameters
 */
export function validateParams(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.params);
      
      if (!result.success) {
        const errors = result.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        
        return res.status(400).json({
          error: 'Parameter validation failed',
          details: errors
        });
      }
      
      req.params = result.data;
      next();
    } catch (error) {
      console.error('Parameter validation error:', error);
      return res.status(500).json({ error: 'Parameter validation failed' });
    }
  };
}

/**
 * Sanitize input to prevent injection attacks
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  try {
    // Sanitize string fields
    const sanitizeString = (str: string): string => {
      return str
        .replace(/[<>\"'&]/g, '') // Remove HTML/XML characters
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/data:/gi, '') // Remove data: protocol
        .trim();
    };

    // Recursively sanitize object
    const sanitizeObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return sanitizeString(obj);
      }
      
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      
      if (obj && typeof obj === 'object') {
        const sanitized: any = {};
        Object.entries(obj).forEach(([key, value]) => {
          sanitized[key] = sanitizeObject(value);
        });
        return sanitized;
      }
      
      return obj;
    };

    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error('Input sanitization error:', error);
    return res.status(500).json({ error: 'Input sanitization failed' });
  }
}

/**
 * Validate file upload
 */
export function validateFileUpload(options: {
  maxSize?: number;
  allowedTypes?: string[];
  required?: boolean;
}) {
  return (req: any, res: Response, next: NextFunction) => {
    try {
      const { maxSize = 5 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png'], required = false } = options;
      
      if (!req.file && required) {
        return res.status(400).json({ error: 'File is required' });
      }

      if (req.file) {
        // Check file size
        if (req.file.size > maxSize) {
          return res.status(400).json({ 
            error: `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB` 
          });
        }

        // Check file type
        if (!allowedTypes.includes(req.file.mimetype)) {
          return res.status(400).json({ 
            error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}` 
          });
        }

        // Check file extension
        const allowedExtensions = allowedTypes.map(type => type.split('/')[1]);
        const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase();
        
        if (fileExtension && !allowedExtensions.includes(fileExtension)) {
          return res.status(400).json({ 
            error: `Invalid file extension. Allowed extensions: ${allowedExtensions.join(', ')}` 
          });
        }
      }

      next();
    } catch (error) {
      console.error('File validation error:', error);
      return res.status(500).json({ error: 'File validation failed' });
    }
  };
}

/**
 * Validate MongoDB ObjectId
 */
export function validateObjectId(field: string = 'id') {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params[field] || req.body[field] || req.query[field];
      
      if (id && !/^[0-9a-fA-F]{24}$/.test(id)) {
        return res.status(400).json({ 
          error: `Invalid ${field} format` 
        });
      }
      
      next();
    } catch (error) {
      console.error('ObjectId validation error:', error);
      return res.status(500).json({ error: 'ObjectId validation failed' });
    }
  };
}

/**
 * Validate phone number format
 */
export function validatePhoneNumber() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const phone = req.body.phone;
      
      if (phone && !/^\d{10}$/.test(phone)) {
        return res.status(400).json({ 
          error: 'Phone number must be 10 digits' 
        });
      }
      
      next();
    } catch (error) {
      console.error('Phone validation error:', error);
      return res.status(500).json({ error: 'Phone validation failed' });
    }
  };
}

/**
 * Validate OTP format
 */
export function validateOTP() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const otp = req.body.otp;
      
      if (otp && !/^\d{4,6}$/.test(otp)) {
        return res.status(400).json({ 
          error: 'OTP must be 4-6 digits' 
        });
      }
      
      next();
    } catch (error) {
      console.error('OTP validation error:', error);
      return res.status(500).json({ error: 'OTP validation failed' });
    }
  };
}

// Common validation schemas
export const commonSchemas = {
  objectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format'),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits'),
  otp: z.string().regex(/^\d{4,6}$/, 'OTP must be 4-6 digits'),
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name too long'),
  age: z.number().min(18, 'Must be 18 or older').max(65, 'Age must be 65 or younger'),
  gender: z.enum(['Male', 'Female', 'Other'], { errorMap: () => ({ message: 'Invalid gender' }) }),
  occupation: z.string().min(2, 'Occupation must be at least 2 characters').max(100, 'Occupation too long'),
  bio: z.string().max(500, 'Bio too long').optional(),
  budgetRange: z.tuple([z.number().min(0), z.number().min(0)]),
  ageRange: z.tuple([z.number().min(18), z.number().max(65)]),
  preferredAreas: z.array(z.string()).max(10, 'Too many preferred areas'),
  dealBreakers: z.array(z.string()).max(10, 'Too many deal breakers'),
  interests: z.array(z.string()).max(20, 'Too many interests'),
  message: z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
  swipeAction: z.enum(['like', 'nope', 'super'], { errorMap: () => ({ message: 'Invalid swipe action' }) }),
};

export default {
  validateBody,
  validateQuery,
  validateParams,
  sanitizeInput,
  validateFileUpload,
  validateObjectId,
  validatePhoneNumber,
  validateOTP,
  commonSchemas,
};
