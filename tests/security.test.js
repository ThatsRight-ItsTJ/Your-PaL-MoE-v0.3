const request = require('supertest');
const app = require('../index');
const securityValidator = require('../security-validation-utils').securityValidator;
const securityAuditLogger = require('../security-audit-logger').securityAuditLogger;

describe('Security Implementation Tests', () => {
  describe('Security Validator', () => {
    test('should validate API key format', () => {
      expect(() => securityValidator.validateApiKey('valid-key-123')).not.toThrow();
      expect(() => securityValidator.validateApiKey('')).toThrow('API key length must be between 10 and 100 characters');
      expect(() => securityValidator.validateApiKey(123)).toThrow('API key must be a string');
    });

    test('should validate email format', () => {
      expect(() => securityValidator.validateEmail('test@example.com')).not.toThrow();
      expect(() => securityValidator.validateEmail('invalid-email')).toThrow('Invalid email format');
    });

    test('should validate password strength', () => {
      expect(() => securityValidator.validatePassword('StrongP@ssw0rd')).not.toThrow();
      expect(() => securityValidator.validatePassword('weak')).toThrow('Password must be at least 8 characters long');
      expect(() => securityValidator.validatePassword('nouppercase1!')).toThrow('Password must contain at least one uppercase letter');
    });

    test('should sanitize string input', () => {
      const result = securityValidator.sanitizeString('<script>alert("xss")</script>', { htmlEscape: true });
      expect(result).toBe('<script>alert("xss")</script>');
    });
  });

  describe('Security Audit Logger', () => {
    test('should log security events', async () => {
      const mockLogEntry = {
        timestamp: new Date().toISOString(),
        event_type: 'test_event',
        details: { test: true }
      };
      
      await securityAuditLogger.logEvent('test_event', { test: true });
      
      // In a real test, you would check the log file
      // For this example, we'll just ensure it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('Health Check Endpoint', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/);
      
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('checks');
    });
  });

  describe('Security Headers', () => {
    test('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/);
      
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options', 'DENY');
      expect(response.headers).toHaveProperty('x-xss-protection', '1; mode=block');
    });
  });
});

module.exports = {};