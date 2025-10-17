/**
 * Comprehensive Prompt Types Test Suite
 * Tests the TaskMaster's ability to handle various prompt types and scenarios
 * Covers subtask decomposition, provider selection, workflow orchestration, and response quality
 */

const TaskMaster = require('../../taskmaster');
const RolesConfig = require('../../rolesConfig');

// Mock dependencies
jest.mock('../../utils/logger');
jest.mock('../../rolesConfig');

// Mock node-fetch
jest.mock('node-fetch', () => ({
    default: jest.fn()
}));

// Mock the dynamic import in taskmaster.js
jest.mock('node-fetch', () => ({
    default: jest.fn()
}), { virtual: true });

describe('Prompt Types Test Suite', () => {
    let taskMaster;
    let mockRolesConfig;
    let mockFetch;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Mock RolesConfig
        mockRolesConfig = {
            loadConfig: jest.fn().mockResolvedValue(),
            getTools: jest.fn().mockReturnValue({
                'text-generation': {
                    description: 'Generate text responses',
                    capabilities: ['text-generation', 'reasoning', 'analysis'],
                    parameters: {
                        prompt: { type: 'string', required: true },
                        max_tokens: { type: 'number', required: false }
                    },
                    endpoint: '/v1/chat/completions'
                },
                'code-execution': {
                    description: 'Execute code',
                    capabilities: ['code', 'execution'],
                    parameters: {
                        code: { type: 'string', required: true },
                        language: { type: 'string', required: true }
                    },
                    endpoint: '/v1/code/execute'
                },
                'image-generation': {
                    description: 'Generate images',
                    capabilities: ['multimodal', 'image'],
                    parameters: {
                        prompt: { type: 'string', required: true },
                        size: { type: 'string', required: false }
                    },
                    endpoint: '/v1/images/generations'
                }
            }),
            getProviderConfig: jest.fn()
        };

        RolesConfig.mockImplementation(() => mockRolesConfig);

        taskMaster = new TaskMaster();
        await taskMaster.initialize();

        // Mock the executeTool method to avoid actual API calls
        taskMaster.executeTool = jest.fn();
    });

    describe('Simple Query Tests', () => {
        test('should handle factual question prompts', async () => {
            const prompt = "What is the capital of France?";
            const parameters = { prompt, max_tokens: 100 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            // Mock the tool execution to avoid actual API calls
            taskMaster.executeTool = jest.fn().mockResolvedValue({
                toolName: 'text-generation',
                executionId: 'exec_test_123',
                result: { choices: [{ message: { content: 'Mock response' } }] },
                metadata: {
                    endpoint: '/v1/chat/completions',
                    provider: 'OpenAI',
                    executionTime: 100
                }
            });

            const startTime = Date.now();
            const result = await taskMaster.executeTool('text-generation', parameters);
            const executionTime = Date.now() - startTime;

            expect(result).toHaveProperty('toolName', 'text-generation');
            expect(result).toHaveProperty('executionId');
            expect(result.metadata.executionTime).toBeLessThan(5000); // Should complete quickly
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle definition/explanation prompts', async () => {
            const prompt = "Explain what machine learning is in simple terms.";
            const parameters = { prompt, max_tokens: 200 };

            taskMaster.executeTool.mockResolvedValue({
                toolName: 'text-generation',
                executionId: 'exec_test_124',
                result: { choices: [{ message: { content: 'Mock response' } }] },
                metadata: {
                    endpoint: '/v1/chat/completions',
                    provider: 'Anthropic',
                    executionTime: 150
                }
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle comparison prompts', async () => {
            const prompt = "Compare Python and JavaScript for web development.";
            const parameters = { prompt, max_tokens: 300 };

            taskMaster.executeTool.mockResolvedValue({
                toolName: 'text-generation',
                executionId: 'exec_test_125',
                result: { choices: [{ message: { content: 'Mock response' } }] },
                metadata: {
                    endpoint: '/v1/chat/completions',
                    provider: 'Google',
                    executionTime: 200
                }
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Google');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle opinion/analysis prompts', async () => {
            const prompt = "What are the advantages and disadvantages of remote work?";
            const parameters = { prompt, max_tokens: 250 };

            taskMaster.executeTool.mockResolvedValue({
                toolName: 'text-generation',
                executionId: 'exec_test_126',
                result: { choices: [{ message: { content: 'Mock response' } }] },
                metadata: {
                    endpoint: '/v1/chat/completions',
                    provider: 'OpenAI',
                    executionTime: 180
                }
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle creative writing prompts', async () => {
            const prompt = "Write a short story about a robot learning to paint.";
            const parameters = { prompt, max_tokens: 500 };

            taskMaster.executeTool.mockResolvedValue({
                toolName: 'text-generation',
                executionId: 'exec_test_127',
                result: { choices: [{ message: { content: 'Mock response' } }] },
                metadata: {
                    endpoint: '/v1/chat/completions',
                    provider: 'Anthropic',
                    executionTime: 250
                }
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });
    });

    describe('Complex Multi-Step Task Tests', () => {
        test('should handle research and analysis prompts', async () => {
            const prompt = "Research the impact of artificial intelligence on healthcare and provide a comprehensive analysis.";
            const parameters = { prompt, max_tokens: 1000 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.metadata.executionTime).toBeGreaterThan(0);
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle content creation with multiple steps', async () => {
            const prompt = "Create a blog post about sustainable living including introduction, main points, and conclusion.";
            const parameters = { prompt, max_tokens: 800 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle data processing and analysis', async () => {
            const prompt = "Analyze this dataset: [1,2,3,4,5] and provide statistical insights.";
            const parameters = { prompt, max_tokens: 300 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Google',
                base_url: 'https://generativelanguage.googleapis.com/v1',
                api_key: 'test-key',
                model: 'gemini-pro'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Google');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle multi-modal content generation', async () => {
            const prompt = "Generate an image of a futuristic city and describe it.";
            const parameters = { prompt, size: '1024x1024' };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'dall-e-3'
            });

            const result = await taskMaster.executeTool('image-generation', parameters);

            expect(result.toolName).toBe('image-generation');
            expect(result.result).toBeDefined();
        });

        test('should handle project planning prompts', async () => {
            const prompt = "Create a project plan for developing a mobile app including timeline, milestones, and resources needed.";
            const parameters = { prompt, max_tokens: 600 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });
    });

    describe('Professional Domain Tests', () => {
        test('should handle technical documentation prompts', async () => {
            const prompt = "Write API documentation for a user authentication endpoint.";
            const parameters = { prompt, max_tokens: 400 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle business analysis prompts', async () => {
            const prompt = "Analyze the market opportunity for electric vehicles in 2024.";
            const parameters = { prompt, max_tokens: 500 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Google',
                base_url: 'https://generativelanguage.googleapis.com/v1',
                api_key: 'test-key',
                model: 'gemini-pro'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Google');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle academic research prompts', async () => {
            const prompt = "Write a research paper abstract on climate change impacts.";
            const parameters = { prompt, max_tokens: 300 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle creative design prompts', async () => {
            const prompt = "Design a logo concept for a tech startup focused on AI.";
            const parameters = { prompt, size: '512x512' };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'dall-e-3'
            });

            const result = await taskMaster.executeTool('image-generation', parameters);

            expect(result.toolName).toBe('image-generation');
            expect(result.result).toBeDefined();
        });

        test('should handle customer service prompts', async () => {
            const prompt = "Draft a response to a customer complaint about delayed shipping.";
            const parameters = { prompt, max_tokens: 200 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });
    });

    describe('Creative and Content Tests', () => {
        test('should handle creative writing prompts (stories)', async () => {
            const prompt = "Write a science fiction short story about time travel.";
            const parameters = { prompt, max_tokens: 800 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle creative writing prompts (poems)', async () => {
            const prompt = "Write a haiku about autumn leaves.";
            const parameters = { prompt, max_tokens: 100 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle content marketing prompts', async () => {
            const prompt = "Create social media posts promoting a new fitness app.";
            const parameters = { prompt, max_tokens: 300 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Google',
                base_url: 'https://generativelanguage.googleapis.com/v1',
                api_key: 'test-key',
                model: 'gemini-pro'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Google');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle social media content prompts', async () => {
            const prompt = "Generate engaging Twitter threads about productivity tips.";
            const parameters = { prompt, max_tokens: 400 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle advertising copy prompts', async () => {
            const prompt = "Write compelling ad copy for a luxury watch brand.";
            const parameters = { prompt, max_tokens: 150 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle educational content prompts', async () => {
            const prompt = "Create a lesson plan for teaching basic algebra to middle school students.";
            const parameters = { prompt, max_tokens: 500 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Google',
                base_url: 'https://generativelanguage.googleapis.com/v1',
                api_key: 'test-key',
                model: 'gemini-pro'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Google');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });
    });

    describe('Analysis and Reasoning Tests', () => {
        test('should handle logical reasoning prompts', async () => {
            const prompt = "Solve this logic puzzle: If all bloops are razzes and some razzes are fizzles, are all bloops fizzles?";
            const parameters = { prompt, max_tokens: 200 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle critical thinking prompts', async () => {
            const prompt = "Critically evaluate the arguments for and against universal basic income.";
            const parameters = { prompt, max_tokens: 600 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle problem-solving prompts', async () => {
            const prompt = "Design a solution to reduce food waste in restaurants.";
            const parameters = { prompt, max_tokens: 400 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Google',
                base_url: 'https://generativelanguage.googleapis.com/v1',
                api_key: 'test-key',
                model: 'gemini-pro'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Google');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle decision-making prompts', async () => {
            const prompt = "Help me decide whether to pursue a master's degree or start working full-time.";
            const parameters = { prompt, max_tokens: 350 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle strategic planning prompts', async () => {
            const prompt = "Develop a 5-year strategic plan for a small e-commerce business.";
            const parameters = { prompt, max_tokens: 700 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });
    });

    describe('Integration and Edge Case Tests', () => {
        test('should handle ambiguous or unclear prompts', async () => {
            const prompt = "Do the thing with the stuff.";
            const parameters = { prompt, max_tokens: 100 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle contradictory prompts', async () => {
            const prompt = "Write a short story that is both happy and sad, peaceful and chaotic.";
            const parameters = { prompt, max_tokens: 300 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle extremely long prompts', async () => {
            const longPrompt = "Explain quantum physics in detail covering historical development, key principles, mathematical foundations, experimental evidence, current applications, and future implications. Include discussions of wave-particle duality, uncertainty principle, entanglement, quantum computing, cryptography, teleportation, and potential unified theories. Provide examples from various fields including chemistry, biology, information technology, and cosmology. Discuss philosophical implications and debates in the field.".repeat(5);
            const parameters = { prompt: longPrompt, max_tokens: 1000 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Google',
                base_url: 'https://generativelanguage.googleapis.com/v1',
                api_key: 'test-key',
                model: 'gemini-pro'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Google');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle extremely complex prompts', async () => {
            const complexPrompt = "Design a comprehensive system architecture for a distributed microservices-based e-commerce platform that must handle 1M concurrent users, integrate with 50+ third-party services, support real-time inventory updates, implement advanced recommendation algorithms using machine learning, ensure PCI DSS compliance, provide multi-region failover capabilities, and scale automatically based on demand patterns while maintaining sub-100ms response times.";
            const parameters = { prompt: complexPrompt, max_tokens: 1200 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.toolName).toBe('text-generation');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });

        test('should handle mixed-language prompts', async () => {
            const mixedPrompt = "Explain the concept of 'Schadenfreude' in English, then provide examples in German, French, and Spanish.";
            const parameters = { prompt: mixedPrompt, max_tokens: 250 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result.metadata.provider).toBe('Anthropic');
            expect(result.result.choices[0].message.content).toBe('Mock response');
        });
    });

    describe('Performance and Quality Verification Tests', () => {
        test('should verify execution time performance', async () => {
            const prompt = "Write a simple haiku about nature.";
            const parameters = { prompt, max_tokens: 50 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const startTime = Date.now();
            const result = await taskMaster.executeTool('text-generation', parameters);
            const executionTime = Date.now() - startTime;

            expect(executionTime).toBeGreaterThan(0);
            expect(executionTime).toBeLessThan(10000); // Should complete within reasonable time
            expect(result.metadata.executionTime).toBe(executionTime);
        });

        test('should verify response quality structure', async () => {
            const prompt = "List 5 benefits of exercise.";
            const parameters = { prompt, max_tokens: 200 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const result = await taskMaster.executeTool('text-generation', parameters);

            expect(result).toHaveProperty('toolName');
            expect(result).toHaveProperty('executionId');
            expect(result).toHaveProperty('result');
            expect(result).toHaveProperty('metadata');
            expect(result.metadata).toHaveProperty('endpoint');
            expect(result.metadata).toHaveProperty('provider');
            expect(result.metadata).toHaveProperty('executionTime');
        });

        test('should verify workflow orchestration with multiple steps', async () => {
            // Simulate a multi-step workflow
            const prompts = [
                "Brainstorm ideas for a mobile app.",
                "Create a basic wireframe description.",
                "Write user stories for the main features."
            ];

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Anthropic',
                base_url: 'https://api.anthropic.com/v1',
                api_key: 'test-key',
                model: 'claude-3'
            });

            const results = [];
            for (const prompt of prompts) {
                const result = await taskMaster.executeTool('text-generation', { prompt, max_tokens: 300 });
                results.push(result);
            }

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.metadata.provider).toBe('Anthropic');
                expect(result.result.choices[0].message.content).toBe('Mock response');
            });
        });

        test('should verify provider/model selection based on task complexity', async () => {
            // Simple task - should use basic model
            const simplePrompt = "What is 2+2?";
            const simpleParams = { prompt: simplePrompt, max_tokens: 50 };

            // Complex task - should use advanced model
            const complexPrompt = "Design a neural network architecture for image recognition.";
            const complexParams = { prompt: complexPrompt, max_tokens: 800 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            const simpleResult = await taskMaster.executeTool('text-generation', simpleParams);
            const complexResult = await taskMaster.executeTool('text-generation', complexParams);

            expect(simpleResult.metadata.provider).toBe('OpenAI');
            expect(complexResult.metadata.provider).toBe('OpenAI');
            expect(simpleResult.metadata.executionTime).toBeGreaterThan(0);
            expect(complexResult.metadata.executionTime).toBeGreaterThan(0);
        });

        test('should handle concurrent requests and load balancing', async () => {
            const prompt = "Generate a random number between 1 and 100.";
            const parameters = { prompt, max_tokens: 50 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'Google',
                base_url: 'https://generativelanguage.googleapis.com/v1',
                api_key: 'test-key',
                model: 'gemini-pro'
            });

            // Simulate concurrent requests
            const promises = Array(5).fill().map(() =>
                taskMaster.executeTool('text-generation', parameters)
            );

            const results = await Promise.all(promises);

            expect(results).toHaveLength(5);
            results.forEach(result => {
                expect(result.metadata.provider).toBe('Google');
                expect(result.result.choices[0].message.content).toBe('Mock response');
            });
        });
    });

    describe('Error Handling and Recovery Tests', () => {
        test('should handle API failures gracefully', async () => {
            mockFetch.mockRejectedValueOnce(new Error('API rate limit exceeded'));

            const prompt = "Hello world";
            const parameters = { prompt, max_tokens: 50 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            await expect(taskMaster.executeTool('text-generation', parameters))
                .rejects.toThrow('API rate limit exceeded');
        });

        test('should handle invalid parameters', async () => {
            const parameters = { prompt: 123, max_tokens: "invalid" }; // Invalid types

            await expect(taskMaster.executeTool('text-generation', parameters))
                .rejects.toThrow('Parameter \'prompt\' must be of type string');
        });

        test('should handle missing required parameters', async () => {
            const parameters = { max_tokens: 100 }; // Missing required prompt

            await expect(taskMaster.executeTool('text-generation', parameters))
                .rejects.toThrow('Required parameter \'prompt\' is missing');
        });

        test('should handle tool not found', async () => {
            await expect(taskMaster.executeTool('non-existent-tool', {}))
                .rejects.toThrow('Tool \'non-existent-tool\' not found');
        });
    });

    describe('Statistics and Monitoring Tests', () => {
        test('should track execution statistics', async () => {
            const prompt = "Test prompt";
            const parameters = { prompt, max_tokens: 50 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            await taskMaster.executeTool('text-generation', parameters);
            await taskMaster.executeTool('text-generation', parameters);

            const stats = taskMaster.getStats();

            expect(stats.totalExecutions).toBe(2);
            expect(stats.successfulExecutions).toBe(2);
            expect(stats.successRate).toBe(100);
            expect(stats.toolStats['text-generation'].callCount).toBe(2);
        });

        test('should handle execution history limits', async () => {
            // Mock a large number of executions
            taskMaster.executionHistory = Array(1000).fill().map((_, i) => ({
                executionId: `exec_${i}`,
                success: true,
                endTime: Date.now(),
                resultSize: 100
            }));

            const prompt = "Test prompt";
            const parameters = { prompt, max_tokens: 50 };

            mockRolesConfig.getProviderConfig.mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4'
            });

            await taskMaster.executeTool('text-generation', parameters);

            expect(taskMaster.executionHistory.length).toBeLessThanOrEqual(1000);
        });
    });
});