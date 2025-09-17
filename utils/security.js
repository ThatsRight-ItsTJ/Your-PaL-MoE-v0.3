const crypto = require('crypto');

/**
 * Constant-time comparison for API key validation
 * Prevents timing attacks
 */
function constantTimeCompare(a, b) {
    if (a.length !== b.length) {
        return false;
    }
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
}

/**
 * Validate API key with constant-time comparison
 */
function validateApiKey(providedKey, validKey) {
    if (!providedKey || !validKey) {
        return false;
    }
    
    return constantTimeCompare(providedKey, validKey);
}

/**
 * Input validation utilities
 */
const validators = {
    isValidString: (str, maxLength = 1000) => {
        return typeof str === 'string' && str.length <= maxLength && str.trim().length > 0;
    },
    
    isValidNumber: (num, min = 0, max = Number.MAX_SAFE_INTEGER) => {
        return typeof num === 'number' && !isNaN(num) && num >= min && num <= max;
    },
    
    isValidArray: (arr, maxLength = 100) => {
        return Array.isArray(arr) && arr.length <= maxLength;
    },
    
    sanitizeString: (str) => {
        if (typeof str !== 'string') return '';
        return str.replace(/[<>'"&]/g, '').trim();
    },
    
    validateProvider: (provider) => {
        const required = ['name', 'baseURL', 'models'];
        return required.every(field => provider && provider[field]);
    },
    
    validateModel: (model) => {
        const required = ['name', 'type'];
        return required.every(field => model && model[field]);
    }
};

/**
 * Rate limiting implementation
 */
class RateLimiter {
    constructor(windowMs = 60000, maxRequests = 100) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.clients = new Map();
    }
    
    isAllowed(clientId) {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        
        if (!this.clients.has(clientId)) {
            this.clients.set(clientId, []);
        }
        
        const requests = this.clients.get(clientId);
        
        // Remove old requests outside the window
        while (requests.length > 0 && requests[0] < windowStart) {
            requests.shift();
        }
        
        if (requests.length >= this.maxRequests) {
            return false;
        }
        
        requests.push(now);
        return true;
    }
    
    getRemainingRequests(clientId) {
        const requests = this.clients.get(clientId) || [];
        return Math.max(0, this.maxRequests - requests.length);
    }
    
    getResetTime(clientId) {
        const requests = this.clients.get(clientId) || [];
        if (requests.length === 0) return 0;
        return requests[0] + this.windowMs;
    }
}

module.exports = {
    constantTimeCompare,
    validateApiKey,
    validators,
    RateLimiter
};