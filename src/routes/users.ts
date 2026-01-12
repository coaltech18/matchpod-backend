import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireOnboardingCompleted, AuthRequest } from '../middleware/auth';
import { requireOwnership, requireProfileAccess, requireMatchesAccess } from '../middleware/authorize';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate';
import { UserModel } from '../models/User';

export const router = Router();

// Test route - no authentication required
router.get('/', (req, res) => {
  res.json({
    message: 'Users API is working',
    availableEndpoints: [
      'GET /api/users/me (requires auth)',
      'GET /api/users/:userId (requires auth)',
      'GET /api/users/potential-matches (requires auth)',
      'PATCH /api/users/me (requires auth)'
    ]
  });
});

// Get own profile
router.get('/me',
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const user = await UserModel.findById(req.user!.id)
        .select('-__v -createdAt -updatedAt')
        .lean();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to get profile' });
    }
  }
);

// Update preferences with validation
router.patch('/me/preferences',
  requireAuth,
  requireOnboardingCompleted,
  validateBody(z.object({
    budgetRange: commonSchemas.budgetRange.optional(),
    preferredAreas: commonSchemas.preferredAreas.optional(),
    ageRange: commonSchemas.ageRange.optional(),
    dealBreakers: commonSchemas.dealBreakers.optional(),
    interests: commonSchemas.interests.optional(),
    vegetarianPreference: z.boolean().optional(),
    startupCollaboration: z.boolean().optional(),
    familyVisitAccommodation: z.boolean().optional(),
  })),
  async (req: AuthRequest, res) => {
    try {
      const update = req.body;

      // Validate and sanitize update data
      const allowedFields = [
        'budgetRange', 'preferredAreas', 'ageRange', 'dealBreakers',
        'interests', 'vegetarianPreference', 'startupCollaboration',
        'familyVisitAccommodation'
      ];

      const sanitizedUpdate: any = {};
      allowedFields.forEach(field => {
        if (update[field] !== undefined) {
          sanitizedUpdate[`preferences.${field}`] = update[field];
        }
      });

      const user = await UserModel.findByIdAndUpdate(
        req.user!.id,
        { $set: sanitizedUpdate },
        { new: true, runValidators: true }
      ).select('-__v -createdAt -updatedAt').lean();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Update preferences error:', error);
      res.status(500).json({ error: 'Failed to update preferences' });
    }
  }
);

// Get user profile by ID (with authorization)
router.get('/:userId',
  requireAuth,
  requireOnboardingCompleted,
  validateParams(z.object({ userId: commonSchemas.objectId })),
  requireProfileAccess(),
  async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;

      const user = await UserModel.findById(userId)
        .select('name age gender occupation photoUrls bio preferences.vegetarianPreference preferences.interests')
        .lean();

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json(user);
    } catch (error) {
      console.error('Get user profile error:', error);
      res.status(500).json({ error: 'Failed to get user profile' });
    }
  }
);

// Potential matches with authorization and validation
router.get('/potential-matches',
  requireAuth,
  requireOnboardingCompleted,
  requireMatchesAccess(),
  validateQuery(z.object({
    filters: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    offset: z.coerce.number().min(0).optional(),
  })),
  async (req: AuthRequest, res) => {
    try {
      const { filters: filterParam, limit = 50, offset = 0 } = req.query;

      // Parse and validate filters
      let filters: any = {};
      if (filterParam) {
        try {
          filters = JSON.parse(filterParam as string);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid filters format' });
        }
      }

      // Build query with security checks
      const query: any = {
        isActive: true,
        _id: { $ne: req.user!.id } // Exclude current user
      };

      // Apply filters with validation
      if (filters.preferredAreas?.length) {
        query['preferences.preferredAreas'] = { $in: filters.preferredAreas };
      }

      if (filters.budgetRange?.length === 2) {
        query['preferences.budgetRange.0'] = { $lte: filters.budgetRange[1] };
        query['preferences.budgetRange.1'] = { $gte: filters.budgetRange[0] };
      }

      if (typeof filters.startupCollaboration === 'boolean') {
        query['preferences.startupCollaboration'] = filters.startupCollaboration;
      }

      if (typeof filters.familyVisitAccommodation === 'boolean') {
        query['preferences.familyVisitAccommodation'] = filters.familyVisitAccommodation;
      }

      const users = await UserModel.find(query)
        .select('name age gender occupation photoUrls preferences.budgetRange preferences.preferredAreas')
        .limit(limit as number)
        .skip(offset as number)
        .lean();

      res.json(users);
    } catch (error) {
      console.error('Get potential matches error:', error);
      res.status(500).json({ error: 'Failed to get potential matches' });
    }
  }
);


