"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const azureBlobService_1 = require("../services/azureBlobService");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
exports.router = (0, express_1.Router)();
// Request schema for upload URL generation
const uploadUrlSchema = zod_1.z.object({
    fileName: zod_1.z.string().min(1, 'File name is required'),
    category: zod_1.z.enum(['profile', 'user', 'room'], {
        errorMap: () => ({ message: 'Category must be profile, user, or room' })
    }),
    contentType: zod_1.z.enum(['image/jpeg', 'image/png', 'image/webp'], {
        errorMap: () => ({ message: 'Content type must be image/jpeg, image/png, or image/webp' })
    }),
    sizeBytes: zod_1.z.number().positive('File size must be positive'),
});
/**
 * POST /api/images/upload-url
 * Generate a SAS URL for direct client upload to Azure Blob Storage
 */
exports.router.post('/upload-url', auth_1.requireAuth, (0, validate_1.validateBody)(uploadUrlSchema), async (req, res) => {
    try {
        const { fileName, category, contentType, sizeBytes } = req.body;
        console.log('📸 Generating upload URL:', {
            fileName,
            category,
            contentType,
            sizeBytes,
            userId: req.user?.id
        });
        // Validate file metadata
        const validation = azureBlobService_1.AzureBlobService.validateFile(category, contentType, sizeBytes);
        if (!validation.valid) {
            return res.status(400).json({
                error: validation.error,
                code: 'INVALID_FILE'
            });
        }
        // Generate SAS URL
        const { sasUrl, blobUrl } = await azureBlobService_1.AzureBlobService.generateSasUrl(fileName, category, contentType, sizeBytes);
        console.log('✅ Generated SAS URL for:', blobUrl);
        return res.json({
            sasUrl, // For client to upload to
            blobUrl, // Final URL after upload
            expiresIn: 900, // 15 minutes
        });
    }
    catch (error) {
        console.error('❌ Generate upload URL error:', error);
        return res.status(500).json({
            error: error.message || 'Failed to generate upload URL',
            code: 'UPLOAD_URL_GENERATION_FAILED'
        });
    }
});
/**
 * POST /api/images/confirm-upload
 * Confirm that upload was successful (optional tracking endpoint)
 */
exports.router.post('/confirm-upload', auth_1.requireAuth, (0, validate_1.validateBody)(zod_1.z.object({
    blobUrl: zod_1.z.string().url('Invalid blob URL'),
    category: zod_1.z.enum(['profile', 'user', 'room']),
})), async (req, res) => {
    try {
        const { blobUrl, category } = req.body;
        console.log('✅ Upload confirmed:', {
            blobUrl,
            category,
            userId: req.user?.id
        });
        // TODO: Track uploaded images in database if needed
        // For now, just acknowledge
        return res.json({
            message: 'Upload confirmed',
            blobUrl,
        });
    }
    catch (error) {
        console.error('❌ Confirm upload error:', error);
        return res.status(500).json({
            error: 'Failed to confirm upload',
            code: 'CONFIRM_UPLOAD_FAILED'
        });
    }
});
/**
 * DELETE /api/images/:category/:blobName
 * Delete an image from Azure Blob Storage
 */
exports.router.delete('/:category/:blobName', auth_1.requireAuth, async (req, res) => {
    try {
        const { category, blobName } = req.params;
        if (!['profile', 'user', 'room'].includes(category)) {
            return res.status(400).json({
                error: 'Invalid category',
                code: 'INVALID_CATEGORY'
            });
        }
        await azureBlobService_1.AzureBlobService.deleteBlob(category, blobName);
        return res.json({
            message: 'Image deleted successfully',
        });
    }
    catch (error) {
        console.error('❌ Delete image error:', error);
        return res.status(500).json({
            error: 'Failed to delete image',
            code: 'DELETE_FAILED'
        });
    }
});
exports.default = exports.router;
