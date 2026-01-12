import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

// CSP directives
const contentSecurityPolicy = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://apis.google.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
    connectSrc: [
      "'self'",
      'https://matchpod-api-gbfkdygcdqdjh7f7.canadacentral-01.azurewebsites.net',
      'wss://matchpod-api-gbfkdygcdqdjh7f7.canadacentral-01.azurewebsites.net',
      'https://*.googleapis.com',
    ],
    fontSrc: ["'self'", 'data:', 'https:'],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'", 'https:', 'blob:'],
    frameSrc: ["'none'"],
    childSrc: ["'none'"],
    workerSrc: ["'self'", 'blob:'],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: [],
  },
  reportOnly: false,
};

// CORS options
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = [
      'https://matchpod.in',
      'https://app.matchpod.in',
      /^https:\/\/.*\.matchpod\.in$/,
    ];

    if (!origin || allowedOrigins.some(allowed => 
      typeof allowed === 'string' 
        ? allowed === origin 
        : allowed.test(origin)
    )) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Length', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

// Security headers middleware
export const securityHeaders = [
  // Basic security headers
  helmet({
    contentSecurityPolicy,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    dnsPrefetchControl: { allow: false },
    // expectCt: { // Deprecated in newer versions of helmet
    //   maxAge: 86400,
    //   enforce: true,
    // },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  }),

  // Custom security headers
  (req: Request, res: Response, next: NextFunction) => {
    // Additional security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Remove potentially dangerous headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');

    // Add security headers for WebSocket connections
    if (req.headers.upgrade === 'websocket') {
      res.setHeader('Sec-WebSocket-Protocol', 'matchpod-v1');
    }

    next();
  },
];

export { corsOptions };
