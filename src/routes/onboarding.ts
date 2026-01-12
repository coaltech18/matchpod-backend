import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { UserModel } from '../models/User';
import { sendWelcomeEmail } from '../services/emailService';

export const router = Router();

/**
 * Onboarding submission schema
 * All required fields for completing user onboarding
 */
const onboardingSchema = z.object({
    // Required fields
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    age: z.number().int().min(18, 'Must be at least 18 years old').max(100),
    email: z.string().email('Invalid email format'),
    gender: z.enum(['male', 'female', 'other']),
    role: z.enum(['seeking_room', 'has_room']),

    // Budget (required for roommate matching)
    budget: z.object({
        min: z.number().min(0, 'Budget min must be positive'),
        max: z.number().min(0, 'Budget max must be positive'),
    }).refine(data => data.max >= data.min, {
        message: 'Budget max must be greater than or equal to min',
    }),

    // Timeline (required)
    timeline: z.enum(['immediately', 'soon', 'flexible']),

    // Lifestyle preferences (required for matching)
    lifestyle: z.object({
        smoking: z.boolean(),
        pets: z.boolean(),
        nightOwl: z.boolean(),
        cleanliness: z.number().int().min(1).max(5),
    }),

    // Optional fields
    bio: z.string().max(500).optional(),
    occupation: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    interests: z.array(z.string()).max(20).optional(),
    // BETA-COMPATIBLE: Accept both demo:* identifiers AND http/https URLs
    photoUrls: z.array(
        z.string().refine(
            (val) => val.startsWith('demo:') || /^https?:\/\/.+/.test(val),
            { message: 'Invalid photo reference' }
        )
    ).max(6).optional(),

    // Optional preferences
    preferences: z.object({
        ageRange: z.object({
            min: z.number().int().min(18).max(100).optional(),
            max: z.number().int().min(18).max(100).optional(),
        }).optional(),
        distance: z.number().min(1).max(500).optional(),
        preferredAreas: z.array(z.string()).max(10).optional(),
        dealBreakers: z.array(z.string()).max(10).optional(),
    }).optional(),

    // Optional location
    location: z.object({
        type: z.literal('Point').optional(),
        coordinates: z.tuple([z.number(), z.number()]).optional(), // [longitude, latitude]
    }).optional(),
});

type OnboardingPayload = z.infer<typeof onboardingSchema>;

/**
 * POST /api/onboarding/submit
 * 
 * Complete user onboarding with all required profile data.
 * Sets onboardingCompleted = true atomically upon success.
 * 
 * IMPORTANT:
 * - This is the ONLY endpoint that sets onboardingCompleted = true
 * - All required fields must pass validation
 * - If validation fails, onboardingCompleted remains false
 * - Endpoint is idempotent (safe to retry)
 */
