"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const authorize_1 = require("../middleware/authorize");
const validate_1 = require("../middleware/validate");
const User_1 = require("../models/User");
exports.router = (0, express_1.Router)();
// Test route - no authentication required
exports.router.get('/', (req, res) => {
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
exports.router.get('/me', auth_1.requireAuth, async (req, res) => {
    try {
        const user = await User_1.UserModel.findById(req.user.id)
            .select('-__v -createdAt -updatedAt')
            .lean();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});
// Update preferences with validation
exports.router.patch('/me/preferences', auth_1.requireAuth, auth_1.requireOnboardingCompleted, (0, validate_1.validateBody)(zod_1.z.object({
    budgetRange: validate_1.commonSchemas.budgetRange.optional(),
    preferredAreas: validate_1.commonSchemas.preferredAreas.optional(),
    ageRange: validate_1.commonSchemas.ageRange.optional(),
    dealBreakers: validate_1.commonSchemas.dealBreakers.optional(),
    interests: validate_1.commonSchemas.interests.optional(),
    vegetarianPreference: zod_1.z.boolean().optional(),
    startupCollaboration: zod_1.z.boolean().optional(),
    familyVisitAccommodation: zod_1.z.boolean().optional(),
})), async (req, res) => {
    try {
        const update = req.body;
        // Validate and sanitize update data
        const allowedFields = [
            'budgetRange', 'preferredAreas', 'ageRange', 'dealBreakers',
            'interests', 'vegetarianPreference', 'startupCollaboration',
            'familyVisitAccommodation'
        ];
        const sanitizedUpdate = {};
        allowedFields.forEach(field => {
            if (update[field] !== undefined) {
                sanitizedUpdate[`preferences.${field}`] = update[field];
            }
        });
        const user = await User_1.UserModel.findByIdAndUpdate(req.user.id, { $set: sanitizedUpdate }, { new: true, runValidators: true }).select('-__v -createdAt -updatedAt').lean();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});
// Get user profile by ID (with authorization)
exports.router.get('/:userId', auth_1.requireAuth, auth_1.requireOnboardingCompleted, (0, validate_1.validateParams)(zod_1.z.object({ userId: validate_1.commonSchemas.objectId })), (0, authorize_1.requireProfileAccess)(), async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User_1.UserModel.findById(userId)
            .select('name age gender occupation photoUrls bio preferences.vegetarianPreference preferences.interests')
            .lean();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ error: 'Failed to get user profile' });
    }
});
// Potential matches with authorization and validation
exports.router.get('/potential-matches', auth_1.requireAuth, auth_1.requireOnboardingCompleted, (0, authorize_1.requireMatchesAccess)(), (0, validate_1.validateQuery)(zod_1.z.object({
    filters: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().min(1).max(100).optional(),
    offset: zod_1.z.coerce.number().min(0).optional(),
})), async (req, res) => {
    try {
        const { filters: filterParam, limit = 50, offset = 0 } = req.query;
        // Parse and validate filters
        let filters = {};
        if (filterParam) {
            try {
                filters = JSON.parse(filterParam);
            }
            catch (e) {
                return res.status(400).json({ error: 'Invalid filters format' });
            }
        }
        // Build query with security checks
        const query = {
            isActive: true,
            _id: { $ne: req.user.id } // Exclude current user
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
        const users = await User_1.UserModel.find(query)
            .select('name age gender occupation photoUrls preferences.budgetRange preferences.preferredAreas')
            .limit(limit)
            .skip(offset)
            .lean();
        res.json(users);
    }
    catch (error) {
        console.error('Get potential matches error:', error);
        res.status(500).json({ error: 'Failed to get potential matches' });
    }
});
