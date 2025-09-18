// enhanced-auth.js
const crypto = require('crypto');

// Enhanced authentication middleware
async function enhancedAuthenticateRequest(req, res, next) {
  try {
    // Get API key from headers
    const apiKey = req.headers['x-api-key'] ||
                  (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
    
    if (!apiKey) {
      return res.status(401).json({
        error: {
          message: "Authentication required",
          type: "authentication_error",
          code: "api_key_missing"
        }
      });
    }
    
    // Check API key validity
    const user = req.app.locals.usersConfig?.users?.[apiKey];
    if (!user || !user.enabled) {
      return res.status(403).json({
        error: {
          message: "Invalid or disabled API key",
          type: "forbidden_error",
          code: "invalid_api_key"
        }
      });
    }
    
    // Check API key expiration
    if (user.expires_at && Date.now() > user.expires_at) {
      return res.status(401).json({
        error: {
          message: "API key expired",
          type: "authentication_error",
          code: "api_key_expired"
        }
      });
    }
    
    // Check if API key needs rotation
    if (needsApiKeyRotation(user, req.app.locals.securityConfig)) {
      return res.status(403).json({
        error: {
          message: "API key rotation required",
          type: "forbidden_error",
          code: "api_key_rotation_required"
        }
      });
    }
    
    // Add user info to request
    req.user = user;
    req.apiKey = apiKey;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: {
        message: "Authentication service error",
        type: "server_error"
      }
    });
  }
}

// API key rotation check
function needsApiKeyRotation(user, securityConfig) {
  if (!securityConfig?.enableApiKeyRotation) return false;
  
  const rotationInterval = securityConfig.apiKeyRotationInterval || 2592000000; // 30 days
  const lastRotation = user.last_rotation || 0;
  
  return Date.now() - lastRotation > rotationInterval;
}

// Generate API key with expiry
function generateApiKeyWithExpiry(username, plan, daysValid = 30) {
  const apiKey = generateApiKey();
  const expiresAt = Date.now() + (daysValid * 24 * 60 * 60 * 1000);
  
  return {
    apiKey,
    expiresAt,
    username,
    plan,
    created: Date.now(),
    lastUpdated: Date.now(),
    last_rotation: Date.now()
  };
}

// API key scope validation
function validateApiKeyScope(req, res, next) {
  const apiKey = req.apiKey;
  const user = req.app.locals.usersConfig?.users?.[apiKey];
  
  if (!user || !user.scopes) {
    return next(); // No scopes defined, allow all
  }
  
  const requestedEndpoint = req.path;
  const hasPermission = user.scopes.some(scope => {
    if (scope === '*') return true;
    if (scope.endsWith('*')) {
      return requestedEndpoint.startsWith(scope.slice(0, -1));
    }
    return scope === requestedEndpoint;
  });
  
  if (!hasPermission) {
    return res.status(403).json({
      error: {
        message: "Insufficient permissions for this endpoint",
        type: "forbidden_error",
        code: "insufficient_permissions"
      }
    });
  }
  
  next();
}

// Generate API key
function generateApiKey() {
  return `sk-${crypto.randomBytes(24).toString('hex')}`;
}

// Middleware factory function
function createAuthMiddleware(securityConfig, usersConfig) {
  return async (req, res, next) => {
    try {
      // Get API key from headers
      const apiKey = req.headers['x-api-key'] ||
                    (req.headers.authorization && req.headers.authorization.replace('Bearer ', ''));
      
      if (!apiKey) {
        return res.status(401).json({
          error: {
            message: "Authentication required",
            type: "authentication_error",
            code: "api_key_missing"
          }
        });
      }
      
      // Check API key validity
      const user = usersConfig?.users?.[apiKey];
      if (!user || !user.enabled) {
        return res.status(403).json({
          error: {
            message: "Invalid or disabled API key",
            type: "forbidden_error",
            code: "invalid_api_key"
          }
        });
      }
      
      // Check API key expiration
      if (user.expires_at && Date.now() > user.expires_at) {
        return res.status(401).json({
          error: {
            message: "API key expired",
            type: "authentication_error",
            code: "api_key_expired"
          }
        });
      }
      
      // Check if API key needs rotation
      if (needsApiKeyRotation(user, securityConfig)) {
        return res.status(403).json({
          error: {
            message: "API key rotation required",
            type: "forbidden_error",
            code: "api_key_rotation_required"
          }
        });
      }
      
      // Add user info to request
      req.user = user;
      req.apiKey = apiKey;
      
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({
        error: {
          message: "Authentication service error",
          type: "server_error"
        }
      });
    }
  };
}

module.exports = {
  enhancedAuthenticateRequest,
  generateApiKeyWithExpiry,
  validateApiKeyScope,
  needsApiKeyRotation,
  generateApiKey,
  createAuthMiddleware
};