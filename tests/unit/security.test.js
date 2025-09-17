const { constantTimeCompare, validateApiKey, validators, RateLimiter } = require('../../utils/security');

describe('Security Utils', () => {
    describe('constantTimeCompare', () => {
        test('should return true for identical strings', () => {
            expect(constantTimeCompare('test', 'test')).toBe(true);
        });
        
        test('should return false for different strings', () => {
            expect(constantTimeCompare('test', 'different')).toBe(false);
        });
        
        test('should return false for different length strings', () => {
            expect(constantTimeCompare('test', 'testing')).toBe(false);
        });
        
        test('should handle empty strings', () => {
            expect(constantTimeCompare('', '')).toBe(true);
            expect(constantTimeCompare('test', '')).toBe(false);
        });
    });
    
    describe('validateApiKey', () => {
        test('should validate correct API key', () => {
            const validKey = 'secret-api-key-123';
            expect(validateApiKey(validKey, validKey)).toBe(true);
        });
        
        test('should reject incorrect API key', () => {
            expect(validateApiKey('wrong-key', 'correct-key')).toBe(false);
        });
        
        test('should handle null/undefined keys', () => {
            expect(validateApiKey(null, 'key')).toBe(false);
            expect(validateApiKey('key', null)).toBe(false);
            expect(validateApiKey(null, null)).toBe(false);
        });
    });
    
    describe('validators', () => {
        test('isValidString should validate strings', () => {
            expect(validators.isValidString('valid')).toBe(true);
            expect(validators.isValidString('')).toBe(false);
            expect(validators.isValidString('   ')).toBe(false);
            expect(validators.isValidString(123)).toBe(false);
        });
        
        test('isValidNumber should validate numbers', () => {
            expect(validators.isValidNumber(42)).toBe(true);
            expect(validators.isValidNumber(0)).toBe(true);
            expect(validators.isValidNumber(-1, 0)).toBe(false);
            expect(validators.isValidNumber(NaN)).toBe(false);
            expect(validators.isValidNumber('42')).toBe(false);
        });
        
        test('sanitizeString should clean input', () => {
            expect(validators.sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
            expect(validators.sanitizeString('  normal text  ')).toBe('normal text');
        });
    });
    
    describe('RateLimiter', () => {
        test('should allow requests within limit', () => {
            const limiter = new RateLimiter(60000, 5);
            
            expect(limiter.isAllowed('client1')).toBe(true);
            expect(limiter.isAllowed('client1')).toBe(true);
            expect(limiter.getRemainingRequests('client1')).toBe(3);
        });
        
        test('should block requests over limit', () => {
            const limiter = new RateLimiter(60000, 2);
            
            expect(limiter.isAllowed('client1')).toBe(true);
            expect(limiter.isAllowed('client1')).toBe(true);
            expect(limiter.isAllowed('client1')).toBe(false);
        });
        
        test('should reset after window', (done) => {
            const limiter = new RateLimiter(100, 1); // 100ms window, 1 request
            
            expect(limiter.isAllowed('client1')).toBe(true);
            expect(limiter.isAllowed('client1')).toBe(false);
            
            setTimeout(() => {
                expect(limiter.isAllowed('client1')).toBe(true);
                done();
            }, 150);
        });
    });
});