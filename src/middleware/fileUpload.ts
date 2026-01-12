import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ValidationError } from '../utils/errors';
import crypto from 'crypto';
import path from 'path';
import { promisify } from 'util';
import { fileTypeFromBuffer } from 'file-type';

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
const generateSecureFilename = (originalname: string, type: string) => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname).toLowerCase();
  return `${type}_${timestamp}_${random}${extension}`;
};

// Validate file type using file-type library
const validateFileType = async (buffer: Buffer, allowedTypes: string[]) => {
  const fileType = await fileTypeFromBuffer(buffer);
  return fileType && allowedTypes.includes(fileType.mime);
};

// Scan file for malware (mock implementation - replace with actual scanner)
const scanFile = async (buffer: Buffer): Promise<boolean> => {
  // Implement actual malware scanning here
  // This is a mock implementation
  await promisify(setTimeout)(100); // Simulate scanning
  return true; // Return true if file is safe
};

// Create multer storage configuration
const storage = multer.memoryStorage();

// Create multer upload instance
const upload = multer({
  storage,
  limits: {
    fileSize: Math.max(...Object.values(MAX_FILE_SIZES)),
  },
});

// File validation middleware
export const validateFile = (type: keyof typeof ALLOWED_FILE_TYPES) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError('No file uploaded');
      }

      const { buffer, originalname, size } = req.file;

      // Check file size
      if (size > MAX_FILE_SIZES[type]) {
        throw new ValidationError(
          `File size exceeds maximum limit of ${MAX_FILE_SIZES[type] / 1024 / 1024}MB`
        );
      }

      // Validate file type
      const isValidType = await validateFileType(buffer, ALLOWED_FILE_TYPES[type]);
      if (!isValidType) {
        throw new ValidationError(
          `Invalid file type. Allowed types: ${ALLOWED_FILE_TYPES[type].join(', ')}`
        );
      }

      // Scan file for malware
      const isSafe = await scanFile(buffer);
      if (!isSafe) {
        throw new ValidationError('File failed security scan');
      }

      // Generate secure filename
      const secureFilename = generateSecureFilename(originalname, type);
      req.file.filename = secureFilename;

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Image optimization middleware
export const optimizeImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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
    req.file.filename = req.file.filename.replace(
      path.extname(req.file.filename),
      '.webp'
    );

    next();
  } catch (error) {
    next(error);
  }
};

// Export multer middleware
export const uploadFile = upload.single('file');
