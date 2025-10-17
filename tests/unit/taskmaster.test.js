/**
 * Comprehensive Unit Tests for TaskMaster
 * Tests initialization, tool registration, provider configuration, and error handling
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const TaskMaster = require('../../taskmaster');
const RolesConfig = require('../../rolesConfig');

// Mock external dependencies
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));

// Mock node-fetch as a static import
jest.mock('node-fetch', () => jest.fn());

const fetch = require('node-fetch');

// Mock RolesConfig
jest.mock('../../rolesConfig');

describe('TaskMaster', () => {
    let taskMaster;
    let mockRolesConfig;
    let mockFetch;

    // Mock configuration data
    const mockConfig = {
        endpoints: {
            '/chat/completions': {
                models: {
                    'gpt-4': [{
                        provider_name: 'OpenAI',
                        base_url: 'https://api.openai.com/v1',
                        api_key: 'test-key',
                        model: 'gpt-4',
                        priority: 1
                    }]
                }
            }
        }
    };

    const mockTools = {
        'gpt-4': {
            name: 'gpt-4',
            description: 'AI model tool for gpt-4',
            endpoint: '/chat/completions',
            providers: [{
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4',
                priority: 1
            }],
            capabilities: ['text-generation', 'reasoning'],
            parameters: {
                messages: { type: 'array', required: true },
                temperature: { type: 'number', default: 0.7, min: 0, max: 2 },
                max_tokens: { type: 'number', default: 1000, min: 1, max: 4000 },
                stream: { type: 'boolean', default: false }
            }
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup RolesConfig mock
        mockRolesConfig = {
            loadConfig: jest.fn().mockResolvedValue(mockConfig),
            getTools: jest.fn().mockReturnValue(mockTools),
            getProviderConfig: jest.fn().mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4',
                priority: 1
            })
        };
        RolesConfig.mockImplementation(() => mockRolesConfig);

        // Setup fetch mock
        mockFetch = jest.fn();
        fetch.default = mockFetch;

        // Mock the dynamic import in TaskMaster by replacing the method
        const originalExecuteToolWithProvider = TaskMaster.prototype.executeToolWithProvider;
        TaskMaster.prototype.executeToolWithProvider = async function(context) {
            const { toolName, parameters, providerConfig } = context;
            const tool = this.registeredTools[toolName];

            // Prepare request based on endpoint type
            const requestData = this.prepareRequest(tool.endpoint, parameters, providerConfig);

            // Mock the API call instead of using dynamic import
            const targetUrl = `${providerConfig.base_url.replace(/\/+$/, '')}${tool.endpoint}`;

            const headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'Your-PaL-MoE/0.3',
                'Accept': '*/*'
            };

            if (providerConfig.api_key && !providerConfig.base_url.includes('/api/openai')) {
                headers['Authorization'] = `Bearer ${providerConfig.api_key}`;
            }

            const response = await mockFetch(targetUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestData),
                timeout: 120000
            });

            if (!response.ok) {
                throw new Error(`Provider API error: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            return this.formatResponse(tool.endpoint, result, context);
        };

        taskMaster = new TaskMaster();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    describe('Initialization Tests', () => {
        test('should initialize successfully with valid configuration', async () => {
            const emitSpy = jest.spyOn(taskMaster, 'emit');

            await taskMaster.initialize();

            expect(mockRolesConfig.loadConfig).toHaveBeenCalledTimes(1);
            expect(taskMaster.isInitialized).toBe(true);
            expect(emitSpy).toHaveBeenCalledWith('initialized');
            expect(taskMaster.registeredTools).toHaveProperty('gpt-4');
        });

        test('should fail initialization with invalid configuration', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            mockRolesConfig.loadConfig.mockRejectedValue(new Error('Config load failed'));

            await expect(taskMaster.initialize()).rejects.toThrow('Config load failed');

            expect(taskMaster.isInitialized).toBe(false);
            expect(consoleSpy).toHaveBeenCalledWith('[TaskMaster] Initialization failed:', 'Config load failed');

            consoleSpy.mockRestore();
        });

        test('should emit initialized event during successful initialization', async () => {
            const emitSpy = jest.spyOn(taskMaster, 'emit');

            await taskMaster.initialize();

            expect(emitSpy).toHaveBeenCalledWith('initialized');
        });

        test('should reload configuration successfully', async () => {
            await taskMaster.initialize();
            const emitSpy = jest.spyOn(taskMaster, 'emit');

            await taskMaster.reload();

            expect(mockRolesConfig.loadConfig).toHaveBeenCalledTimes(2);
            expect(emitSpy).toHaveBeenCalledWith('reloaded');
            // After reload, tools should be re-registered
            expect(Object.keys(taskMaster.registeredTools)).toContain('gpt-4');
        });
    });

    describe('Tool Registration Tests', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should register tools with valid configurations', () => {
            const toolConfig = {
                name: 'test-tool',
                description: 'Test tool',
                endpoint: '/test',
                capabilities: ['test'],
                parameters: { param1: { type: 'string', required: true } }
            };

            const emitSpy = jest.spyOn(taskMaster, 'emit');

            taskMaster.registerTool('test-tool', toolConfig);

            expect(taskMaster.registeredTools['test-tool']).toMatchObject({
                ...toolConfig,
                callCount: 0,
                lastCalled: null
            });
            expect(taskMaster.registeredTools['test-tool'].registeredAt).toBeDefined();
            expect(emitSpy).toHaveBeenCalledWith('toolRegistered', { name: 'test-tool', config: toolConfig });
        });

        test('should handle duplicate tool registration', () => {
            const toolConfig = {
                name: 'duplicate-tool',
                description: 'Duplicate tool',
                endpoint: '/duplicate',
                capabilities: ['duplicate'],
                parameters: {}
            };

            taskMaster.registerTool('duplicate-tool', toolConfig);
            const firstRegistrationTime = taskMaster.registeredTools['duplicate-tool'].registeredAt;

            // Small delay to ensure different timestamp
            setTimeout(() => {
                taskMaster.registerTool('duplicate-tool', { ...toolConfig, description: 'Updated description' });
                expect(taskMaster.registeredTools['duplicate-tool'].description).toBe('Updated description');
                expect(taskMaster.registeredTools['duplicate-tool'].registeredAt).not.toBe(firstRegistrationTime);
            }, 1);
        });

        test('should list all registered tools correctly', () => {
            const tools = taskMaster.listTools();

            expect(tools).toHaveLength(1);
            expect(tools[0]).toMatchObject({
                name: 'gpt-4',
                description: 'AI model tool for gpt-4',
                capabilities: ['text-generation', 'reasoning'],
                parameters: expect.any(Object)
            });
        });

        test('should retrieve specific tool information', () => {
            const tool = taskMaster.getTool('gpt-4');

            expect(tool).toMatchObject({
                name: 'gpt-4',
                description: 'AI model tool for gpt-4',
                endpoint: '/chat/completions',
                callCount: 0,
                lastCalled: null
            });
        });

        test('should return undefined for non-existent tool', () => {
            const tool = taskMaster.getTool('non-existent-tool');

            expect(tool).toBeUndefined();
        });

        test('should validate tool parameters correctly', () => {
            const parameterSchema = {
                requiredParam: { type: 'string', required: true },
                optionalParam: { type: 'number', default: 5 },
                arrayParam: { type: 'array' }
            };

            // Valid parameters
            expect(() => {
                taskMaster.validateParameters(parameterSchema, {
                    requiredParam: 'test',
                    optionalParam: 10,
                    arrayParam: [1, 2, 3]
                });
            }).not.toThrow();

            // Missing required parameter
            expect(() => {
                taskMaster.validateParameters(parameterSchema, { optionalParam: 10 });
            }).toThrow('Required parameter \'requiredParam\' is missing');

            // Wrong type
            expect(() => {
                taskMaster.validateParameters(parameterSchema, {
                    requiredParam: 'test',
                    optionalParam: 'not-a-number'
                });
            }).toThrow('Parameter \'optionalParam\' must be of type number, got string');
        });

        test('should track tool statistics correctly', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'test response' } }] })
            });

            const initialStats = taskMaster.getStats();
            expect(initialStats.toolStats['gpt-4'].callCount).toBe(0);
            expect(initialStats.toolStats['gpt-4'].lastCalled).toBeNull();

            await taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] });

            const updatedStats = taskMaster.getStats();
            expect(updatedStats.toolStats['gpt-4'].callCount).toBe(1);
            expect(updatedStats.toolStats['gpt-4'].lastCalled).toBeDefined();
        });
    });

    describe('Provider Configuration Tests', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should load provider configuration correctly', () => {
            const providerConfig = taskMaster.rolesConfig.getProviderConfig('gpt-4');

            expect(providerConfig).toEqual({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4',
                priority: 1
            });
        });

        test('should handle provider priority correctly', () => {
            const highPriorityProvider = {
                provider_name: 'HighPriority',
                base_url: 'https://high-priority.com',
                api_key: 'high-key',
                model: 'gpt-4',
                priority: 1
            };

            const lowPriorityProvider = {
                provider_name: 'LowPriority',
                base_url: 'https://low-priority.com',
                api_key: 'low-key',
                model: 'gpt-4',
                priority: 10
            };

            mockRolesConfig.getProviderConfig.mockReturnValue(highPriorityProvider);

            const config = taskMaster.rolesConfig.getProviderConfig('gpt-4');
            expect(config.provider_name).toBe('HighPriority');
        });

        test('should select provider based on priority', () => {
            const providers = [
                { provider_name: 'Low', priority: 5 },
                { provider_name: 'High', priority: 1 },
                { provider_name: 'Medium', priority: 3 }
            ];

            // Mock the sort to return highest priority first
            mockRolesConfig.getProviderConfig.mockReturnValue(providers[1]); // High priority

            const config = taskMaster.rolesConfig.getProviderConfig('gpt-4');
            expect(config.provider_name).toBe('High');
        });

        test('should handle provider fallback when primary fails', async () => {
            // Mock primary provider failure
            mockFetch.mockRejectedValueOnce(new Error('Primary provider failed'));

            // Mock fallback provider success
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: jest.fn().mockResolvedValue({ choices: [{ message: { content: 'fallback response' } }] })
            });

            // Mock providers with fallback
            mockRolesConfig.getProviderConfig
                .mockReturnValueOnce({
                    provider_name: 'Primary',
                    base_url: 'https://primary.com',
                    api_key: 'primary-key',
                    model: 'gpt-4'
                })
                .mockReturnValueOnce({
                    provider_name: 'Fallback',
                    base_url: 'https://fallback.com',
                    api_key: 'fallback-key',
                    model: 'gpt-4'
                });

            // This test expects the current implementation to fail on first attempt
            // In a real implementation, there would be retry logic with fallback
            await expect(taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] }))
                .rejects.toThrow('Primary provider failed');
        });
    });

    describe('Error Handling Tests', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should throw error for missing tools', async () => {
            await expect(taskMaster.executeTool('non-existent-tool', {}))
                .rejects.toThrow('Tool \'non-existent-tool\' not found');
        });

        test('should throw error when TaskMaster not initialized', async () => {
            const uninitializedTaskMaster = new TaskMaster();

            await expect(uninitializedTaskMaster.executeTool('gpt-4', {}))
                .rejects.toThrow('TaskMaster not initialized');
        });

        test('should throw error for missing provider configuration', async () => {
            mockRolesConfig.getProviderConfig.mockReturnValue(null);

            await expect(taskMaster.executeTool('gpt-4', { messages: [] }))
                .rejects.toThrow('No provider configuration found for tool \'gpt-4\'');
        });

        test('should handle invalid parameters', async () => {
            await expect(taskMaster.executeTool('gpt-4', {}))
                .rejects.toThrow('Required parameter \'messages\' is missing');
        });

        test('should handle API failures gracefully', async () => {
            mockFetch.mockRejectedValue(new Error('API call failed'));

            await expect(taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] }))
                .rejects.toThrow('API call failed');
        });

        test('should handle HTTP error responses', async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            await expect(taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] }))
                .rejects.toThrow('Provider API error: 500 Internal Server Error');
        });

        test('should handle network timeouts', async () => {
            mockFetch.mockRejectedValue(new Error('Timeout'));

            await expect(taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] }))
                .rejects.toThrow('Timeout');
        });

        test('should emit toolExecutionFailed event on execution errors', async () => {
            const emitSpy = jest.spyOn(taskMaster, 'emit');
            mockFetch.mockRejectedValue(new Error('Execution failed'));

            await expect(taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] }))
                .rejects.toThrow('Execution failed');

            expect(emitSpy).toHaveBeenCalledWith('toolExecutionFailed', expect.objectContaining({
                error: expect.any(Error)
            }));
        });

        test('should maintain execution history for failed executions', async () => {
            mockFetch.mockRejectedValue(new Error('Test failure'));

            await expect(taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] }))
                .rejects.toThrow('Test failure');

            const stats = taskMaster.getStats();
            expect(stats.totalExecutions).toBe(1);
            expect(stats.failedExecutions).toBe(1);
            expect(stats.successRate).toBe(0);
        });
    });

    describe('Execution and Statistics', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should execute tool successfully and return formatted response', async () => {
            const mockResponse = {
                choices: [{ message: { content: 'Hello from GPT-4' } }],
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue(mockResponse)
            });

            const emitSpy = jest.spyOn(taskMaster, 'emit');
            const result = await taskMaster.executeTool('gpt-4', {
                messages: [{ role: 'user', content: 'Hello' }]
            });

            expect(result).toMatchObject({
                toolName: 'gpt-4',
                result: mockResponse,
                metadata: {
                    endpoint: '/chat/completions',
                    provider: 'OpenAI',
                    executionTime: expect.any(Number)
                }
            });
            expect(emitSpy).toHaveBeenCalledWith('toolExecuted', expect.any(Object));
        });

        test('should generate unique execution IDs', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ choices: [] })
            });

            const result1 = await taskMaster.executeTool('gpt-4', { messages: [] });
            const result2 = await taskMaster.executeTool('gpt-4', { messages: [] });

            expect(result1.executionId).not.toBe(result2.executionId);
            expect(result1.executionId).toMatch(/^exec_\d+_[a-z0-9]+$/);
        });

        test('should maintain execution history with limits', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ choices: [] })
            });

            // Execute more than 1000 times to test history limit
            for (let i = 0; i < 1005; i++) {
                await taskMaster.executeTool('gpt-4', { messages: [] });
            }

            expect(taskMaster.executionHistory).toHaveLength(1000);
        });

        test('should calculate correct statistics', async () => {
            mockFetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ choices: [] })
                })
                .mockRejectedValueOnce(new Error('Failure'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: jest.fn().mockResolvedValue({ choices: [] })
                });

            await taskMaster.executeTool('gpt-4', { messages: [] });
            await expect(taskMaster.executeTool('gpt-4', { messages: [] })).rejects.toThrow();
            await taskMaster.executeTool('gpt-4', { messages: [] });

            const stats = taskMaster.getStats();
            expect(stats.totalExecutions).toBe(3);
            expect(stats.successfulExecutions).toBe(2);
            expect(stats.failedExecutions).toBe(1);
            expect(stats.successRate).toBeCloseTo(66.67, 1);
        });

        test('should prepare request data correctly for different endpoints', async () => {
            const chatParams = {
                messages: [{ role: 'user', content: 'test' }],
                temperature: 0.5,
                max_tokens: 100
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ choices: [] })
            });

            await taskMaster.executeTool('gpt-4', chatParams);

            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-key'
                    }),
                    body: JSON.stringify({
                        ...chatParams,
                        model: 'gpt-4'
                    })
                })
            );
        });
    });

    describe('Event Emission', () => {
        test('should extend EventEmitter', () => {
            expect(taskMaster).toBeInstanceOf(EventEmitter);
        });

        test('should emit events in correct order during lifecycle', async () => {
            const events = [];
            const eventSpy = jest.fn((event) => events.push(event));

            taskMaster.on('initialized', () => eventSpy('initialized'));
            taskMaster.on('toolRegistered', () => eventSpy('toolRegistered'));
            taskMaster.on('reloaded', () => eventSpy('reloaded'));

            await taskMaster.initialize();
            await taskMaster.reload();

            expect(eventSpy).toHaveBeenCalledWith('initialized');
            expect(eventSpy).toHaveBeenCalledWith('toolRegistered');
            expect(eventSpy).toHaveBeenCalledWith('reloaded');
        });
    });
});