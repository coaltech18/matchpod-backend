"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const User_1 = require("../models/User");
const zod_1 = require("zod");
exports.router = (0, express_1.Router)();
// Profile update schema (for incoming payload validation)
const profileUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters').optional(),
    email: zod_1.z.string().email('Invalid email format').optional(),
    occupation: zod_1.z.string().min(2, 'Occupation must be at least 2 characters').optional(),
    bio: zod_1.z.string().max(500, 'Bio must be less than 500 characters').optional(),
    role: zod_1.z.enum(['has_room', 'seeking_room']).optional(),
    age: zod_1.z.number().min(18, 'Must be 18 or older').max(100, 'Must be 100 or younger').optional(),
    gender: zod_1.z.enum(['male', 'female', 'other']).optional(),
    profilePicture: zod_1.z.string().url('Invalid profile picture URL').optional(),
    // BETA-COMPATIBLE: Accept both demo:* identifiers AND http/https URLs
    photoUrls: zod_1.z.array(zod_1.z.string().refine((val) => val.startsWith('demo:') || /^https?:\/\/.+/.test(val), { message: 'Invalid photo reference' })).max(6, 'Maximum 6 user photos').optional(),
    roomPhotos: zod_1.z.array(zod_1.z.string().refine((val) => val.startsWith('demo:') || /^https?:\/\/.+/.test(val), { message: 'Invalid room photo reference' })).max(6, 'Maximum 6 room photos').optional(),
    budget: zod_1.z.object({
        min: zod_1.z.number().min(0, 'Budget min must be positive'),
        max: zod_1.z.number().min(0, 'Budget max must be positive'),
    }).optional(),
    timeline: zod_1.z.enum(['immediately', 'soon', 'flexible']).optional(),
    lifestyle: zod_1.z.object({
        smoking: zod_1.z.boolean(),
        pets: zod_1.z.boolean(),
        nightOwl: zod_1.z.boolean(),
        cleanliness: zod_1.z.number().int().min(1).max(5),
    }).optional(),
    location: zod_1.z.object({
        type: zod_1.z.literal('Point').optional(),
        coordinates: zod_1.z.tuple([zod_1.z.number(), zod_1.z.number()]).optional(),
    }).optional(),
    preferences: zod_1.z.object({
        budgetRange: zod_1.z.array(zod_1.z.number()).length(2).optional(),
        preferredAreas: zod_1.z.array(zod_1.z.string()).optional(),
        dealBreakers: zod_1.z.array(zod_1.z.string()).optional(),
        maxDistance: zod_1.z.number().min(1).max(500).optional(),
        ageRange: zod_1.z.object({
            min: zod_1.z.number().int().min(18).max(100).optional(),
            max: zod_1.z.number().int().min(18).max(100).optional(),
        }).optional(),
    }).optional(),
    city: zod_1.z.string().max(100).optional(),
    interests: zod_1.z.array(zod_1.z.string()).max(20).optional(),
    isActive: zod_1.z.boolean().optional(),
});
/**
 * Validate required fields for a completed profile
 * Returns array of validation errors, empty if valid
 */
