// config/security-template.js
module.exports = {
  // Authentication settings
  authentication: {
    enabled: true,
    method: "api_key",
    apiKeyHeader: "X-API-Key",
    authHeader: "Authorization",
    tokenPrefix: "Bearer ",
    enableApiKeyRotation: process.env.ENABLE_API_KEY_ROTATION === "true",
    rotationInterval: parseInt(process.env.API_KEY_ROTATION_INTERVAL) || 2592000000, // 30 days
    enableApiKeyExpiry: process.env.ENABLE_API_KEY_EXPIRY !== "false",
    defaultExpiryDays: parseInt(process.env.DEFAULT_KEY_EXPIRY_DAYS) || 30
  },
  
  // Rate limiting settings
  rateLimiting: {
    enabled: process.env.ENABLE_RATE_LIMITING !== "false",
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    trustProxy: process.env.ENABLE_TRUST_PROXY !== "false"
  },
  
  // CORS settings
  cors: {
    enabled: process.env.ENABLE_CORS !== "false",
    origin: process.env.ALLOWED_ORIGINS ? JSON.parse(process.env.ALLOWED_ORIGINS) : ["*"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-API-Key"],
    exposedHeaders: ["Content-Length", "X-Powered-By", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
    credentials: process.env.ENABLE_CORS_CREDENTIALS !== "false",
    maxAge: parseInt(process.env.MAX_PREFLIGHT_CACHE_TTL) || 86400
  },
  
  // Security headers settings
  securityHeaders: {
    enabled: process.env.ENABLE_SECURITY_HEADERS !== "false",
    contentSecurityPolicy: {
      enabled: process.env.ENABLE_CSP !== "false",
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
    xssProtection: process.env.ENABLE_XSS_PROTECTION !== "false",
    frameguard: { action: "deny" },
    hsts: {
      enabled: process.env.ENABLE_HSTS !== "false",
      maxAge: parseInt(process.env.HSTS_MAX_AGE) || 31536000,
      includeSubDomains: process.env.HSTS_INCLUDE_SUBDOMAINS !== "false",
      preload: process.env.HSTS_PRELOAD !== "false"
    },
    hidePoweredBy: true
  },
  
  // Logging settings
  logging: {
    enabled: process.env.ENABLE_REQUEST_LOGGING !== "false",
    level: process.env.LOG_LEVEL || "info",
    requests: true,
    errors: true,
    securityEvents: true,
    audit: process.env.ENABLE_AUDIT_LOGGING !== "false",
    path: process.env.LOG_PATH || "./logs"
  },
  
  // Input validation settings
  inputValidation: {
    enabled: process.env.ENABLE_INPUT_VALIDATION !== "false",
    strict: true,
    maxSize: process.env.BODY_PARSER_LIMIT || "10mb",
    sanitizeInputs: true
  },
  
  // DDoS protection settings
  ddosProtection: {
    enabled: process.env.ENABLE_DDOS_PROTECTION !== "false",
    maxConnectionsPerIP: parseInt(process.env.MAX_CONNECTIONS_PER_IP) || 20,
    timeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
    trustProxy: process.env.ENABLE_TRUST_PROXY !== "false"
  },
  
  // API key management
  apiKeyManagement: {
    enableExpiry: process.env.ENABLE_API_KEY_EXPIRY !== "false",
    defaultExpiryDays: parseInt(process.env.DEFAULT_KEY_EXPIRY_DAYS) || 30,
    enableScopes: process.env.ENABLE_PERMISSION_SCOPES !== "false",
    enableRotation: process.env.ENABLE_API_KEY_ROTATION === "true",
    rotationInterval: parseInt(process.env.API_KEY_ROTATION_INTERVAL) || 2592000000
  }
};