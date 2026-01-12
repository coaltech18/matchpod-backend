"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commonSchemas = void 0;
exports.validateBody = validateBody;
exports.validateQuery = validateQuery;
exports.validateParams = validateParams;
exports.sanitizeInput = sanitizeInput;
exports.validateFileUpload = validateFileUpload;
exports.validateObjectId = validateObjectId;
exports.validatePhoneNumber = validatePhoneNumber;
exports.validateOTP = validateOTP;
const zod_1 = require("zod");
/**
 * Create validation middleware for request body
 */
function validateBody(schema) {
    return (req, res, next) => {
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
        }
        catch (error) {
            console.error('Validation error:', error);
            return res.status(500).json({ error: 'Validation failed' });
        }
    };
}
/**
 * Create validation middleware for request query parameters
 */
function validateQuery(schema) {
    return (req, res, next) => {
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
        }
        catch (error) {
            console.error('Query validation error:', error);
            return res.status(500).json({ error: 'Query validation failed' });
        }
    };
}
/**
 * Create validation middleware for request parameters
 */
function validateParams(schema) {
    return (req, res, next) => {
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
        }
        catch (error) {
            console.error('Parameter validation error:', error);
            return res.status(500).json({ error: 'Parameter validation failed' });
        }
    };
}
/**
 * Sanitize input to prevent injection attacks
 */
function sanitizeInput(req, res, next) {
    try {
        // Sanitize string fields
        const sanitizeString = (str) => {
            return str
                .replace(/[<>\"'&]/g, '') // Remove HTML/XML characters
                .replace(/javascript:/gi, '') // Remove javascript: protocol
                .replace(/data:/gi, '') // Remove data: protocol
                .trim();
        };
        // Recursively sanitize object
        const sanitizeObject = (obj) => {
            if (typeof obj === 'string') {
                return sanitizeString(obj);
            }
            if (Array.isArray(obj)) {
                return obj.map(sanitizeObject);
            }
            if (obj && typeof obj === 'object') {
                const sanitized = {};
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
    }
    catch (error) {
        console.error('Input sanitization error:', error);
        return res.status(500).json({ error: 'Input sanitization failed' });
    }
}
/**
 * Validate file upload
 */
function validateFileUpload(options) {
    return (req, res, next) => {
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
        }
        catch (error) {
            console.error('File validation error:', error);
            return res.status(500).json({ error: 'File validation failed' });
        }
    };
}
/**
 * Validate MongoDB ObjectId
 */
function validateObjectId(field = 'id') {
    return (req, res, next) => {
        try {
            const id = req.params[field] || req.body[field] || req.query[field];
            if (id && !/^[0-9a-fA-F]{24}$/.test(id)) {
                return res.status(400).json({
                    error: `Invalid ${field} format`
                });
            }
            next();
        }
        catch (error) {
            console.error('ObjectId validation error:', error);
            return res.status(500).json({ error: 'ObjectId validation failed' });
        }
    };
}
/**
 * Validate phone number format
 */
function validatePhoneNumber() {
    return (req, res, next) => {
        try {
            const phone = req.body.phone;
            if (phone && !/^\d{10}$/.test(phone)) {
                return res.status(400).json({
                    error: 'Phone number must be 10 digits'
                });
            }
            next();
        }
        catch (error) {
            console.error('Phone validation error:', error);
            return res.status(500).json({ error: 'Phone validation failed' });
        }
    };
}
/**
 * Validate OTP format
 */
function validateOTP() {
    return (req, res, next) => {
        try {
            const otp = req.body.otp;
            if (otp && !/^\d{4,6}$/.test(otp)) {
                return res.status(400).json({
                    error: 'OTP must be 4-6 digits'
                });
            }
            next();
        }
        catch (error) {
            console.error('OTP validation error:', error);
            return res.status(500).json({ error: 'OTP validation failed' });
        }
    };
}
// Common validation schemas
exports.commonSchemas = {
    objectId: zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format'),
    phone: zod_1.z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits'),
    otp: zod_1.z.string().regex(/^\d{4,6}$/, 'OTP must be 4-6 digits'),
    email: zod_1.z.string().email('Invalid email format'),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').max(50, 'Name too long'),
    age: zod_1.z.number().min(18, 'Must be 18 or older').max(65, 'Age must be 65 or younger'),
    gender: zod_1.z.enum(['Male', 'Female', 'Other'], { errorMap: () => ({ message: 'Invalid gender' }) }),
    occupation: zod_1.z.string().min(2, 'Occupation must be at least 2 characters').max(100, 'Occupation too long'),
    bio: zod_1.z.string().max(500, 'Bio too long').optional(),
    budgetRange: zod_1.z.tuple([zod_1.z.number().min(0), zod_1.z.number().min(0)]),
    ageRange: zod_1.z.tuple([zod_1.z.number().min(18), zod_1.z.number().max(65)]),
    preferredAreas: zod_1.z.array(zod_1.z.string()).max(10, 'Too many preferred areas'),
    dealBreakers: zod_1.z.array(zod_1.z.string()).max(10, 'Too many deal breakers'),
    interests: zod_1.z.array(zod_1.z.string()).max(20, 'Too many interests'),
    message: zod_1.z.string().min(1, 'Message cannot be empty').max(1000, 'Message too long'),
    swipeAction: zod_1.z.enum(['like', 'nope', 'super'], { errorMap: () => ({ message: 'Invalid swipe action' }) }),
};
exports.default = {
    validateBody,
    validateQuery,
    validateParams,
    sanitizeInput,
    validateFileUpload,
    validateObjectId,
    validatePhoneNumber,
    validateOTP,
    commonSchemas: exports.commonSchemas,
};
