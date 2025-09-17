const logger = require('./logger');

/**
 * Comprehensive error handling utilities
 */

/**
 * Custom error classes
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends AppError {
    constructor(message, field = null) {
        super(message, 400, 'VALIDATION_ERROR');
        this.field = field;
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication failed') {
        super(message, 401, 'AUTHENTICATION_ERROR');
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Authorization failed') {
        super(message, 403, 'AUTHORIZATION_ERROR');
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND_ERROR');
    }
}

class RateLimitError extends AppError {
    constructor(message = 'Rate limit exceeded') {
        super(message, 429, 'RATE_LIMIT_ERROR');
    }
}

class ProviderError extends AppError {
    constructor(message, provider = null) {
        super(message, 502, 'PROVIDER_ERROR');
        this.provider = provider;
    }
}

/**
 * Circuit breaker implementation
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000;
        this.monitoringPeriod = options.monitoringPeriod || 60000;
        
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.lastFailureTime = null;
        this.successCount = 0;
        this.requestCount = 0;
        
        this.resetTimer = null;
    }
    
    /**
     * Execute function with circuit breaker
     */
    async execute(fn, ...args) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            } else {
                throw new ProviderError('Circuit breaker is OPEN');
            }
        }
        
        try {
            const result = await fn(...args);
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    /**
     * Handle successful execution
     */
    onSuccess() {
        this.failureCount = 0;
        this.successCount++;
        
        if (this.state === 'HALF_OPEN' && this.successCount >= 3) {
            this.state = 'CLOSED';
            this.successCount = 0;
        }
    }
    
    /**
     * Handle failed execution
     */
    onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            
            if (this.resetTimer) {
                clearTimeout(this.resetTimer);
            }
            
            this.resetTimer = setTimeout(() => {
                this.state = 'HALF_OPEN';
                this.successCount = 0;
            }, this.resetTimeout);
        }
    }
    
    /**
     * Get circuit breaker stats
     */
    getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime
        };
    }
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, next) {
    logger.error('Error occurred', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    // Default error response
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    
    // Handle known error types
    if (err instanceof AppError) {
        statusCode = err.statusCode;
        code = err.code;
        message = err.message;
    } else if (err.name === 'ValidationError') {
        statusCode = 400;
        code = 'VALIDATION_ERROR';
        message = err.message;
    } else if (err.name === 'CastError') {
        statusCode = 400;
        code = 'INVALID_ID';
        message = 'Invalid ID format';
    } else if (err.code === 11000) {
        statusCode = 409;
        code = 'DUPLICATE_ENTRY';
        message = 'Duplicate entry';
    }
    
    // Send error response
    res.status(statusCode).json({
        success: false,
        error: {
            code,
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        }
    });
}

/**
 * Async error wrapper
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Create circuit breaker for providers
 */
const providerCircuitBreakers = new Map();

function getProviderCircuitBreaker(providerName) {
    if (!providerCircuitBreakers.has(providerName)) {
        providerCircuitBreakers.set(providerName, new CircuitBreaker({
            failureThreshold: 5,
            resetTimeout: 60000
        }));
    }
    return providerCircuitBreakers.get(providerName);
}

module.exports = {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    RateLimitError,
    ProviderError,
    CircuitBreaker,
    errorHandler,
    asyncHandler,
    getProviderCircuitBreaker
};