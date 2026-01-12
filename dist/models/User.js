"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Point_1 = require("./schemas/Point");
const userSchema = new mongoose_1.default.Schema({
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        sparse: true,
        index: true,
        validate: {
            validator: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
            message: 'Invalid email format',
        },
    },
    age: {
        type: Number,
        required: true,
        min: 18,
        max: 100,
    },
    gender: {
        type: String,
        required: true,
        enum: ['male', 'female', 'other'],
    },
    location: {
        type: Point_1.pointSchema,
        index: '2dsphere',
        sparse: true,
    },
    photos: [{
            type: String,
            validate: {
                validator: (v) => /^https?:\/\/.+/.test(v),
                message: 'Invalid photo URL',
            },
        }],
    bio: {
        type: String,
        trim: true,
        maxlength: 500,
    },
    interests: [{
            type: String,
            trim: true,
        }],
    preferences: {
        ageRange: {
            min: {
                type: Number,
                required: true,
                min: 18,
                max: 100,
                default: 18,
            },
            max: {
                type: Number,
                required: true,
                min: 18,
                max: 100,
                default: 100,
            },
        },
        distance: {
            type: Number,
            required: true,
            min: 1,
            max: 500, // 500km max radius
            default: 50,
        },
        gender: [{
                type: String,
                enum: ['male', 'female', 'other'],
            }],
        interests: [{
                type: String,
                trim: true,
            }],
    },
    isProfileComplete: {
        type: Boolean,
        default: false,
    },
    onboardingCompleted: {
        type: Boolean,
        default: false,
        index: true, // For efficient queries filtering by onboarding status
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    lastActive: {
        type: Date,
        default: Date.now,
    },
    // Additional fields for room matching
    phone: {
        type: String,
        sparse: true,
    },
    occupation: {
        type: String,
        trim: true,
    },
    city: {
        type: String,
        trim: true,
    },
    budget: {
        min: {
            type: Number,
            min: 0,
        },
        max: {
            type: Number,
            min: 0,
        },
    },
    lifestyle: {
        smoking: {
            type: Boolean,
            default: false,
        },
        pets: {
            type: Boolean,
            default: false,
        },
        nightOwl: {
            type: Boolean,
            default: false,
        },
        cleanliness: {
            type: Number,
            min: 1,
            max: 5,
            default: 3,
        },
    },
    role: {
        type: String,
        enum: ['seeking_room', 'has_room'],
    },
    timeline: {
        type: String,
        enum: ['immediately', 'soon', 'flexible'],
    },
    privacySettings: {
        showLocation: {
            type: Boolean,
            default: true,
        },
        showAge: {
            type: Boolean,
            default: true,
        },
        showOccupation: {
            type: Boolean,
            default: true,
        },
    },
    photoUrls: [{
            type: String,
            validate: {
                // BETA-COMPATIBLE: Accept both demo:* identifiers AND http/https URLs
                validator: (v) => v.startsWith('demo:') || /^https?:\/\/.+/.test(v),
                message: 'Invalid photo reference',
            },
        }],
    passwordHash: {
        type: String,
        select: false, // Never include in queries by default
    },
    isFake: {
        type: Boolean,
        default: false,
        index: true, // For efficient queries to exclude fake users in production
    },
}, {
    timestamps: true,
});
// Indexes
// Phase 3: Documented and reviewed indexes
userSchema.index({ 'location': '2dsphere' }); // Geo queries
userSchema.index({ isActive: 1, lastActive: -1 }); // Active user filtering
userSchema.index({ interests: 1 }); // Interest-based queries (defer removal)
// Phase 3: Critical compound index for matching queries
// Supports: findMatches() which filters by role, city, and isActive
userSchema.index({ role: 1, city: 1, isActive: 1 }, {
    name: 'idx_matching',
    background: true
});
// Middleware
userSchema.pre('save', function (next) {
    // Check if profile is complete
    this.isProfileComplete = !!(this.name &&
        this.age &&
        this.gender &&
        this.photos.length > 0 &&
        this.interests.length > 0);
    next();
});
exports.UserModel = mongoose_1.default.model('User', userSchema);
