import 'dotenv/config';

// Phase 2: Backend Hardening - Environment validation (MUST be first)
import { validateEnv, getConfig } from './config/env';
const config = validateEnv();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import { createServer } from 'http';
import { initializeSocketService } from './services/socketService';

// Phase 3: Backend Hardening - Database configuration
import { connectToDatabase } from './config/database';

// Phase 1: Backend Hardening - Error handling and shutdown
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { gracefulShutdown, registerProcessHandlers } from './shutdown';

// Register process-level safety handlers EARLY (before any async operations)
registerProcessHandlers();

import { router as authRouter } from './routes/auth';
import { router as usersRouter } from './routes/users';
import { router as matchesRouter } from './routes/matches';
import { router as chatsRouter } from './routes/chats';
import { router as profileRouter } from './routes/profile';
import { router as imagesRouter } from './routes/images';
import { router as notificationsRouter } from './routes/notifications';
import { router as onboardingRouter } from './routes/onboarding';
import { healthRouter } from './routes/health';

// Import models to ensure they're registered with Mongoose
import './models/RefreshToken';
import './models/PushToken';

import { getCorsOptions, corsSecurityHeaders } from './security/cors';
import { sanitizeInput } from './middleware/validate';
import { apiRateLimit } from './middleware/rateLimit';
// Note: Redis client is dynamically imported in startup if ENABLE_REDIS is true

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
initializeSocketService(httpServer);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors(getCorsOptions()));

// Add security headers
app.use((req, res, next) => {
  Object.entries(corsSecurityHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  next();
});


// Input sanitization
app.use(sanitizeInput);

// Apply default API rate limiting
app.use('/api', apiRateLimit);

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan(config.NODE_ENV === 'production' ? 'combined' : 'dev'));

// API info route
app.get('/api', (req, res) => {
  res.json({
    message: 'MatchPod API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      matches: '/api/matches',
      chats: '/api/chats',
      profile: '/api/profile',
      images: '/api/images',
      notifications: '/api/notifications',
      onboarding: '/api/onboarding'
    }
  });
});

app.use('/api/health', healthRouter);

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/chats', chatsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/images', imagesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/onboarding', onboardingRouter);

// Phase 1: Backend Hardening - Error handling middleware (MUST be last)
app.use(notFoundHandler);
app.use(globalErrorHandler);

// Phase 2: Use validated config for PORT and MONGODB_URI
const { PORT, MONGODB_URI } = config;

// Phase 3: Connect to MongoDB with hardened settings
connectToDatabase(MONGODB_URI)
  .then(async () => {
    console.log('Connected to MongoDB with hardened settings');

    // Initialize Redis client (only if enabled)
    if (config.ENABLE_REDIS) {
      console.log('Initializing Redis client...');
      const { getRedisClient, isRedisAvailable } = await import('./redis/client');
      getRedisClient();

      // Test Redis connection
      try {
        const redisAvailable = await isRedisAvailable();
        if (redisAvailable) {
          console.log('✅ Redis connected and ready');
        } else {
          console.log('⚠️ Redis not available, using in-memory fallback');
        }
      } catch (error) {
        console.log('⚠️ Redis connection failed, using in-memory fallback');
      }
    } else {
      console.log('ℹ️ Redis disabled via configuration');
    }

    console.log('ℹ️ Using backend OTP service (Beta mode)');

    httpServer.listen(PORT, () => {
      console.log(`Server listening on :${PORT}`);
      console.log('✅ Phase 1: Backend hardening active (error handlers + graceful shutdown)');
      console.log('✅ Phase 2: Environment configuration validated');
      console.log('✅ Phase 3: Database connection hardened (timeouts + query limits)');

      // Register shutdown handlers AFTER server starts
      process.on('SIGTERM', () => gracefulShutdown('SIGTERM', httpServer));
      process.on('SIGINT', () => gracefulShutdown('SIGINT', httpServer));
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
