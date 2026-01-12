/**
 * Centralized Environment Configuration
 * Phase 2: Backend Hardening - Configuration Safety
 * 
 * Single source of truth for all environment variables.
 * - Zod-based schema validation
 * - Fail-fast startup for missing/invalid critical vars
 * - Typed configuration object
 * - No insecure development fallbacks in production
 */

import { z } from 'zod';

// =============================================================================
// Environment Schema Definition
// =============================================================================

const envSchema = z.object({
    // ---------------------------------------------------------------------------
    // Core Runtime
    // ---------------------------------------------------------------------------
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),

    // ---------------------------------------------------------------------------
    // Database (REQUIRED)
    // ---------------------------------------------------------------------------
    MONGODB_URI: z
        .string()
        .min(1, 'MONGODB_URI is required')
        .refine(
            (uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'),
            'MONGODB_URI must be a valid MongoDB connection string'
        ),

    // ---------------------------------------------------------------------------
    // JWT Authentication (REQUIRED)
    // ---------------------------------------------------------------------------
    JWT_SECRET: z
        .string()
        .min(32, 'JWT_SECRET must be at least 32 characters for security'),

    JWT_REFRESH_SECRET: z
        .string()
        .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters')
        .optional(),

    JWT_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    JWT_ISSUER: z.string().default('matchpod-api'),
    JWT_AUDIENCE: z.string().default('matchpod-app'),

    // ---------------------------------------------------------------------------
    // Security
    // ---------------------------------------------------------------------------
    CORS_ORIGIN: z.string().default('*'),
    ENCRYPTION_SECRET: z.string().optional(),

    // ---------------------------------------------------------------------------
    // Redis (Optional - app works without it)
    // ---------------------------------------------------------------------------
    ENABLE_REDIS: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),
    REDIS_HOST: z.string().default('127.0.0.1'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),
    REDIS_PASSWORD: z.string().default(''),
    REDIS_TLS: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),

    // ---------------------------------------------------------------------------
    // Azure Storage (Optional)
    // ---------------------------------------------------------------------------
    AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),

    // ---------------------------------------------------------------------------
    // Email (Optional - disabled by default for beta)
    // ---------------------------------------------------------------------------
    EMAIL_ENABLED: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),
    EMAIL_PROVIDER: z.enum(['log', 'sendgrid', 'smtp']).default('log'),
    EMAIL_FROM: z.string().email().default('noreply@matchpod.app'),
    EMAIL_FROM_NAME: z.string().default('MatchPod'),
    SENDGRID_API_KEY: z.string().optional(),
    APP_URL: z.string().url().default('https://matchpod.app'),

    // ---------------------------------------------------------------------------
    // Feature Flags (Beta Configuration)
    // ---------------------------------------------------------------------------
    BETA_STATIC_OTP: z
        .string()
        .transform((val) => val === 'true')
        .default('true'), // Enabled by default for beta

    ENABLE_PUSH_NOTIFICATIONS: z
        .string()
        .transform((val) => val === 'true')
        .default('false'),

    // ---------------------------------------------------------------------------
    // Rate Limiting (Optional - defaults provided)
    // ---------------------------------------------------------------------------
    API_RATE_LIMIT: z.coerce.number().int().positive().default(100),
    API_RATE_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(5),
    AUTH_RATE_WINDOW_MS: z.coerce.number().int().positive().default(900000),
    OTP_RATE_LIMIT: z.coerce.number().int().positive().default(3),
    OTP_RATE_WINDOW_MS: z.coerce.number().int().positive().default(600000),

    // ---------------------------------------------------------------------------
    // Match Algorithm Weights (must sum to 1.0)
    // ---------------------------------------------------------------------------
    MATCH_WEIGHT_BUDGET: z.coerce.number().min(0).max(1).default(0.25),
    MATCH_WEIGHT_LOCATION: z.coerce.number().min(0).max(1).default(0.20),
    MATCH_WEIGHT_LIFESTYLE: z.coerce.number().min(0).max(1).default(0.20),
    MATCH_WEIGHT_SCHEDULE: z.coerce.number().min(0).max(1).default(0.15),
    MATCH_WEIGHT_CLEANLINESS: z.coerce.number().min(0).max(1).default(0.10),
    MATCH_WEIGHT_PETS: z.coerce.number().min(0).max(1).default(0.05),
    MATCH_WEIGHT_GENDER: z.coerce.number().min(0).max(1).default(0.05),

    // ---------------------------------------------------------------------------
    // Logging (Optional)
    // ---------------------------------------------------------------------------
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

