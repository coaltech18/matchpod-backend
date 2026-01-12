import { CorsOptions } from 'cors';

// Environment-based CORS configuration
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

// Allowed origins for production
const productionOrigins = [
  'https://matchpod.in',
  'https://www.matchpod.in',
  'https://app.matchpod.in',
  'https://expo.dev',
  // Add your production domains here
];

// Allowed origins for development
const developmentOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
  'http://localhost:8082',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:8082',
  'exp://localhost:8081',
  'exp://localhost:8082',
  'exp://127.0.0.1:8081',
  'exp://127.0.0.1:8082',
];

// Ngrok origins (for development)
const ngrokOrigins = [
  'https://ngrok.io',
  'https://*.ngrok.io',
  'https://*.ngrok-free.app',
];

// Render origins (for staging/production)
const renderOrigins = [
  'https://*.onrender.com',
];

// Get allowed origins based on environment
function getAllowedOrigins(): string[] {
  if (isProduction) {
    return productionOrigins;
  }
  
  if (isDevelopment) {
    return [
      ...developmentOrigins,
      ...ngrokOrigins,
      ...renderOrigins,
    ];
  }
  
  // Default to development origins
  return developmentOrigins;
}

// CORS configuration
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = getAllowedOrigins();
    
    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      // Handle wildcard origins
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      
      return allowedOrigin === origin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS: Blocked origin ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    }
  },
  
  credentials: true,
  
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Client-Version',
    'X-Platform',
    'X-Device-ID',
  ],
  
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'X-Response-Time',
  ],
  
  maxAge: 86400, // 24 hours
  
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Strict CORS for production
export const strictCorsOptions: CorsOptions = {
  ...corsOptions,
  origin: productionOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-ID',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 3600, // 1 hour
};

// Development CORS (more permissive)
export const devCorsOptions: CorsOptions = {
  ...corsOptions,
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
    'X-Client-Version',
    'X-Platform',
    'X-Device-ID',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'X-Response-Time',
  ],
  maxAge: 0, // No caching in development
};

// Get appropriate CORS options based on environment
export function getCorsOptions(): CorsOptions {
  if (isProduction) {
    return strictCorsOptions;
  }
  
  if (isDevelopment) {
    return devCorsOptions;
  }
  
  return corsOptions;
}

// CORS middleware for specific routes
export function corsForRoute(route: string): CorsOptions {
  switch (route) {
    case '/api/auth':
      return {
        ...getCorsOptions(),
        origin: getAllowedOrigins(),
        methods: ['POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      };
      
    case '/api/upload':
      return {
        ...getCorsOptions(),
        origin: getAllowedOrigins(),
        methods: ['POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 0, // No caching for uploads
      };
      
    case '/api/chat':
      return {
        ...getCorsOptions(),
        origin: getAllowedOrigins(),
        methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      };
      
    default:
      return getCorsOptions();
  }
}

// Validate origin for specific routes
export function validateOriginForRoute(origin: string, route: string): boolean {
  const allowedOrigins = getAllowedOrigins();
  
  // Check if origin is allowed
  const isAllowed = allowedOrigins.some(allowedOrigin => {
    if (allowedOrigin.includes('*')) {
      const pattern = allowedOrigin.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(origin);
    }
    
    return allowedOrigin === origin;
  });
  
  if (!isAllowed) {
    return false;
  }
  
  // Additional route-specific validation
  switch (route) {
    case '/api/auth':
      // Auth endpoints should only be accessible from trusted origins
      return !origin.includes('ngrok') || isDevelopment;
      
    case '/api/upload':
      // Upload endpoints should have stricter origin validation
      return !origin.includes('localhost') || isDevelopment;
      
    default:
      return true;
  }
}

// Security headers for CORS
export const corsSecurityHeaders = {
  'Access-Control-Allow-Origin': '*', // Will be overridden by CORS middleware
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '86400',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
};

export default {
  corsOptions,
  strictCorsOptions,
  devCorsOptions,
  getCorsOptions,
  corsForRoute,
  validateOriginForRoute,
  corsSecurityHeaders,
};
