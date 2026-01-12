"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateContentType = exports.requestSizeLimits = exports.sanitizeAll = exports.validate = void 0;
const errors_1 = require("../utils/errors");
const express_validator_1 = require("express-validator");
// import { sanitize } from 'express-validator/filter'; // Deprecated in newer versions
// Custom validation middleware that throws detailed errors
const validate = (validations) => {
    return async (req, res, next) => {
        // Run all validations
        await Promise.all(validations.map(validation => validation.run(req)));
        const errors = (0, express_validator_1.validationResult)(req);
        if (errors.isEmpty()) {
            return next();
        }
        const errorDetails = errors.array().map((error) => ({
            field: error.param || error.path,
            message: error.msg || error.message,
            value: error.value,
        }));
        throw new errors_1.ValidationError('Invalid request data', errorDetails);
    };
};
exports.validate = validate;
// Sanitize all request data
const sanitizeAll = () => {
    return (req, _res, next) => {
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
exports.sanitizeAll = sanitizeAll;
// Request size limits
exports.requestSizeLimits = {
    json: '10mb',
    urlencoded: '10mb',
    raw: '10mb',
};
// Content type validation
const validateContentType = (allowedTypes) => {
    return (req, res, next) => {
        const contentType = req.headers['content-type'];
        if (!contentType || !allowedTypes.some(type => contentType.includes(type))) {
            throw new errors_1.ValidationError('Invalid content type', {
                allowedTypes,
                received: contentType,
            });
        }
        next();
    };
};
exports.validateContentType = validateContentType;
