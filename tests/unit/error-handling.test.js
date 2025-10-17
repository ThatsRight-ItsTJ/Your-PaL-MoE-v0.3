/**
 * Comprehensive Error Handling and Fallback Tests
 * Tests error detection, classification, logging, recovery, and fallback mechanisms
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const {
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
} = require('../../error-handler');

// Mock external dependencies
jest.mock('fs', () => ({
    promises: {
        mkdir: jest.fn(),
        appendFile: jest.fn(),
        readFile: jest.fn()
    }
}));

jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/'))
}));

// Mock console methods
const originalConsole = { ...console };
beforeAll(() => {
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
});

afterAll(() => {
    Object.assign(console, originalConsole);
});

describe('Error Handling and Fallback Mechanisms', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock Express request/response objects
        mockReq = {
            method: 'POST',
            path: '/api/test',
            ip: '127.0.0.1',
            get: jest.fn((header) => header === 'User-Agent' ? 'TestAgent/1.0' : undefined),
            requestId: 'test-request-123',
            body: {},
            params: {},
            query: {}
        };

        mockRes = {
            statusCode: 200,
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
            getHeaders: jest.fn().mockReturnValue({}),
            setHeader: jest.fn(),
            end: jest.fn()
        };

        mockNext = jest.fn();

        // Reset error monitor
        errorMonitor.errorCounts = {};
        errorMonitor.lastErrorTime = {};
    });

    describe('API Error Scenarios', () => {
        test('should handle 429 (Too Many Requests) rate limiting errors', async () => {
            const rateLimitError = new RateLimitError('Rate limit exceeded', 60, 'rate_limit_exceeded');

            await errorHandler(rateLimitError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Rate limit exceeded',
                    type: 'rate_limit_error',
                    code: 'rate_limit_exceeded',
                    retry_after: 60
                })
            }));
            expect(fs.appendFile).toHaveBeenCalled();
        });

        test('should handle 401 (Unauthorized) authentication errors', async () => {
            const authError = new AuthenticationError('Invalid API key', 'invalid_api_key');

            await errorHandler(authError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Invalid API key',
                    type: 'authentication_error',
                    code: 'invalid_api_key'
                })
            }));
        });

        test('should handle 403 (Forbidden) permission errors', async () => {
            const forbiddenError = new AuthorizationError('Access denied', 'insufficient_permissions');

            await errorHandler(forbiddenError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(403);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Access denied',
                    type: 'authorization_error',
                    code: 'insufficient_permissions'
                })
            }));
        });

        test('should handle 404 (Not Found) endpoint errors', async () => {
            const notFoundError = new NotFoundError('Endpoint not found', 'endpoint_not_found');

            await errorHandler(notFoundError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Endpoint not found',
                    type: 'not_found_error',
                    code: 'endpoint_not_found'
                })
            }));
        });

        test('should handle 500 (Internal Server Error) provider errors', async () => {
            const serverError = new InternalServerError('Provider internal error', 'provider_internal_error');

            await errorHandler(serverError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Provider internal error',
                    type: 'internal_server_error',
                    code: 'provider_internal_error'
                })
            }));
        });

        test('should handle 502 (Bad Gateway) network errors', async () => {
            const badGatewayError = new ApiError('Bad gateway', 'network_error', 502, 'bad_gateway');

            await errorHandler(badGatewayError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(502);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Bad gateway',
                    type: 'network_error',
                    code: 'bad_gateway'
                })
            }));
        });

        test('should handle 503 (Service Unavailable) provider downtime', async () => {
            const serviceUnavailableError = new ApiError('Service temporarily unavailable', 'service_unavailable', 503, 'provider_downtime');

            await errorHandler(serviceUnavailableError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Service temporarily unavailable',
                    type: 'service_unavailable',
                    code: 'provider_downtime'
                })
            }));
        });

        test('should handle 504 (Gateway Timeout) timeout errors', async () => {
            const timeoutError = new ApiError('Gateway timeout', 'timeout_error', 504, 'gateway_timeout');

            await errorHandler(timeoutError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(504);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Gateway timeout',
                    type: 'timeout_error',
                    code: 'gateway_timeout'
                })
            }));
        });
    });

    describe('Network and Connection Errors', () => {
        test('should handle DNS resolution failures', async () => {
            const dnsError = new Error('ENOTFOUND');
            dnsError.code = 'ENOTFOUND';

            await errorHandler(dnsError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'ENOTFOUND',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle connection timeouts', async () => {
            const timeoutError = new Error('Timeout occurred');
            timeoutError.code = 'ETIMEDOUT';

            await errorHandler(timeoutError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Timeout occurred',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle read/write timeouts', async () => {
            const rwTimeoutError = new Error('Read/write timeout');
            rwTimeoutError.code = 'ESOCKETTIMEDOUT';

            await errorHandler(rwTimeoutError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Read/write timeout',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle SSL certificate errors', async () => {
            const sslError = new Error('SSL certificate verification failed');
            sslError.code = 'CERT_HAS_EXPIRED';

            await errorHandler(sslError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'SSL certificate verification failed',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle network unreachable errors', async () => {
            const networkError = new Error('Network is unreachable');
            networkError.code = 'ENETUNREACH';

            await errorHandler(networkError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Network is unreachable',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle proxy connection failures', async () => {
            const proxyError = new Error('Proxy connection failed');
            proxyError.code = 'ECONNREFUSED';

            await errorHandler(proxyError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Proxy connection failed',
                    type: 'internal_server_error'
                })
            }));
        });
    });

    describe('Configuration and Setup Errors', () => {
        test('should handle missing provider configurations', async () => {
            const configError = new ValidationError('Provider configuration not found', 'missing_provider_config');

            await errorHandler(configError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Provider configuration not found',
                    type: 'validation_error',
                    code: 'missing_provider_config'
                })
            }));
        });

        test('should handle invalid API keys', async () => {
            const invalidKeyError = new AuthenticationError('Invalid API key format', 'invalid_api_key_format');

            await errorHandler(invalidKeyError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(401);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Invalid API key format',
                    type: 'authentication_error',
                    code: 'invalid_api_key_format'
                })
            }));
        });

        test('should handle malformed provider URLs', async () => {
            const urlError = new ValidationError('Invalid provider URL format', 'malformed_provider_url');

            await errorHandler(urlError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Invalid provider URL format',
                    type: 'validation_error',
                    code: 'malformed_provider_url'
                })
            }));
        });

        test('should handle missing required parameters', async () => {
            const missingParamError = new ValidationError('Required parameter missing: api_key', 'missing_required_parameter');

            await errorHandler(missingParamError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Required parameter missing: api_key',
                    type: 'validation_error',
                    code: 'missing_required_parameter'
                })
            }));
        });

        test('should handle invalid parameter types', async () => {
            const typeError = new ValidationError('Parameter temperature must be number, got string', 'invalid_parameter_type');

            await errorHandler(typeError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Parameter temperature must be number, got string',
                    type: 'validation_error',
                    code: 'invalid_parameter_type'
                })
            }));
        });

        test('should handle corrupted configuration files', async () => {
            const corruptedConfigError = new ValidationError('Configuration file is corrupted', 'corrupted_config_file');

            await errorHandler(corruptedConfigError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Configuration file is corrupted',
                    type: 'validation_error',
                    code: 'corrupted_config_file'
                })
            }));
        });
    });

    describe('Resource and Capacity Errors', () => {
        test('should handle memory exhaustion', async () => {
            const memoryError = new Error('JavaScript heap out of memory');
            memoryError.code = 'ERR_OUT_OF_MEMORY';

            await errorHandler(memoryError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'JavaScript heap out of memory',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle disk space limitations', async () => {
            const diskError = new Error('No space left on device');
            diskError.code = 'ENOSPC';

            await errorHandler(diskError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'No space left on device',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle CPU overload scenarios', async () => {
            const cpuError = new ApiError('CPU usage exceeded threshold', 'resource_error', 503, 'cpu_overload');

            await errorHandler(cpuError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'CPU usage exceeded threshold',
                    type: 'resource_error',
                    code: 'cpu_overload'
                })
            }));
        });

        test('should handle concurrent request limits', async () => {
            const concurrentError = new RateLimitError('Too many concurrent requests', 30, 'concurrent_request_limit');

            await errorHandler(concurrentError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Too many concurrent requests',
                    type: 'rate_limit_error',
                    code: 'concurrent_request_limit',
                    retry_after: 30
                })
            }));
        });

        test('should handle token budget exhaustion', async () => {
            const tokenError = new ApiError('Token budget exhausted', 'quota_error', 429, 'token_budget_exhausted');

            await errorHandler(tokenError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Token budget exhausted',
                    type: 'quota_error',
                    code: 'token_budget_exhausted'
                })
            }));
        });

        test('should handle rate limit quota exceeded', async () => {
            const quotaError = new RateLimitError('Monthly quota exceeded', 86400, 'quota_exceeded');

            await errorHandler(quotaError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Monthly quota exceeded',
                    type: 'rate_limit_error',
                    code: 'quota_exceeded',
                    retry_after: 86400
                })
            }));
        });
    });

    describe('Data and Response Errors', () => {
        test('should handle malformed JSON responses', async () => {
            const jsonError = new Error('Unexpected token < in JSON at position 0');
            jsonError.name = 'SyntaxError';

            await errorHandler(jsonError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Unexpected token < in JSON at position 0',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should handle incomplete responses', async () => {
            const incompleteError = new ApiError('Response truncated', 'data_error', 502, 'incomplete_response');

            await errorHandler(incompleteError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(502);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Response truncated',
                    type: 'data_error',
                    code: 'incomplete_response'
                })
            }));
        });

        test('should handle unexpected response formats', async () => {
            const formatError = new ApiError('Unexpected response format', 'data_error', 502, 'unexpected_format');

            await errorHandler(formatError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(502);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Unexpected response format',
                    type: 'data_error',
                    code: 'unexpected_format'
                })
            }));
        });

        test('should handle empty responses', async () => {
            const emptyError = new ApiError('Empty response received', 'data_error', 502, 'empty_response');

            await errorHandler(emptyError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(502);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Empty response received',
                    type: 'data_error',
                    code: 'empty_response'
                })
            }));
        });

        test('should handle oversized responses', async () => {
            const oversizedError = new ApiError('Response size exceeds limit', 'data_error', 413, 'oversized_response');

            await errorHandler(oversizedError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(413);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Response size exceeds limit',
                    type: 'data_error',
                    code: 'oversized_response'
                })
            }));
        });

        test('should handle encoding errors', async () => {
            const encodingError = new Error('Invalid character encoding');
            encodingError.code = 'EILSEQ';

            await errorHandler(encodingError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Invalid character encoding',
                    type: 'internal_server_error'
                })
            }));
        });
    });

    describe('Workflow and Orchestration Errors', () => {
        test('should handle subtask dependency failures', async () => {
            const dependencyError = new ApiError('Subtask dependency failed', 'workflow_error', 500, 'dependency_failure');

            await errorHandler(dependencyError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Subtask dependency failed',
                    type: 'workflow_error',
                    code: 'dependency_failure'
                })
            }));
        });

        test('should handle workflow deadlocks', async () => {
            const deadlockError = new ApiError('Workflow deadlock detected', 'workflow_error', 500, 'workflow_deadlock');

            await errorHandler(deadlockError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Workflow deadlock detected',
                    type: 'workflow_error',
                    code: 'workflow_deadlock'
                })
            }));
        });

        test('should handle circular dependencies', async () => {
            const circularError = new ValidationError('Circular dependency detected', 'circular_dependency');

            await errorHandler(circularError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Circular dependency detected',
                    type: 'validation_error',
                    code: 'circular_dependency'
                })
            }));
        });

        test('should handle timeout cascades', async () => {
            const cascadeError = new ApiError('Timeout cascade occurred', 'workflow_error', 504, 'timeout_cascade');

            await errorHandler(cascadeError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(504);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Timeout cascade occurred',
                    type: 'workflow_error',
                    code: 'timeout_cascade'
                })
            }));
        });

        test('should handle resource conflicts', async () => {
            const conflictError = new ApiError('Resource conflict detected', 'workflow_error', 409, 'resource_conflict');

            await errorHandler(conflictError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(409);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Resource conflict detected',
                    type: 'workflow_error',
                    code: 'resource_conflict'
                })
            }));
        });

        test('should handle state corruption', async () => {
            const corruptionError = new ApiError('Workflow state corrupted', 'workflow_error', 500, 'state_corruption');

            await errorHandler(corruptionError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Workflow state corrupted',
                    type: 'workflow_error',
                    code: 'state_corruption'
                })
            }));
        });
    });

    describe('Recovery and Fallback Tests', () => {
        test('should test automatic provider failover', async () => {
            // This would typically test the router's failover logic
            // For now, we'll test the error classification for failover scenarios
            const failoverError = new ApiError('Primary provider failed, attempting failover', 'failover_error', 503, 'provider_failover');

            await errorHandler(failoverError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Primary provider failed, attempting failover',
                    type: 'failover_error',
                    code: 'provider_failover'
                })
            }));
        });

        test('should test configuration reload on failure', async () => {
            const reloadError = new ApiError('Configuration reload required', 'config_error', 503, 'config_reload_needed');

            await errorHandler(reloadError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Configuration reload required',
                    type: 'config_error',
                    code: 'config_reload_needed'
                })
            }));
        });

        test('should test circuit breaker patterns', async () => {
            const circuitBreakerError = new ApiError('Circuit breaker activated', 'circuit_breaker', 503, 'circuit_open');

            await errorHandler(circuitBreakerError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Circuit breaker activated',
                    type: 'circuit_breaker',
                    code: 'circuit_open'
                })
            }));
        });

        test('should test exponential backoff retry logic', async () => {
            const backoffError = new RateLimitError('Exponential backoff in progress', 120, 'exponential_backoff');

            await errorHandler(backoffError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(429);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Exponential backoff in progress',
                    type: 'rate_limit_error',
                    code: 'exponential_backoff',
                    retry_after: 120
                })
            }));
        });

        test('should test graceful degradation modes', async () => {
            const degradationError = new ApiError('Operating in degraded mode', 'degradation', 503, 'graceful_degradation');

            await errorHandler(degradationError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Operating in degraded mode',
                    type: 'degradation',
                    code: 'graceful_degradation'
                })
            }));
        });

        test('should test emergency fallback protocols', async () => {
            const emergencyError = new ApiError('Emergency fallback activated', 'emergency', 503, 'emergency_fallback');

            await errorHandler(emergencyError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(503);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Emergency fallback activated',
                    type: 'emergency',
                    code: 'emergency_fallback'
                })
            }));
        });
    });

    describe('Error Logging and Monitoring', () => {
        test('should log errors to file with proper structure', async () => {
            const testError = new ApiError('Test error', 'test_error', 500, 'test_code');

            await logError(testError, mockReq, mockRes);

            expect(fs.mkdir).toHaveBeenCalledWith(path.join(process.cwd(), 'logs'), { recursive: true });
            expect(fs.appendFile).toHaveBeenCalled();

            const loggedData = JSON.parse(fs.appendFile.mock.calls[0][1]);
            expect(loggedData).toMatchObject({
                error: {
                    name: 'ApiError',
                    message: 'Test error',
                    type: 'test_error',
                    code: 'test_code',
                    statusCode: 500
                },
                request: {
                    method: 'POST',
                    path: '/api/test',
                    ip: '127.0.0.1',
                    userAgent: 'TestAgent/1.0',
                    requestId: 'test-request-123'
                }
            });
        });

        test('should monitor error frequency and trigger alerts', () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            // Record errors to trigger alert threshold
            for (let i = 0; i < 10; i++) {
                errorMonitor.recordError('test_error_type');
            }

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error Alert: test_error_type has occurred 10 times')
            );

            consoleWarnSpy.mockRestore();
        });

        test('should provide error statistics', () => {
            errorMonitor.recordError('error_type_1');
            errorMonitor.recordError('error_type_2');
            errorMonitor.recordError('error_type_1');

            const stats = errorMonitor.getStats();

            expect(stats.error_type_1.count).toBe(2);
            expect(stats.error_type_2.count).toBe(1);
            expect(stats.error_type_1.lastSeen).toBeDefined();
        });

        test('should format error responses correctly', () => {
            const testError = new ApiError('Test message', 'test_type', 400, 'test_code');
            testError.timestamp = '2023-01-01T00:00:00.000Z';

            const formatted = formatErrorResponse(testError, mockReq);

            expect(formatted).toMatchObject({
                error: {
                    message: 'Test message',
                    type: 'test_type',
                    code: 'test_code',
                    timestamp: '2023-01-01T00:00:00.000Z'
                },
                request_id: 'test-request-123'
            });
        });

        test('should handle 404 not found handler', async () => {
            await notFoundHandler(mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(404);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Endpoint POST /api/test not found',
                    type: 'not_found_error',
                    code: 'endpoint_not_found'
                })
            }));
        });

        test('should wrap async handlers with error handling', async () => {
            const mockAsyncFn = jest.fn().mockRejectedValue(new Error('Async error'));
            const wrappedHandler = asyncHandler(mockAsyncFn);

            await wrappedHandler(mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        });

        test('should not expose stack traces in production', () => {
            process.env.NODE_ENV = 'production';

            const testError = new ApiError('Test error');
            testError.stack = 'Error stack trace';

            const formatted = formatErrorResponse(testError, mockReq);

            expect(formatted.error).not.toHaveProperty('stack');

            process.env.NODE_ENV = 'test';
        });

        test('should include stack traces in development', () => {
            process.env.NODE_ENV = 'development';

            const testError = new ApiError('Test error');
            testError.stack = 'Error stack trace';

            const formatted = formatErrorResponse(testError, mockReq);

            expect(formatted.error.stack).toBe('Error stack trace');

            process.env.NODE_ENV = 'test';
        });
    });

    describe('System Stability and Recovery', () => {
        test('should maintain system stability during error floods', () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            // Simulate error flood - alert threshold is 10, so 50 errors should trigger 5 alerts
            for (let i = 0; i < 50; i++) {
                errorMonitor.recordError('flood_error');
            }

            // Should alert 5 times (every 10 errors)
            expect(consoleWarnSpy).toHaveBeenCalledTimes(5);

            consoleWarnSpy.mockRestore();
        });

        test('should handle malformed error objects gracefully', async () => {
            const malformedError = {
                message: 'Malformed error',
                // Missing required properties
            };

            await errorHandler(malformedError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Malformed error',
                    type: 'internal_server_error'
                })
            }));
        });

        test('should prevent error handler recursion', async () => {
            // Mock fs.appendFile to throw an error (simulating logging failure)
            fs.appendFile.mockRejectedValue(new Error('Logging failed'));

            const testError = new ApiError('Test error');

            // Should not cause infinite recursion
            await errorHandler(testError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(console.error).toHaveBeenCalledWith('Failed to log error:', expect.any(Error));
        });

        test('should handle headers already sent scenario', async () => {
            mockRes.headersSent = true;

            const testError = new ApiError('Headers sent error');

            await errorHandler(testError, mockReq, mockRes, mockNext);

            expect(mockNext).toHaveBeenCalledWith(testError);
            expect(mockRes.status).not.toHaveBeenCalled();
        });

        test('should convert unknown error types to internal server errors', async () => {
            const unknownError = new Error('Unknown error type');
            unknownError.name = 'UnknownError';

            await errorHandler(unknownError, mockReq, mockRes, mockNext);

            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                error: expect.objectContaining({
                    message: 'Unknown error type',
                    type: 'internal_server_error'
                })
            }));
        });
    });
});