function validateRequiredFields(userData) {
    const errors = [];
    // Email validation
    if (userData.email === null || userData.email === undefined || userData.email === '') {
        errors.push({ field: 'email', message: 'Email cannot be empty' });
    }
    else if (typeof userData.email === 'string') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userData.email)) {
            errors.push({ field: 'email', message: 'Email must be a valid email address' });
        }
    }
    // Role validation
    if (userData.role === null || userData.role === undefined || userData.role === '') {
        errors.push({ field: 'role', message: 'Role cannot be empty' });
    }
    else if (!['seeking_room', 'has_room'].includes(userData.role)) {
        errors.push({ field: 'role', message: 'Role must be seeking_room or has_room' });
    }
    // Budget validation
    if (userData.budget === null || userData.budget === undefined) {
        errors.push({ field: 'budget', message: 'Budget cannot be empty' });
    }
    else {
        if (userData.budget.min === null || userData.budget.min === undefined || typeof userData.budget.min !== 'number') {
            errors.push({ field: 'budget.min', message: 'Budget minimum is required' });
        }
        else if (userData.budget.min < 0) {
            errors.push({ field: 'budget.min', message: 'Budget minimum must be positive' });
        }
        if (userData.budget.max === null || userData.budget.max === undefined || typeof userData.budget.max !== 'number') {
            errors.push({ field: 'budget.max', message: 'Budget maximum is required' });
        }
        else if (userData.budget.max < 0) {
            errors.push({ field: 'budget.max', message: 'Budget maximum must be positive' });
        }
        if (typeof userData.budget.min === 'number' && typeof userData.budget.max === 'number') {
            if (userData.budget.max < userData.budget.min) {
                errors.push({ field: 'budget.max', message: 'Budget maximum must be greater than or equal to minimum' });
            }
        }
    }
    // Timeline validation
    if (userData.timeline === null || userData.timeline === undefined || userData.timeline === '') {
        errors.push({ field: 'timeline', message: 'Timeline cannot be empty' });
    }
    else if (!['immediately', 'soon', 'flexible'].includes(userData.timeline)) {
        errors.push({ field: 'timeline', message: 'Timeline must be immediately, soon, or flexible' });
    }
    // Lifestyle validation
    if (userData.lifestyle === null || userData.lifestyle === undefined) {
        errors.push({ field: 'lifestyle', message: 'Lifestyle preferences cannot be empty' });
    }
    else {
        if (typeof userData.lifestyle.smoking !== 'boolean') {
            errors.push({ field: 'lifestyle.smoking', message: 'Smoking preference is required' });
        }
        if (typeof userData.lifestyle.pets !== 'boolean') {
            errors.push({ field: 'lifestyle.pets', message: 'Pets preference is required' });
        }
        if (typeof userData.lifestyle.nightOwl !== 'boolean') {
            errors.push({ field: 'lifestyle.nightOwl', message: 'Night owl preference is required' });
        }
        if (typeof userData.lifestyle.cleanliness !== 'number' ||
            userData.lifestyle.cleanliness < 1 ||
            userData.lifestyle.cleanliness > 5) {
            errors.push({ field: 'lifestyle.cleanliness', message: 'Cleanliness must be a number between 1 and 5' });
        }
    }
    return errors;
}
/**
 * Deep merge objects, with incoming values overwriting existing
 * Handles nested objects properly
 */
function deepMerge(existing, incoming) {
    const result = { ...existing };
    for (const key of Object.keys(incoming)) {
        const incomingValue = incoming[key];
        // Skip undefined values - preserve existing
        if (incomingValue === undefined) {
            continue;
        }
        // Handle nested objects (but not arrays)
        if (incomingValue !== null &&
            typeof incomingValue === 'object' &&
            !Array.isArray(incomingValue) &&
            existing[key] !== null &&
            typeof existing[key] === 'object' &&
            !Array.isArray(existing[key])) {
            result[key] = deepMerge(existing[key], incomingValue);
        }
        else {
            result[key] = incomingValue;
        }
    }
    return result;
}
/**
 * PUT /api/profile/update
 * Update user profile with required field guardrails
 *
 * IMPORTANT:
 * - Validates that required fields are not cleared
 * - Atomic update: all-or-nothing
 * - Preserves existing data when fields are not provided
 */
