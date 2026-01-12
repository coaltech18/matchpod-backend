import { Router } from 'express';
import { z } from 'zod';
import { AzureBlobService } from '../services/azureBlobService';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const router = Router();

// Request schema for upload URL generation
const uploadUrlSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  category: z.enum(['profile', 'user', 'room'], {
    errorMap: () => ({ message: 'Category must be profile, user, or room' })
  }),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    errorMap: () => ({ message: 'Content type must be image/jpeg, image/png, or image/webp' })
  }),
  sizeBytes: z.number().positive('File size must be positive'),
});

/**
 * POST /api/images/upload-url
 * Generate a SAS URL for direct client upload to Azure Blob Storage
 */
router.post(
  '/upload-url',
  requireAuth,
  validateBody(uploadUrlSchema),
  async (req: AuthRequest, res) => {
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
      const validation = AzureBlobService.validateFile(category, contentType, sizeBytes);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error,
          code: 'INVALID_FILE'
        });
      }

      // Generate SAS URL
      const { sasUrl, blobUrl } = await AzureBlobService.generateSasUrl(
        fileName,
        category,
        contentType,
        sizeBytes
      );

      console.log('✅ Generated SAS URL for:', blobUrl);

      return res.json({
        sasUrl,      // For client to upload to
        blobUrl,     // Final URL after upload
        expiresIn: 900, // 15 minutes
      });
    } catch (error: any) {
      console.error('❌ Generate upload URL error:', error);
      return res.status(500).json({
        error: error.message || 'Failed to generate upload URL',
        code: 'UPLOAD_URL_GENERATION_FAILED'
      });
    }
  }
);

/**
 * POST /api/images/confirm-upload
 * Confirm that upload was successful (optional tracking endpoint)
 */
router.post(
  '/confirm-upload',
  requireAuth,
  validateBody(z.object({
    blobUrl: z.string().url('Invalid blob URL'),
    category: z.enum(['profile', 'user', 'room']),
  })),
  async (req: AuthRequest, res) => {
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
    } catch (error: any) {
      console.error('❌ Confirm upload error:', error);
      return res.status(500).json({
        error: 'Failed to confirm upload',
        code: 'CONFIRM_UPLOAD_FAILED'
      });
    }
  }
);

/**
 * DELETE /api/images/:category/:blobName
 * Delete an image from Azure Blob Storage
 */
router.delete(
  '/:category/:blobName',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { category, blobName } = req.params;

      if (!['profile', 'user', 'room'].includes(category)) {
        return res.status(400).json({
          error: 'Invalid category',
          code: 'INVALID_CATEGORY'
        });
      }

      await AzureBlobService.deleteBlob(category as any, blobName);

      return res.json({
        message: 'Image deleted successfully',
      });
    } catch (error: any) {
      console.error('❌ Delete image error:', error);
      return res.status(500).json({
        error: 'Failed to delete image',
        code: 'DELETE_FAILED'
      });
    }
  }
);

export default router;

