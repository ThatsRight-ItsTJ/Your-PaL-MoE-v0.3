/**
 * Security utilities for environment variable handling
 * Provides secure access to environment variables with validation and masking
 */

/**
 * Secure environment variable wrapper
 */
class SecureEnv {
  constructor() {
    this.secureVars = new Set([
      'API_KEY', 'APIKEY', 'SECRET', 'PASSWORD', 'TOKEN', 
      'CREDENTIAL', 'HF_API_KEY', 'OPENAI_API_KEY'
    ]);
  }

  /**
   * Get environment variable with optional validation
   */
  get(name, defaultValue = undefined, options = {}) {
    const value = process.env[name] || defaultValue;
    
    // Validate environment variable format if it's a sensitive variable
    if (this.isSensitiveVar(name) && value) {
      if (options.minLength && value.length < options.minLength) {
        throw new Error(`Invalid ${name}: too short (minimum ${options.minLength} characters)`);
      }
      
      if (options.maxLength && value.length > options.maxLength) {
        throw new Error(`Invalid ${name}: too long (maximum ${options.maxLength} characters)`);
      }
      
      if (options.pattern && !options.pattern.test(value)) {
        throw new Error(`Invalid ${name}: format does not match requirements`);
      }
      
      // Check for test values in production
      if (options.noTestValues && value.toLowerCase().includes('test')) {
        console.warn(`Warning: ${name} contains test value`);
      }
    }
    
    return value;
  }

  /**
   * Check if environment variable name indicates sensitive data
   */
  isSensitiveVar(name) {
    const upperName = name.toUpperCase();
    return Array.from(this.secureVars).some(secureVar => 
      upperName.includes(secureVar)
    );
  }

  /**
   * Get environment variable with masking for sensitive data
   */
  getMasked(name, defaultValue = undefined) {
    const value = this.get(name, defaultValue);
    if (!value) return value;
    
    if (this.isSensitiveVar(name)) {
      return this.maskValue(value);
    }
    
    return value;
  }

  /**
   * Mask sensitive values
   */
  maskValue(value) {
    if (!value || value.length <= 8) return '***';
    return value.substring(0, 4) + '***' + value.substring(value.length - 4);
  }

  /**
   * Validate all required environment variables
   */
  validateRequired(requiredVars) {
    const missing = [];
    const invalid = [];
    
    for (const { name, ...options } of requiredVars) {
      try {
        const value = this.get(name, undefined, options);
        if (value === undefined) {
          missing.push(name);
        }
      } catch (error) {
        invalid.push({ name, error: error.message });
      }
    }
    
    return { missing, invalid };
  }

  /**
   * Get all environment variables with sensitive data masked
   */
  getAll(masked = true) {
    const result = {};
    
    for (const [name, value] of Object.entries(process.env)) {
      if (masked && this.isSensitiveVar(name)) {
        result[name] = this.maskValue(value);
      } else {
        result[name] = value;
      }
    }
    
    return result;
  }
}

/**
 * Create a secure environment instance
 */
const secureEnv = new SecureEnv();

module.exports = {
  SecureEnv,
  secureEnv
};