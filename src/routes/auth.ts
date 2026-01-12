import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { UserModel } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { generateToken, generateRefreshToken, verifyRefreshToken, requireAuth, type AuthRequest } from '../middleware/auth';
import { validateBody, validatePhoneNumber, validateOTP, commonSchemas } from '../middleware/validate';
// Phase 4: Updated rate limiters with reviewer-safe limits
import { otpRateLimit, authRateLimit, loginRateLimit, refreshRateLimit, registerRateLimit } from '../middleware/rateLimit';

export const router = Router();

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).optional(),
});

// Phase 4: Registration rate limit (3/hour/IP)
router.post('/register',
  registerRateLimit,
  async (req, res) => {
    try {
      const body = credentialsSchema.parse(req.body);
      const existing = await UserModel.findOne({ email: body.email });
      if (existing) return res.status(409).json({ error: 'Email already in use' });

      const hash = await bcrypt.hash(body.password, 10);
      const user = await UserModel.create({
        email: body.email,
        passwordHash: hash,
        name: body.name || body.email.split('@')[0],
      });

      const token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET || 'dev_secret_change_me', {
        expiresIn: '30d',
      });
      return res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Invalid payload' });
    }
  });

// Phase 4: Login rate limit per phone/email (5/5min)
router.post('/login',
  loginRateLimit,
  async (req, res) => {
    try {
      const body = credentialsSchema.pick({ email: true, password: true }).parse(req.body);
      const user = await UserModel.findOne({ email: body.email });
      if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });

      const ok = await bcrypt.compare(body.password, user.passwordHash!);
      if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

      const token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET || 'dev_secret_change_me', {
        expiresIn: '30d',
      });
      return res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || 'Invalid payload' });
    }
  });

// Registration with phone number - SIMPLIFIED FOR BETA
// Only phone + role required, everything else optional
const registrationSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits'),
  role: z.enum(['has_room', 'seeking_room'], { required_error: 'Please select a role' }),
  // All other fields are optional - no validation at registration
  name: z.string().optional(),
  age: z.coerce.number().optional(),
  gender: z.string().optional(),
  occupation: z.string().optional(),
});