router.post('/submit',
    requireAuth,
    validateBody(onboardingSchema),
    async (req: AuthRequest, res) => {
        try {
            const userId = req.user!.id;
            const payload: OnboardingPayload = req.body;

            console.log(`[Onboarding] Processing submission for user ${userId}`);

            // CRITICAL: Normalize gender before validation/storage
            // This prevents "Male" vs "male" mismatches
            const normalizedGender = payload.gender?.trim().toLowerCase() as 'male' | 'female' | 'other';

            // Validate normalized gender is in allowed values
            if (!['male', 'female', 'other'].includes(normalizedGender)) {
                return res.status(400).json({
                    error: 'Please select a valid gender (Male, Female, or Other)',
                    code: 'INVALID_GENDER',
                    field: 'gender'
                });
            }

            // Check if email is unique (excluding current user)
            const existingEmail = await UserModel.findOne({
                email: payload.email.toLowerCase(),
                _id: { $ne: userId }
            }).lean();

            if (existingEmail) {
                console.log(`[Onboarding] Email ${payload.email} already exists`);
                return res.status(409).json({
                    error: 'Email is already registered to another account',
                    code: 'EMAIL_EXISTS',
                    field: 'email'
                });
            }

            // Prepare update object with all onboarding data
            const updateData: any = {
                // Required fields
                name: payload.name.trim(),
                age: payload.age,
                email: payload.email.toLowerCase().trim(),
                gender: normalizedGender, // Use normalized gender
                role: payload.role,
                budget: payload.budget,
                timeline: payload.timeline,
                lifestyle: payload.lifestyle,

                // Optional fields
                bio: payload.bio?.trim(),
                occupation: payload.occupation?.trim(),
                city: payload.city?.trim(),
                interests: payload.interests || [],
                photoUrls: payload.photoUrls || [],

                // Mark onboarding as completed - THIS IS THE KEY
                onboardingCompleted: true,
                isProfileComplete: true,

                // Update timestamps
                lastActive: new Date(),
            };

            // Add preferences if provided
            if (payload.preferences) {
                updateData.preferences = {
                    ...updateData.preferences,
                    ageRange: payload.preferences.ageRange || { min: 18, max: 100 },
                    distance: payload.preferences.distance || 50,
                };

                // Handle array fields in preferences
                if (payload.preferences.preferredAreas) {
                    updateData['preferences.preferredAreas'] = payload.preferences.preferredAreas;
                }
                if (payload.preferences.dealBreakers) {
                    updateData['preferences.dealBreakers'] = payload.preferences.dealBreakers;
                }
            }

            // Add location if provided
            if (payload.location?.coordinates) {
                updateData.location = {
                    type: 'Point',
                    coordinates: payload.location.coordinates
                };
            }

            // Atomically update user with all onboarding data
            const updatedUser = await UserModel.findByIdAndUpdate(
                userId,
                { $set: updateData },
                {
                    new: true,
                    runValidators: true
                }
            ).select('-passwordHash -__v').lean();

            if (!updatedUser) {
                console.error(`[Onboarding] User ${userId} not found`);
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            console.log(`[Onboarding] Successfully completed onboarding for user ${userId}`);

            // FIRE-AND-FORGET: Send welcome email asynchronously
            // Do NOT await - response is returned immediately
            // Email failure does NOT affect onboarding success
            sendWelcomeEmail(
                payload.email.toLowerCase().trim(),
                payload.name.trim(),
                userId
            ).catch((error: any) => {
                // This catch is a safety net - sendWelcomeEmail should never throw
                console.error(`[Onboarding] Unexpected error in welcome email (user ${userId}):`, error?.message || error);
            });

            // Return success immediately - email is sent in background
            return res.json({
                success: true,
                message: 'Onboarding completed successfully',
                data: {
                    user: updatedUser,
                    onboardingCompleted: true
                }
            });
        } catch (error: any) {
            console.error('[Onboarding] Submit error:', error);

            // Handle Mongoose validation errors
            if (error.name === 'ValidationError') {
                const validationErrors = Object.keys(error.errors).map(field => ({
                    field,
                    message: error.errors[field].message
                }));

                return res.status(400).json({
                    error: 'Validation failed',
                    code: 'VALIDATION_ERROR',
                    details: validationErrors
                });
            }

            // Handle duplicate key errors (e.g., email)
            if (error.code === 11000) {
                const field = Object.keys(error.keyPattern)[0];
                return res.status(409).json({
                    error: `${field} already exists`,
                    code: 'DUPLICATE_FIELD',
                    field
                });
            }

            return res.status(500).json({
                error: 'Failed to complete onboarding',
                code: 'ONBOARDING_ERROR'
            });
        }
    }
);

/**
 * GET /api/onboarding/status
 * 
 * Check current onboarding status for the authenticated user.
 * Returns onboardingCompleted flag and missing required fields.
 */
router.get('/status',
    requireAuth,
    async (req: AuthRequest, res) => {
        try {
            const userId = req.user!.id;

            const user = await UserModel.findById(userId)
                .select('onboardingCompleted name age email gender role budget timeline lifestyle')
                .lean();

            if (!user) {
                return res.status(404).json({
                    error: 'User not found',
                    code: 'USER_NOT_FOUND'
                });
            }

            // Check which required fields are missing
            const missingFields: string[] = [];
            if (!user.name) missingFields.push('name');
            if (!user.age) missingFields.push('age');
            if (!user.email) missingFields.push('email');
            if (!user.gender) missingFields.push('gender');
            if (!user.role) missingFields.push('role');
            if (!user.budget) missingFields.push('budget');
            if (!user.timeline) missingFields.push('timeline');
            if (!user.lifestyle) missingFields.push('lifestyle');

            return res.json({
                success: true,
                data: {
                    onboardingCompleted: user.onboardingCompleted === true,
                    missingFields,
                    isComplete: missingFields.length === 0 && user.onboardingCompleted === true
                }
            });
        } catch (error: any) {
            console.error('[Onboarding] Status check error:', error);
            return res.status(500).json({
                error: 'Failed to check onboarding status',
                code: 'STATUS_CHECK_ERROR'
            });
        }
    }
);

export default router;
