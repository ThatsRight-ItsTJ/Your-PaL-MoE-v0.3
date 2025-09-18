// security-middleware.js
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { createHash } = require('crypto');

// Input validation and sanitization
function validateInput(req, res, next) {
  // Validate model names
  if (req.body.model && !/^[a-zA-Z0-9_\-\.]+$/.test(req.body.model)) {
    return res.status(400).json({ 
      error: { 
        message: "Invalid model name format", 
        type: "invalid_request_error" 
      } 
    });
  }
  
  // Validate message content
  if (req.body.messages && Array.isArray(req.body.messages)) {
    for (const message of req.body.messages) {
      if (message.content && typeof message.content !== 'string') {
        return res.status(400).json({ 
          error: { 
            message: "Invalid message content format", 
            type: "invalid_request_error" 
          } 
        });
      }
      
      // Check for suspicious content length
      if (message.content && message.content.length > 100000) {
        return res.status(400).json({ 
          error: { 
            message: "Message content too long", 
            type: "invalid_request_error" 
          } 
        });
      }
    }
  }
  
  // Validate temperature if provided
  if (req.body.temperature !== undefined) {
    const temp = parseFloat(req.body.temperature);
    if (isNaN(temp) || temp < 0 || temp > 2) {
      return res.status(400).json({ 
        error: { 
          message: "Temperature must be between 0 and 2", 
          type: "invalid_request_error" 
        } 
      });
    }
  }
  
  next();
}

// Path traversal protection
function preventPathTraversal(req, res, next) {
  const dangerousPatterns = [
    /\.\.\//, // Parent directory traversal
    /\/\.\./, // Parent directory traversal
    /%2e%2e%2f/, // Encoded parent directory
    /%2e%2e/, // Encoded parent directory
    /\\\.\\\./, // Windows-style path traversal
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(req.path) || 
        (req.body.model && pattern.test(req.body.model)) ||
        (req.body.file && pattern.test(req.body.file))) {
      return res.status(400).json({ 
        error: { 
          message: "Invalid request path", 
          type: "invalid_request_error" 
        } 
      });
    }
  }
  
  next();
}

// Enhanced rate limiting
function createRateLimiter(windowMs, maxRequests, message) {
  return rateLimit({
    windowMs: windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for admin requests
      return req.path.startsWith('/admin/');
    },
    handler: (req, res) => {
      res.status(429).json({
        error: {
          message: message || "Too many requests from this IP, please try again later.",
          type: "rate_limit_error",
          retry_after: Math.ceil(windowMs / 1000)
        }
      });
    }
  });
}

// Enhanced security headers
function configureSecurityHeaders(app, securityConfig) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "http:", "https:"],
        mediaSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        childSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameSrc: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: "same-origin",
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: securityConfig.hsts || {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true
  }));
}

// Enhanced CORS configuration
function configureCORS(app, securityConfig) {
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl)
      if (!origin) return callback(null, true);
      
      // Check against allowed origins
      const allowedOrigins = securityConfig.allowedOrigins || ["*"];
      
      // For production, be more restrictive
      if (process.env.NODE_ENV === 'production') {
        // Only allow specific domains in production
        const productionOrigins = [
          'https://yourdomain.com',
          'https://app.yourdomain.com'
        ];
        
        if (productionOrigins.includes(origin)) {
          return callback(null, true);
        }
        
        return callback(new Error('Not allowed by CORS'));
      }
      
      // In development, allow from allowedOrigins
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-API-Key'],
    exposedHeaders: ['Content-Length', 'X-Powered-By', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400,
    preflightContinue: false
  }));
}

// Request logging middleware
function requestLogging(req, res, next) {
  const requestId = createHash('sha256').update(Date.now().toString() + Math.random().toString()).digest('hex').substring(0, 16);
  req.requestId = requestId;
  req.startTime = Date.now();
  
  // Log all requests with security details
  res.on('finish', () => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: requestId,
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      statusCode: res.statusCode,
      responseTime: Date.now() - req.startTime,
      apiKey: req.headers['x-api-key'] ? req.headers['x-api-key'].substring(0, 8) + '...' : 'none',
      securityEvents: []
    };
    
    // Check for security events
    if (res.statusCode === 401) {
      logEntry.securityEvents.push('authentication_failed');
    }
    
    if (res.statusCode === 429) {
      logEntry.securityEvents.push('rate_limit_exceeded');
    }
    
    // Only log errors and security events in production
    if (process.env.NODE_ENV === 'production' && (res.statusCode >= 400 || logEntry.securityEvents.length > 0)) {
      console.log('Security Log:', JSON.stringify(logEntry));
    }
  });
  
  next();
}

// Request size limits
function configureRequestSizeLimits(app) {
  const express = require('express');
  app.use('/v1/images/generations', express.json({ limit: '4mb' }));
  app.use('/v1/audio/transcriptions', express.json({ limit: '25mb' }));
  app.use('/v1/chat/completions', express.json({ limit: '10mb' }));
  app.use('/v1/responses', express.json({ limit: '10mb' }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
}

// DDoS protection
function ddosProtection(app) {
  // Limit concurrent connections per IP
  const ipLimiter = rateLimit({
    windowMs: 900000, // 15 minutes
    max: 20, // Limit each IP to 20 requests per window
    message: {
      error: "Too many connections from this IP",
      type: "rate_limit_error"
    }
  });
  
  app.use(ipLimiter);
  
  // Add request timeout
  app.use((req, res, next) => {
    req.setTimeout(30000); // 30 second timeout
    next();
  });
}

module.exports = {
  validateInput,
  preventPathTraversal,
  createRateLimiter,
  configureSecurityHeaders,
  configureCORS,
  requestLogging,
  configureRequestSizeLimits,
  ddosProtection
};