// Phase 4: Registration rate limit for phone registration
router.post('/register-phone', registerRateLimit, async (req, res) => {
  try {
    const body = registrationSchema.parse(req.body);

    // Check if user already exists with this phone number
    // Check both phone and phoneNumber fields for consistency
    const existingUser = await UserModel.findOne({
      $or: [
        { phone: body.phone },
        { phoneNumber: body.phone }
      ]
    });
    console.log(`Registration attempt for phone: ${body.phone}, Already exists: ${!!existingUser}`);
    if (existingUser) {
      return res.status(409).json({ error: 'Phone number already registered' });
    }

    // Create new user with phone mapped to phoneNumber for schema consistency
    const user = await UserModel.create({
      phone: body.phone,
      phoneNumber: body.phone, // CRITICAL: Map to phoneNumber for schema compatibility
      name: body.name || 'New User', // Default name for schema requirement
      age: body.age || 25, // Default age for schema requirement
      gender: body.gender || 'other', // Default gender for schema requirement
      occupation: body.occupation,
      role: body.role,
    });

    const token = jwt.sign({ id: user._id.toString() }, process.env.JWT_SECRET || 'dev_secret_change_me', {
      expiresIn: '30d',
    });

    return res.json({
      userId: user._id.toString(),
      accessToken: token,
      expiresIn: 3600 * 24 * 30, // 30 days
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (e: any) {
    console.error('Registration error:', e);
    return res.status(400).json({ error: e?.message || 'Registration failed. Please try again.' });
  }
});

// Beta static OTP configuration
const BETA_STATIC_OTP = '123456';
const isBetaOtpMode = () => {
  // Beta mode is active unless explicitly disabled in production
  const isProduction = process.env.NODE_ENV === 'production';
  const betaDisabled = process.env.BETA_STATIC_OTP === 'false';
  const result = !isProduction || !betaDisabled;
  console.log(`[Beta OTP] Mode check: isProduction=${isProduction}, betaDisabled=${betaDisabled}, result=${result}`);
  return result;
};

// In-memory OTP storage for beta (5 minute expiry)
const otpStore = new Map<string, { otp: string; expiresAt: number }>();

// Send OTP with rate limiting and security
router.post('/send-otp',
  otpRateLimit,
  validateBody(z.object({ phone: commonSchemas.phone })),
  async (req, res) => {
    try {
      const { phone } = req.body;

      // Beta mode: Use static OTP
      if (isBetaOtpMode()) {
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
        otpStore.set(phone, { otp: BETA_STATIC_OTP, expiresAt });

        console.log(`[Beta OTP] Static OTP ${BETA_STATIC_OTP} set for ${phone}`);

        return res.json({
          success: true,
          message: 'OTP sent'
        });
      }

      // Production mode: Would send real SMS here
      // For now, this path is not active since we're in beta
      return res.status(503).json({
        error: 'SMS service not configured',
        code: 'SMS_NOT_AVAILABLE'
      });
    } catch (e: any) {
      console.error('Send OTP error:', e);
      return res.status(500).json({ error: 'Failed to send OTP' });
    }
  }
);


// Phase 4: Login rate limit on OTP verify (per phone)
router.post('/verify-otp',
  loginRateLimit,
  validateBody(z.object({
    phone: commonSchemas.phone,
    otp: commonSchemas.otp
  })),
  async (req, res) => {
    try {
      const { phone, otp } = req.body;
      const deviceId = req.headers['x-device-id'] as string;
      const ipAddress = req.ip || req.connection.remoteAddress;

      // Beta mode: Verify against static OTP
      if (isBetaOtpMode()) {
        // Check if OTP was requested for this phone
        const storedOtp = otpStore.get(phone);

        if (!storedOtp) {
          return res.status(401).json({
            error: 'No OTP requested for this phone number. Please request OTP first.',
            code: 'OTP_NOT_REQUESTED'
          });
        }

        // Check if OTP has expired
        if (Date.now() > storedOtp.expiresAt) {
          otpStore.delete(phone);
          return res.status(401).json({
            error: 'OTP has expired. Please request a new one.',
            code: 'OTP_EXPIRED'
          });
        }

        // Verify OTP matches static value
        if (otp !== BETA_STATIC_OTP) {
          return res.status(401).json({
            error: 'Invalid OTP. Please try again.',
            code: 'INVALID_OTP'
          });
        }

        // OTP verified, clear it
        otpStore.delete(phone);
        console.log(`[Beta OTP] OTP verified for ${phone}`);
      }

      // Find user by phone (check both fields for consistency)
      const user = await UserModel.findOne({
        $or: [
          { phone },
          { phoneNumber: phone }
        ]
      });
      if (!user) {
        return res.status(401).json({
          error: 'Phone number not registered. Please register first.',
          code: 'USER_NOT_FOUND'
        });
      }

      // BETA SAFETY: Block fake users from OTP login
      if (user.isFake === true) {
        console.log(`[Beta] Blocked OTP login attempt for fake user: ${phone}`);
        return res.status(401).json({
          error: 'This account cannot be accessed.',
          code: 'ACCOUNT_RESTRICTED'
        });
      }

      // Generate tokens - EXTENDED TO 30m FOR BETA (onboarding safety)
      const accessToken = generateToken({
        id: user._id.toString(),
        phone: user.phone || undefined,
        expiresIn: '30m' // Extended from 15m for onboarding stability
      });

      const refreshToken = generateRefreshToken({
        id: user._id.toString(),
        phone: user.phone || undefined,
        deviceId
      });

      // Decode refresh token to get jti and exp
      const decoded = jwt.decode(refreshToken) as any;

      // Store refresh token in database
      await RefreshTokenModel.create({
        userId: user._id.toString(),
        tokenId: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
        revoked: false,
        deviceId,
        ipAddress,
      });

      return res.json({
        userId: user._id.toString(),
        accessToken,
        refreshToken,
        expiresIn: 1800, // 30 minutes
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          onboardingCompleted: user.onboardingCompleted
        }
      });
    } catch (e: any) {
      console.error('Verify OTP error:', e);
      return res.status(500).json({ error: 'Failed to verify OTP' });
    }
  }
);


// Phase 4: Refresh token rate limit (10/min)
router.post('/refresh-token',
  refreshRateLimit,
  validateBody(z.object({
    refreshToken: z.string().min(1, 'Refresh token is required')
  })),
  async (req, res) => {
    try {
      const { refreshToken } = req.body;
      const deviceId = req.headers['x-device-id'] as string;
      const ipAddress = req.ip || req.connection.remoteAddress;

      // Verify refresh token
      let decoded: any;
      try {
        decoded = verifyRefreshToken(refreshToken);
      } catch (error) {
        return res.status(401).json({
          error: 'Invalid or expired refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }

      // Check if token is revoked
      const tokenRecord = await RefreshTokenModel.findOne({
        tokenId: decoded.jti,
        userId: decoded.id
      });

      if (!tokenRecord) {
        return res.status(401).json({
          error: 'Refresh token not found',
          code: 'TOKEN_NOT_FOUND'
        });
      }

      if (tokenRecord.revoked) {
        return res.status(401).json({
          error: 'Refresh token has been revoked',
          code: 'TOKEN_REVOKED'
        });
      }

      // Revoke old refresh token
      tokenRecord.revoked = true;
      tokenRecord.revokedAt = new Date();
      await tokenRecord.save();

      // Generate new tokens
      const newAccessToken = generateToken({
        id: decoded.id,
        email: decoded.email,
        phone: decoded.phone,
        expiresIn: '15m'
      });

      const newRefreshToken = generateRefreshToken({
        id: decoded.id,
        email: decoded.email,
        phone: decoded.phone,
        deviceId: deviceId || decoded.deviceId
      });

      // Decode new refresh token to get jti and exp
      const newDecoded = jwt.decode(newRefreshToken) as any;

      // Store new refresh token
      await RefreshTokenModel.create({
        userId: decoded.id,
        tokenId: newDecoded.jti,
        expiresAt: new Date(newDecoded.exp * 1000),
        revoked: false,
        deviceId: deviceId || decoded.deviceId,
        ipAddress,
      });

      return res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900 // 15 minutes
      });
    } catch (e: any) {
      console.error('Refresh token error:', e);
      return res.status(500).json({ error: 'Failed to refresh token' });
    }
  }
);

// Logout endpoint - revoke refresh token
router.post('/logout',
  requireAuth,
  validateBody(z.object({
    refreshToken: z.string().min(1, 'Refresh token is required')
  })),
  async (req: AuthRequest, res) => {
    try {
      const { refreshToken } = req.body;

      // Verify and decode refresh token
      let decoded: any;
      try {
        decoded = verifyRefreshToken(refreshToken);
      } catch (error) {
        // Even if token is expired, try to revoke it
        decoded = jwt.decode(refreshToken) as any;
      }

      if (!decoded || !decoded.jti) {
        return res.status(400).json({
          error: 'Invalid refresh token',
          code: 'INVALID_TOKEN'
        });
      }

      // Revoke the refresh token
      const result = await RefreshTokenModel.updateOne(
        { tokenId: decoded.jti, userId: req.user?.id },
        {
          $set: {
            revoked: true,
            revokedAt: new Date()
          }
        }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).json({
          error: 'Refresh token not found or already revoked',
          code: 'TOKEN_NOT_FOUND'
        });
      }

      return res.json({
        message: 'Successfully logged out',
        code: 'LOGOUT_SUCCESS'
      });
    } catch (e: any) {
      console.error('Logout error:', e);
      return res.status(500).json({ error: 'Failed to logout' });
    }
  }
);
