import mongoose from 'mongoose';

export interface IRefreshToken {
  userId: string;
  tokenId: string; // JWT jti claim
  expiresAt: Date;
  revoked: boolean;
  revokedAt?: Date;
  createdAt: Date;
  deviceId?: string;
  ipAddress?: string;
}

const refreshTokenSchema = new mongoose.Schema<IRefreshToken>({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  tokenId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  revoked: {
    type: Boolean,
    default: false,
    index: true,
  },
  revokedAt: {
    type: Date,
  },
  deviceId: {
    type: String,
  },
  ipAddress: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index for cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for finding user tokens
refreshTokenSchema.index({ userId: 1, revoked: 1 });

export const RefreshTokenModel = mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema);