// =============================================================================
// Derived Types
// =============================================================================

export type Env = z.infer<typeof envSchema>;

// =============================================================================
// Configuration State
// =============================================================================

let config: Env | null = null;
let validationComplete = false;

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * List of patterns that indicate insecure/placeholder secrets
 */
const INSECURE_SECRET_PATTERNS = [
    'dev_',
    'test_',
    'change_me',
    'changeme',
    'placeholder',
    'example',
    'your_',
    'xxx',
    'secret123',
    'password123',
];

/**
 * Check if a secret value looks like an insecure placeholder
 */
function isInsecureSecret(value: string): boolean {
    const lowerValue = value.toLowerCase();
    return INSECURE_SECRET_PATTERNS.some((pattern) => lowerValue.includes(pattern));
}

/**
 * Validate environment variables and return typed configuration.
 * 
 * MUST be called at application startup before any other initialization.
 * Will terminate the process with exit code 1 if validation fails.
 * 
 * @returns Validated and typed environment configuration
 */
export function validateEnv(): Env {
    console.log('🔧 Validating environment configuration...');

    // Parse environment variables against schema
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('\n❌ ENVIRONMENT VALIDATION FAILED\n');
        console.error('The following environment variables are missing or invalid:\n');

        result.error.issues.forEach((issue) => {
            const path = issue.path.join('.');
            console.error(`  • ${path}: ${issue.message}`);
        });

        console.error('\n💡 Please check your .env file or Render environment variables.\n');
        process.exit(1);
    }

    const env = result.data;

    // ---------------------------------------------------------------------------
    // Production-Specific Validations
    // ---------------------------------------------------------------------------

    if (env.NODE_ENV === 'production') {
        const errors: string[] = [];

        // JWT_SECRET must not be an insecure placeholder
        if (isInsecureSecret(env.JWT_SECRET)) {
            errors.push('JWT_SECRET contains an insecure placeholder value');
        }

        // JWT_REFRESH_SECRET is required in production
        if (!env.JWT_REFRESH_SECRET) {
            errors.push('JWT_REFRESH_SECRET is required in production');
        } else if (isInsecureSecret(env.JWT_REFRESH_SECRET)) {
            errors.push('JWT_REFRESH_SECRET contains an insecure placeholder value');
        }

        // JWT_SECRET and JWT_REFRESH_SECRET must be different
        if (env.JWT_REFRESH_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
            errors.push('JWT_SECRET and JWT_REFRESH_SECRET must be different');
        }

        // CORS_ORIGIN should not be wildcard in production
        if (env.CORS_ORIGIN === '*') {
            console.warn('⚠️  WARNING: CORS_ORIGIN is set to "*" in production. Consider restricting to specific domains.');
        }

        // Check for production-critical settings
        if (env.BETA_STATIC_OTP) {
            console.warn('⚠️  WARNING: BETA_STATIC_OTP is enabled in production. OTP will always be "123456".');
        }

        if (errors.length > 0) {
            console.error('\n❌ PRODUCTION SECURITY VALIDATION FAILED\n');
            errors.forEach((error) => {
                console.error(`  • ${error}`);
            });
            console.error('\n💡 Production deployments require secure secrets.\n');
            process.exit(1);
        }
    }

    // ---------------------------------------------------------------------------
    // Validation Warnings (non-fatal)
    // ---------------------------------------------------------------------------

    // Warn about match weights not summing to 1.0
    const totalWeight =
        env.MATCH_WEIGHT_BUDGET +
        env.MATCH_WEIGHT_LOCATION +
        env.MATCH_WEIGHT_LIFESTYLE +
        env.MATCH_WEIGHT_SCHEDULE +
        env.MATCH_WEIGHT_CLEANLINESS +
        env.MATCH_WEIGHT_PETS +
        env.MATCH_WEIGHT_GENDER;

    if (Math.abs(totalWeight - 1.0) > 0.01) {
        console.warn(`⚠️  WARNING: Match weights sum to ${totalWeight.toFixed(2)}, expected 1.0`);
    }

    // Store validated config
    config = env;
    validationComplete = true;

    console.log('✅ Environment configuration validated');
    console.log(`   Mode: ${env.NODE_ENV}`);
    console.log(`   Port: ${env.PORT}`);
    console.log(`   Redis: ${env.ENABLE_REDIS ? 'enabled' : 'disabled'}`);
    console.log(`   Push Notifications: ${env.ENABLE_PUSH_NOTIFICATIONS ? 'enabled' : 'disabled'}`);
    console.log(`   Beta Static OTP: ${env.BETA_STATIC_OTP ? 'enabled' : 'disabled'}`);
    console.log(`   Email: ${env.EMAIL_ENABLED ? env.EMAIL_PROVIDER : 'disabled'}`);

    return config;
}

