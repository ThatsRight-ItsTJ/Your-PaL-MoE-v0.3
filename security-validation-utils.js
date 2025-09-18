const crypto = require('crypto');
const { ValidationError } = require('./error-handler');

/**
 * Validate and sanitize input data
 */
class SecurityValidator {
  constructor() {
    this.sanitizationRules = {
      string: this.sanitizeString,
      number: this.sanitizeNumber,
      boolean: this.sanitizeBoolean,
      array: this.sanitizeArray,
      object: this.sanitizeObject
    };
  }

  /**
   * Validate API key format
   */
  validateApiKey(apiKey) {
    if (typeof apiKey !== 'string') {
      throw new ValidationError('API key must be a string', 'invalid_api_key_type');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(apiKey)) {
      throw new ValidationError('API key contains invalid characters', 'invalid_api_key_chars');
    }
    
    if (apiKey.length < 10 || apiKey.length > 100) {
      throw new ValidationError('API key length must be between 10 and 100 characters', 'invalid_api_key_length');
    }
    
    return true;
  }

  /**
   * Validate email format
   */
  validateEmail(email) {
    if (typeof email !== 'string') {
      throw new ValidationError('Email must be a string', 'invalid_email_type');
    }
    
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format', 'invalid_email_format');
    }
    
    return true;
  }

  /**
   * Validate password strength
   */
  validatePassword(password) {
    if (typeof password !== 'string') {
      throw new ValidationError('Password must be a string', 'invalid_password_type');
    }
    
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long', 'password_too_short');
    }
    
    if (!/[A-Z]/.test(password)) {
      throw new ValidationError('Password must contain at least one uppercase letter', 'password_missing_uppercase');
    }
    
    if (!/[a-z]/.test(password)) {
      throw new ValidationError('Password must contain at least one lowercase letter', 'password_missing_lowercase');
    }
    
    if (!/[0-9]/.test(password)) {
      throw new ValidationError('Password must contain at least one number', 'password_missing_number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      throw new ValidationError('Password must contain at least one special character', 'password_missing_special');
    }
    
    return true;
  }

  /**
   * Validate model name
   */
  validateModelName(modelName) {
    if (typeof modelName !== 'string') {
      throw new ValidationError('Model name must be a string', 'invalid_model_type');
    }
    
    if (!/^[a-zA-Z0-9_-]+$/.test(modelName)) {
      throw new ValidationError('Model name contains invalid characters', 'invalid_model_chars');
    }
    
    if (modelName.length < 1 || modelName.length > 100) {
      throw new ValidationError('Model name length must be between 1 and 100 characters', 'invalid_model_length');
    }
    
    return true;
  }

  /**
   * Validate prompt content
   */
  validatePrompt(prompt) {
    if (typeof prompt !== 'string') {
      throw new ValidationError('Prompt must be a string', 'invalid_prompt_type');
    }
    
    if (prompt.length === 0) {
      throw new ValidationError('Prompt cannot be empty', 'prompt_empty');
    }
    
    if (prompt.length > 10000) {
      throw new ValidationError('Prompt too long (max 10000 characters)', 'prompt_too_long');
    }
    
    // Check for potentially harmful content
    const harmfulPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /eval\s*\(/gi,
      /document\./gi,
      /window\./gi
    ];
    
    for (const pattern of harmfulPatterns) {
      if (pattern.test(prompt)) {
        throw new ValidationError('Prompt contains potentially harmful content', 'harmful_content');
      }
    }
    
    return true;
  }

  /**
   * Sanitize string input
   */
  sanitizeString(value, options = {}) {
    if (typeof value !== 'string') {
      return '';
    }
    
    let sanitized = value.trim();
    
    // Remove control characters except tab, newline, carriage return
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // HTML escape if enabled
    if (options.htmlEscape) {
      sanitized = sanitized
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, String.fromCharCode(39));
    }
    
    // Length limit
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.substring(0, options.maxLength);
    }
    
    return sanitized;
  }

  /**
   * Sanitize number input
   */
  sanitizeNumber(value, options = {}) {
    const num = parseFloat(value);
    if (isNaN(num)) {
      return options.defaultValue || 0;
    }
    
    // Range check
    if (options.min !== undefined && num < options.min) {
      return options.min;
    }
    
    if (options.max !== undefined && num > options.max) {
      return options.max;
    }
    
    return num;
  }

  /**
   * Sanitize boolean input
   */
  sanitizeBoolean(value, options = {}) {
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
        return true;
      }
      
      if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
        return false;
      }
    }
    
    return options.defaultValue || false;
  }

  /**
   * Sanitize array input
   */
  sanitizeArray(value, options = {}) {
    if (!Array.isArray(value)) {
      return [];
    }
    
    let sanitized = [...value];
    
    // Remove duplicates
    if (options.removeDuplicates) {
      sanitized = [...new Set(sanitized)];
    }
    
    // Limit length
    if (options.maxLength && sanitized.length > options.maxLength) {
      sanitized = sanitized.slice(0, options.maxLength);
    }
    
    // Sanitize each item
    if (options.sanitizeItem) {
      sanitized = sanitized.map(item => this.sanitizeItem(item, options.sanitizeItem));
    }
    
    return sanitized;
  }

  /**
   * Sanitize object input
   */
  sanitizeObject(value, options = {}) {
    if (typeof value !== 'object' || value === null) {
      return {};
    }
    
    const sanitized = {};
    
    for (const [key, val] of Object.entries(value)) {
      // Skip keys that don't match the allowed pattern
      if (options.allowedKeys && !options.allowedKeys.includes(key)) {
        continue;
      }
      
      // Sanitize key
      const sanitizedKey = this.sanitizeString(key, { htmlEscape: true });
      
      // Sanitize value
      let sanitizedVal = val;
      if (options.sanitizeValues) {
        sanitizedVal = this.sanitizeItem(val, options.sanitizeValues);
      }
      
      sanitized[sanitizedKey] = sanitizedVal;
    }
    
    return sanitized;
  }

  /**
   * Generic item sanitization
   */
  sanitizeItem(item, rules) {
    if (typeof rules === 'function') {
      return rules(item);
    }
    
    if (typeof rules === 'string' && this.sanitizationRules[rules]) {
      return this.sanitizationRules[rules](item);
    }
    
    return item;
  }

  /**
   * Validate file upload
   */
  validateFile(file, options = {}) {
    if (!file) {
      throw new ValidationError('No file provided', 'file_missing');
    }
    
    // Check file size
    if (options.maxSize && file.size > options.maxSize) {
      throw new ValidationError(`File too large (max ${options.maxSize} bytes)`, 'file_too_large');
    }
    
    // Check allowed MIME types
    if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
      throw new ValidationError(`File type not allowed. Allowed types: ${options.allowedTypes.join(', ')}`, 'file_type_not_allowed');
    }
    
    // Check file extension
    if (options.allowedExtensions) {
      const fileExtension = file.originalname.split('.').pop().toLowerCase();
      if (!options.allowedExtensions.includes(fileExtension)) {
        throw new ValidationError(`File extension not allowed. Allowed extensions: ${options.allowedExtensions.join(', ')}`, 'file_extension_not_allowed');
      }
    }
    
    return true;
  }

  /**
   * Validate request body size
   */
  validateRequestBodySize(body, maxSize = 10 * 1024 * 1024) { // Default 10MB
    if (!body) return true;
    
    const bodySize = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (bodySize > maxSize) {
      throw new ValidationError(`Request body too large (max ${maxSize} bytes)`, 'request_body_too_large');
    }
    
    return true;
  }
}

/**
 * Create and export validator instance
 */
const securityValidator = new SecurityValidator();

module.exports = {
  SecurityValidator,
  securityValidator
};