exports.router.put('/update', auth_1.requireAuth, auth_1.requireOnboardingCompleted, (0, validate_1.validateBody)(profileUpdateSchema), async (req, res) => {
    try {
        const userId = req.user.id;
        const updatePayload = req.body;
        console.log(`[Profile] Update request for user ${userId}`);
        // 1. Fetch existing user first
        const existingUser = await User_1.UserModel.findById(userId).lean();
        if (!existingUser) {
            console.log(`[Profile] User ${userId} not found`);
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        // 2. Check if user has completed onboarding (extra safety check)
        if (!existingUser.onboardingCompleted) {
            console.log(`[Profile] User ${userId} has not completed onboarding`);
            return res.status(403).json({
                error: 'Please complete onboarding before updating profile',
                code: 'ONBOARDING_INCOMPLETE'
            });
        }
        // 3. Merge incoming payload with existing user data
        // This preserves existing values for fields not included in update
        const mergedData = deepMerge(existingUser, updatePayload);
        // 4. Validate merged result for required fields
        // This prevents corruption of required data
        const validationErrors = validateRequiredFields(mergedData);
        if (validationErrors.length > 0) {
            console.log(`[Profile] Validation failed for user ${userId}:`, validationErrors);
            return res.status(400).json({
                error: 'Profile update validation failed',
                code: 'VALIDATION_ERROR',
                details: validationErrors
            });
        }
        // 5. Check email uniqueness if email is being changed
        if (updatePayload.email && updatePayload.email.toLowerCase() !== existingUser.email?.toLowerCase()) {
            const emailExists = await User_1.UserModel.findOne({
                email: updatePayload.email.toLowerCase(),
                _id: { $ne: userId }
            }).lean();
            if (emailExists) {
                console.log(`[Profile] Email ${updatePayload.email} already exists`);
                return res.status(409).json({
                    error: 'Email is already registered to another account',
                    code: 'EMAIL_EXISTS',
                    details: [{ field: 'email', message: 'Email is already registered to another account' }]
                });
            }
        }
        // 6. Prepare sanitized update object
        const sanitizedUpdate = {};
        Object.keys(updatePayload).forEach(key => {
            if (updatePayload[key] !== undefined) {
                sanitizedUpdate[key] = updatePayload[key];
            }
        });
        // Normalize email to lowercase
        if (sanitizedUpdate.email) {
            sanitizedUpdate.email = sanitizedUpdate.email.toLowerCase().trim();
        }
        // Add timestamps
        sanitizedUpdate.updatedAt = new Date();
        sanitizedUpdate.lastActive = new Date();
        // 7. Atomically update user (validation passed, safe to update)
        const updatedUser = await User_1.UserModel.findByIdAndUpdate(userId, { $set: sanitizedUpdate }, { new: true, runValidators: true }).select('-__v -passwordHash').lean();
        if (!updatedUser) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        console.log(`[Profile] Successfully updated profile for user ${userId}`);
        res.json({
            success: true,
            data: updatedUser
        });
    }
    catch (error) {
        console.error('[Profile] Update error:', error);
        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const validationErrors = Object.keys(error.errors).map(field => ({
                field,
                message: error.errors[field].message
            }));
            return res.status(400).json({
                error: 'Profile update validation failed',
                code: 'VALIDATION_ERROR',
                details: validationErrors
            });
        }
        // Handle duplicate key errors
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({
                error: `${field} already exists`,
                code: 'DUPLICATE_FIELD',
                details: [{ field, message: `${field} is already in use` }]
            });
        }
        res.status(500).json({
            error: 'Failed to update profile',
            code: 'PROFILE_UPDATE_ERROR'
        });
    }
});
/**
 * GET /api/profile/me
 * Get current user's profile
 */
exports.router.get('/me', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User_1.UserModel.findById(userId)
            .select('-__v -passwordHash')
            .lean();
        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        res.json({
            success: true,
            data: user
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            error: 'Failed to get profile'
        });
    }
});
/**
 * POST /api/profile/upload-photo
 * Upload profile photo (placeholder - implement with actual file upload)
 */
exports.router.post('/upload-photo', auth_1.requireAuth, auth_1.requireOnboardingCompleted, async (req, res) => {
    try {
        const userId = req.user.id;
        const { photoUrl } = req.body;
        if (!photoUrl) {
            return res.status(400).json({
                error: 'Photo URL is required'
            });
        }
        // Add photo URL to user's photoUrls array
        const user = await User_1.UserModel.findByIdAndUpdate(userId, { $push: { photoUrls: photoUrl } }, { new: true, runValidators: true }).select('photoUrls').lean();
        if (!user) {
            return res.status(404).json({
                error: 'User not found'
            });
        }
        res.json({
            success: true,
            data: {
                photoUrls: user.photoUrls
            }
        });
    }
    catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({
            error: 'Failed to upload photo'
        });
    }
});
exports.default = exports.router;