/**
 * Get the validated configuration object.
 * 
 * MUST only be called after validateEnv() has completed successfully.
 * Throws if called before validation.
 * 
 * @returns Validated and typed environment configuration
 */
export function getConfig(): Env {
    if (!validationComplete || !config) {
        throw new Error(
            'Configuration not initialized. Call validateEnv() at application startup before accessing config.'
        );
    }
    return config;
}

/**
 * Check if the application is running in production mode.
 */
export function isProduction(): boolean {
    return getConfig().NODE_ENV === 'production';
}

/**
 * Check if the application is running in development mode.
 */
export function isDevelopment(): boolean {
    return getConfig().NODE_ENV === 'development';
}

/**
 * Check if beta static OTP mode is active.
 * Returns true if BETA_STATIC_OTP is enabled OR not in production.
 */
export function isBetaOtpMode(): boolean {
    const cfg = getConfig();
    return cfg.BETA_STATIC_OTP || cfg.NODE_ENV !== 'production';
}

/**
 * Get JWT configuration for token signing/verification.
 */
export function getJwtConfig() {
    const cfg = getConfig();
    return {
        secret: cfg.JWT_SECRET,
        refreshSecret: cfg.JWT_REFRESH_SECRET || cfg.JWT_SECRET,
        expiresIn: cfg.JWT_EXPIRES_IN,
        refreshExpiresIn: cfg.JWT_REFRESH_EXPIRES_IN,
        issuer: cfg.JWT_ISSUER,
        audience: cfg.JWT_AUDIENCE,
    };
}

/**
 * Get Redis configuration.
 */
export function getRedisConfig() {
    const cfg = getConfig();
    return {
        enabled: cfg.ENABLE_REDIS,
        host: cfg.REDIS_HOST,
        port: cfg.REDIS_PORT,
        password: cfg.REDIS_PASSWORD,
        tls: cfg.REDIS_TLS,
    };
}

/**
 * Get email configuration.
 */
export function getEmailConfig() {
    const cfg = getConfig();
    return {
        enabled: cfg.EMAIL_ENABLED,
        provider: cfg.EMAIL_PROVIDER,
        fromEmail: cfg.EMAIL_FROM,
        fromName: cfg.EMAIL_FROM_NAME,
        sendgridApiKey: cfg.SENDGRID_API_KEY,
        appUrl: cfg.APP_URL,
    };
}

/**
 * Get match algorithm weight configuration.
 */
export function getMatchWeights() {
    const cfg = getConfig();
    return {
        budget: cfg.MATCH_WEIGHT_BUDGET,
        location: cfg.MATCH_WEIGHT_LOCATION,
        lifestyle: cfg.MATCH_WEIGHT_LIFESTYLE,
        schedule: cfg.MATCH_WEIGHT_SCHEDULE,
        cleanliness: cfg.MATCH_WEIGHT_CLEANLINESS,
        pets: cfg.MATCH_WEIGHT_PETS,
        gender: cfg.MATCH_WEIGHT_GENDER,
    };
}
