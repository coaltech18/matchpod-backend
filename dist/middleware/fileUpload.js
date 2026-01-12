"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFile = exports.optimizeImage = exports.validateFile = void 0;
const multer_1 = __importDefault(require("multer"));
const errors_1 = require("../utils/errors");
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const util_1 = require("util");
const file_type_1 = require("file-type");
// Allowed file types and their mime types
const ALLOWED_FILE_TYPES = {
    image: ['image/jpeg', 'image/png', 'image/webp'],
    document: ['application/pdf'],
};
// Maximum file sizes (in bytes)
const MAX_FILE_SIZES = {
    image: 5 * 1024 * 1024, // 5MB
    document: 10 * 1024 * 1024, // 10MB
};
// Generate secure filename
const generateSecureFilename = (originalname, type) => {
    const timestamp = Date.now();
    const random = crypto_1.default.randomBytes(8).toString('hex');
    const extension = path_1.default.extname(originalname).toLowerCase();
    return `${type}_${timestamp}_${random}${extension}`;
};
// Validate file type using file-type library
const validateFileType = async (buffer, allowedTypes) => {
    const fileType = await (0, file_type_1.fileTypeFromBuffer)(buffer);
    return fileType && allowedTypes.includes(fileType.mime);
};
// Scan file for malware (mock implementation - replace with actual scanner)
const scanFile = async (buffer) => {
    // Implement actual malware scanning here
    // This is a mock implementation
    await (0, util_1.promisify)(setTimeout)(100); // Simulate scanning
    return true; // Return true if file is safe
};
// Create multer storage configuration
const storage = multer_1.default.memoryStorage();
// Create multer upload instance
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: Math.max(...Object.values(MAX_FILE_SIZES)),
    },
});
// File validation middleware
const validateFile = (type) => {
    return async (req, res, next) => {
        try {
            if (!req.file) {
                throw new errors_1.ValidationError('No file uploaded');
            }
            const { buffer, originalname, size } = req.file;
            // Check file size
            if (size > MAX_FILE_SIZES[type]) {
                throw new errors_1.ValidationError(`File size exceeds maximum limit of ${MAX_FILE_SIZES[type] / 1024 / 1024}MB`);
            }
            // Validate file type
            const isValidType = await validateFileType(buffer, ALLOWED_FILE_TYPES[type]);
            if (!isValidType) {
                throw new errors_1.ValidationError(`Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES[type].join(', ')}`);
            }
            // Scan file for malware
            const isSafe = await scanFile(buffer);
            if (!isSafe) {
                throw new errors_1.ValidationError('File failed security scan');
            }
            // Generate secure filename
            const secureFilename = generateSecureFilename(originalname, type);
            req.file.filename = secureFilename;
            next();
        }
        catch (error) {
            next(error);
        }
    };
};
exports.validateFile = validateFile;
// Image optimization middleware
const optimizeImage = async (req, res, next) => {
    try {
        if (!req.file || !req.file.buffer) {
            return next();
        }
        const sharp = require('sharp');
        const image = sharp(req.file.buffer);
        const metadata = await image.metadata();
        // Resize if too large
        if (metadata.width && metadata.width > 2048) {
            image.resize(2048, null, {
                withoutEnlargement: true,
                fit: 'inside',
            });
        }
        // Convert to WebP for better compression
        const optimized = await image
            .webp({ quality: 80 })
            .toBuffer();
        req.file.buffer = optimized;
        req.file.mimetype = 'image/webp';
        req.file.filename = req.file.filename.replace(path_1.default.extname(req.file.filename), '.webp');
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.optimizeImage = optimizeImage;
// Export multer middleware
exports.uploadFile = upload.single('file');
