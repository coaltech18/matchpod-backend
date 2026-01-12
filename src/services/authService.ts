/**
 * Authentication Service
 * Phase 2: Uses centralized config for JWT settings
 */

import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { getJwtConfig } from '../config/env';

export interface TokenPayload {
  id: string;
  userId?: string; // For backward compatibility
  roles?: string[]; // For backward compatibility
  iat?: number;
  exp?: number;
}

export const verifyToken = (token: string): TokenPayload => {
  try {
    const { secret } = getJwtConfig();
    return jwt.verify(token, secret) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

export const generateToken = (payload: TokenPayload): string => {
  const { secret, expiresIn } = getJwtConfig();

  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const { refreshSecret, refreshExpiresIn } = getJwtConfig();

  return jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn } as jwt.SignOptions);
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const { refreshSecret } = getJwtConfig();
    return jwt.verify(token, refreshSecret) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        [key: string]: any;
      };
    }
  }
}
