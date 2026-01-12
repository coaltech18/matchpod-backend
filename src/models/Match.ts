import mongoose, { Document, Types } from 'mongoose';

export interface IMatch extends Document {
  userA: Types.ObjectId | string;
  userB: Types.ObjectId | string;
  status: 'pending' | 'accepted' | 'rejected';
  initiator: Types.ObjectId | string;
  respondedAt?: Date;
  lastInteractionAt: Date;
  isMutual: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const matchSchema = new mongoose.Schema<IMatch>(
  {
    userA: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userB: {
      type: mongoose.Schema.Types.ObjectId,
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
      type: mongoose.Schema.Types.ObjectId,
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
  },
  {
    timestamps: true,
  }
);

// Indexes
matchSchema.index({ userA: 1, userB: 1 }, { unique: true });
matchSchema.index({ status: 1, lastInteractionAt: -1 });
matchSchema.index({ isMutual: 1, lastInteractionAt: -1 });

// Prevent matching with self
matchSchema.pre('save', function(next) {
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

export const MatchModel = mongoose.model<IMatch>('Match', matchSchema);