"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const matchSchema = new mongoose_1.default.Schema({
    userA: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    userB: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending',
    },
    initiator: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
    },
    respondedAt: {
        type: Date,
    },
    lastInteractionAt: {
        type: Date,
        default: Date.now,
    },
    isMutual: {
        type: Boolean,
        default: false,
    },
}, {
    timestamps: true,
});
// Indexes
matchSchema.index({ userA: 1, userB: 1 }, { unique: true });
matchSchema.index({ status: 1, lastInteractionAt: -1 });
matchSchema.index({ isMutual: 1, lastInteractionAt: -1 });
// Prevent matching with self
matchSchema.pre('save', function (next) {
    if (this.userA && this.userB) {
        if (this.userA.toString() === this.userB.toString()) {
            return next(new Error('Cannot create a match between the same user'));
        }
    }
    // Update lastInteractionAt on status change
    if (this.isModified('status')) {
        this.lastInteractionAt = new Date();
        if (this.status !== 'pending') {
            this.respondedAt = new Date();
        }
    }
    next();
});
exports.MatchModel = mongoose_1.default.model('Match', matchSchema);
