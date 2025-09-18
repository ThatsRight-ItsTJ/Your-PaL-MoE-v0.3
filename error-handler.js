// error-handler.js
const fs = require('fs').promises;
const path = require('path');

// Custom error classes
class ApiError extends Error {
  constructor(message, type = 'api_error', statusCode = 500, code = null) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

class AuthenticationError extends ApiError {
  constructor(message, code = 'authentication_failed') {
    super(message, 'authentication_error', 401, code);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends ApiError {
  constructor(message, code = 'authorization_failed') {
    super(message, 'authorization_error', 403, code);
    this.name = 'AuthorizationError';
  }
}

class ValidationError extends ApiError {
  constructor(message, code = 'validation_error') {
    super(message, 'validation_error', 400, code);
    this.name = 'ValidationError';
  }
}

class RateLimitError extends ApiError {
  constructor(message, retryAfter = 60, code = 'rate_limit_exceeded') {
    super(message, 'rate_limit_error', 429, code);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class NotFoundError extends ApiError {
  constructor(message, code = 'not_found') {
    super(message, 'not_found_error', 404, code);
    this.name = 'NotFoundError';
  }
}

class InternalServerError extends ApiError {
  constructor(message, code = 'internal_server_error') {
    super(message, 'internal_server_error', 500, code);
    this.name = 'InternalServerError';
  }
}

// Error logging utility
async function logError(error, req, res) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack
    },
    request: {
      method: req.method,
      path: req.path,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      requestId: req.requestId || 'unknown'
    },
    response: {
      statusCode: res.statusCode,
      headers: res.getHeaders()
    }
  };

  // Log to file
  try {
    const logDir = path.join(process.cwd(), 'logs');
    await fs.mkdir(logDir, { recursive: true });
    
    const logFile = path.join(logDir, 'errors.log');
    const logLine = JSON.stringify(logEntry) + '\n';
    
    await fs.appendFile(logFile, logLine);
  } catch (logError) {
    console.error('Failed to log error:', logError);
  }

  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Error occurred:', error);
  }
}

// Error response formatter
function formatErrorResponse(error, req) {
  const response = {
    error: {
      message: error.message,
      type: error.type,
      code: error.code,
      timestamp: error.timestamp
    }
  };

  // Add retry-after header for rate limit errors
  if (error instanceof RateLimitError && error.retryAfter) {
    response.error.retry_after = error.retryAfter;
  }

  // Add request ID if available
  if (req.requestId) {
    response.request_id = req.requestId;
  }

  // Don't expose stack trace in production
  if (process.env.NODE_ENV === 'production' && error.stack) {
    delete error.stack;
  } else if (error.stack) {
    response.error.stack = error.stack;
  }

  return response;
}

// Error handling middleware
async function errorHandler(err, req, res, next) {
  // If headers are already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Convert known error types to our custom errors
  let error = err;
  
  if (!(err instanceof ApiError)) {
    if (err.name === 'ValidationError') {
      error = new ValidationError(err.message, err.code);
    } else if (err.name === 'UnauthorizedError' || err.message?.includes('unauthorized')) {
      error = new AuthenticationError(err.message || 'Authentication required', 'unauthorized');
    } else if (err.name === 'ForbiddenError' || err.message?.includes('forbidden')) {
      error = new AuthorizationError(err.message || 'Access forbidden', 'forbidden');
    } else if (err.message?.includes('rate limit') || err.statusCode === 429) {
      error = new RateLimitError(err.message || 'Rate limit exceeded', 60, 'rate_limit_exceeded');
    } else if (err.message?.includes('not found')) {
      error = new NotFoundError(err.message || 'Resource not found', 'not_found');
    } else {
      error = new InternalServerError(err.message || 'Internal server error', 'internal_server_error');
    }
  }

  // Log the error
  await logError(error, req, res);

  // Format the response
  const response = formatErrorResponse(error, req);

  // Send the response
  res.status(error.statusCode).json(response);
}

// 404 handler
async function notFoundHandler(req, res, next) {
  const error = new NotFoundError(`Endpoint ${req.method} ${req.path} not found`, 'endpoint_not_found');
  await logError(error, req, res);
  
  const response = formatErrorResponse(error, req);
  res.status(404).json(response);
}

// Async error wrapper for route handlers
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Error monitoring and alerting
class ErrorMonitor {
  constructor() {
    this.errorCounts = {};
    this.lastErrorTime = {};
    this.alertThreshold = 10; // Number of errors before alerting
    this.timeWindow = 300000; // 5 minutes in milliseconds
  }

  // Record an error
  recordError(errorType, timestamp = Date.now()) {
    if (!this.errorCounts[errorType]) {
      this.errorCounts[errorType] = 0;
      this.lastErrorTime[errorType] = timestamp;
    }

    this.errorCounts[errorType]++;

    // Reset count if time window has passed
    if (timestamp - this.lastErrorTime[errorType] > this.timeWindow) {
      this.errorCounts[errorType] = 1;
      this.lastErrorTime[errorType] = timestamp;
    }

    // Check if we should alert
    if (this.errorCounts[errorType] >= this.alertThreshold) {
      this.sendAlert(errorType, this.errorCounts[errorType]);
      this.errorCounts[errorType] = 0; // Reset after alert
    }
  }

  // Send alert (placeholder for actual alert implementation)
  sendAlert(errorType, count) {
    console.warn(`🚨 Error Alert: ${errorType} has occurred ${count} times in the last ${this.timeWindow / 1000 / 60} minutes`);
    
    // In a real implementation, you might send this to:
    // - Email
    // - Slack/Teams
    // - PagerDuty
    // - Monitoring service
  }

  // Get error statistics
  getStats() {
    const stats = {};
    for (const [errorType, count] of Object.entries(this.errorCounts)) {
      stats[errorType] = {
        count,
        lastSeen: this.lastErrorTime[errorType]
      };
    }
    return stats;
  }
}

// Create a global error monitor instance
const errorMonitor = new ErrorMonitor();

module.exports = {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
  NotFoundError,
  InternalServerError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
  errorMonitor,
  logError,
  formatErrorResponse
};