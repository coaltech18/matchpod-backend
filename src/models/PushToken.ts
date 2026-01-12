import mongoose, { Document, Types } from 'mongoose';

export interface IPushToken extends Document {
  userId: Types.ObjectId | string;
  token: string;
  platform: 'ios' | 'android';
  deviceId?: string;
  isValid: boolean;
  lastUsed: Date;
  expoPushToken?: string; // Expo push token
  createdAt: Date;
  updatedAt: Date;
}

const pushTokenSchema = new mongoose.Schema<IPushToken>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    platform: {
      type: String,
      required: true,
      enum: ['ios', 'android'],
    },
    deviceId: {
      type: String,
      sparse: true,
    },
    isValid: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastUsed: {
      type: Date,
      default: Date.now,
    },
    expoPushToken: {
      type: String,
      sparse: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
pushTokenSchema.index({ userId: 1, isValid: 1 });
pushTokenSchema.index({ token: 1, isValid: 1 });
pushTokenSchema.index({ lastUsed: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days TTL

// Middleware to update lastUsed
pushTokenSchema.pre('save', function(next) {
  const doc = this as any;
  if (doc.isValid) {
    doc.lastUsed = new Date();
  }
  next();
});

export const PushTokenModel = mongoose.model<IPushToken>('PushToken', pushTokenSchema);