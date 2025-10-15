/**
 * Unit Tests for Dynamic Model Parser
 */

const DynamicModelParser = require('../../parsers/dynamic-parser');
const PricingDetector = require('../../parsers/pricing-detector');
const FallbackParser = require('../../parsers/fallback-parser');
const {
    OpenAIFormatStrategy,
    ArrayFormatStrategy,
    CatalogFormatStrategy,
    HuggingFaceFormatStrategy
} = require('../../parsers/format-strategies');

// Mock provider manager
const mockProviderManager = {
    getFilteredProviders: jest.fn()
};

describe('DynamicModelParser', () => {
    let parser;

    beforeEach(() => {
        parser = new DynamicModelParser(mockProviderManager);
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize with default strategies', () => {
            expect(parser.strategies).toHaveLength(4);
            expect(parser.strategies[0]).toBeInstanceOf(OpenAIFormatStrategy);
            expect(parser.strategies[1]).toBeInstanceOf(HuggingFaceFormatStrategy);
            expect(parser.strategies[2]).toBeInstanceOf(CatalogFormatStrategy);
            expect(parser.strategies[3]).toBeInstanceOf(ArrayFormatStrategy);
        });

        test('should initialize with pricing detector and fallback parser', () => {
            expect(parser.pricingDetector).toBeInstanceOf(PricingDetector);
            expect(parser.fallbackParser).toBeInstanceOf(FallbackParser);
        });

        test('should initialize statistics', () => {
            const stats = parser.getStats();
            expect(stats.totalParses).toBe(0);
            expect(stats.successfulParses).toBe(0);
            expect(stats.failedParses).toBe(0);
        });
    });

    describe('OpenAI Format Parsing', () => {
        test('should parse OpenAI chat completion response', async () => {
            const openaiResponse = {
                choices: [{
                    message: { content: 'Hello world' },
                    finish_reason: 'stop'
                }],
                usage: { prompt_tokens: 10, completion_tokens: 20 },
                model: 'gpt-3.5-turbo'
            };

            const result = await parser.parseResponse(openaiResponse, 'openai');

            expect(result.content).toBe('Hello world');
            expect(result.model).toBe('gpt-3.5-turbo');
            expect(result.strategy).toBe('openai');
            expect(result.fallback_used).toBe(false);
        });

        test('should parse OpenAI models list response', async () => {
            const modelsResponse = {
                data: [
                    { id: 'gpt-3.5-turbo', owned_by: 'openai' },
                    { id: 'gpt-4', owned_by: 'openai' }
                ]
            };

            const result = await parser.extractModels(modelsResponse, 'openai');

            expect(result.all).toHaveLength(2);
            expect(result.all[0].id).toBe('gpt-3.5-turbo');
            expect(result.all[0].provider).toBe('openai');
            expect(result.all[0].capabilities).toContain('text-generation');
        });

        test('should parse OpenAI embeddings response', async () => {
            const embeddingsResponse = {
                data: [[0.1, 0.2, 0.3]],
                usage: { prompt_tokens: 5 },
                model: 'text-embedding-ada-002'
            };

            const result = await parser.parseResponse(embeddingsResponse, 'openai');

            expect(result.embeddings).toEqual([[0.1, 0.2, 0.3]]);
            expect(result.model).toBe('text-embedding-ada-002');
            expect(result.strategy).toBe('openai');
        });
    });

    describe('Array Format Parsing', () => {
        test('should parse simple string array of model names', async () => {
            const stringArray = ['gpt-3.5-turbo', 'gpt-4', 'claude-3'];

            const result = await parser.extractModels(stringArray, 'test-provider');

            expect(result.all).toHaveLength(3);
            expect(result.all[0].id).toBe('gpt-3.5-turbo');
            expect(result.all[0].provider).toBe('test-provider');
            expect(result.all[0].capabilities).toContain('text-generation');
        });

        test('should parse array of model objects', async () => {
            const modelObjects = [
                { id: 'model1', name: 'Model One', capabilities: ['text-generation'] },
                { id: 'model2', name: 'Model Two', capabilities: ['embeddings'] }
            ];

            const result = await parser.extractModels(modelObjects, 'test-provider');

            expect(result.all).toHaveLength(2);
            expect(result.all[0].id).toBe('model1');
            expect(result.all[0].capabilities).toContain('text-generation');
            expect(result.all[1].capabilities).toContain('embeddings');
        });
    });

    describe('Catalog Format Parsing', () => {
        test('should parse catalog with models array', async () => {
            const catalogResponse = {
                models: [
                    { id: 'llama-7b', pipeline_tag: 'text-generation' },
                    { id: 'bert-base', pipeline_tag: 'feature-extraction' }
                ],
                total: 2
            };

            const result = await parser.extractModels(catalogResponse, 'huggingface');

            expect(result.all).toHaveLength(2);
            expect(result.all[0].capabilities).toContain('text-generation');
            expect(result.all[1].capabilities).toContain('embeddings');
        });

        test('should parse nested catalog structure', async () => {
            const nestedCatalog = {
                catalog: {
                    models: [
                        { id: 'model1', type: 'text' },
                        { id: 'model2', type: 'vision' }
                    ]
                }
            };

            const result = await parser.extractModels(nestedCatalog, 'test-provider');

            expect(result.all).toHaveLength(2);
            expect(result.all[0].id).toBe('model1');
            expect(result.all[1].id).toBe('model2');
        });
    });

    describe('HuggingFace Format Parsing', () => {
        test('should parse HuggingFace models list', async () => {
            const hfResponse = [
                {
                    id: 'microsoft/DialoGPT-medium',
                    pipeline_tag: 'text-generation',
                    tags: ['conversational'],
                    downloads: 1000,
                    likes: 50
                },
                {
                    id: 'sentence-transformers/all-MiniLM-L6-v2',
                    pipeline_tag: 'feature-extraction',
                    tags: ['sentence-similarity'],
                    downloads: 5000,
                    likes: 200
                }
            ];

            const result = await parser.extractModels(hfResponse, 'huggingface');

            expect(result.all).toHaveLength(2);
            expect(result.all[0].provider).toBe('huggingface');
            expect(result.all[0].capabilities).toContain('text-generation');
            expect(result.all[0].capabilities).toContain('conversation');
            expect(result.all[1].capabilities).toContain('embeddings');
        });

        test('should detect free tier for HuggingFace models', async () => {
            const hfModels = [
                {
                    id: 'free-model',
                    pipeline_tag: 'text-generation',
                    private: false,
                    gated: false
                }
            ];

            const result = await parser.extractModels(hfModels, 'huggingface');

            expect(result.free).toHaveLength(1);
            expect(result.free[0].id).toBe('free-model');
        });
    });

    describe('Fallback Parsing', () => {
        test('should use fallback parser for unknown formats', async () => {
            const unknownResponse = {
                customField: [
                    { modelId: 'custom-model-1' },
                    { modelId: 'custom-model-2' }
                ]
            };

            const result = await parser.extractModels(unknownResponse, 'unknown-provider');

            expect(result.all).toHaveLength(2);
            expect(result.all[0].id).toBe('custom-model-1');
            expect(result.all[1].id).toBe('custom-model-2');
        });

        test('should handle JSON string responses', async () => {
            const jsonString = JSON.stringify({
                models: [
                    { id: 'string-model-1' },
                    { id: 'string-model-2' }
                ]
            });

            const result = await parser.parseResponse(jsonString, 'test-provider');

            expect(result.models).toHaveLength(2);
            expect(result.fallback_used).toBe(true);
        });
    });

    describe('Free Tier Detection', () => {
        test('should identify free tier models', async () => {
            const models = [
                { id: 'free-model', name: 'Free Model', pricing: { tier: 'free' } },
                { id: 'paid-model', name: 'Paid Model', pricing: { cost: 0.01 } },
                { id: 'trial-model', name: 'Trial Model', tags: ['trial'] }
            ];

            const result = await parser.extractModels(models, 'test-provider');

            expect(result.free).toHaveLength(2);
            expect(result.free.map(m => m.id)).toContain('free-model');
            expect(result.free.map(m => m.id)).toContain('trial-model');
        });

        test('should handle pricing analysis', async () => {
            const modelWithPricing = {
                id: 'priced-model',
                pricing: { cost: 0.005 } // Very low cost
            };

            const result = await parser.extractModels([modelWithPricing], 'test-provider');

            expect(result.free).toHaveLength(1);
            expect(result.free[0].id).toBe('priced-model');
        });
    });

    describe('Provider Integration', () => {
        test('should enhance context with provider information', async () => {
            const mockProvider = {
                name: 'test-provider',
                base_url: 'https://api.test.com',
                priority: 1
            };

            mockProviderManager.getFilteredProviders.mockReturnValue([mockProvider]);

            const response = { data: [{ id: 'test-model' }] };
            const result = await parser.parseResponse(response, 'test-provider');

            expect(mockProviderManager.getFilteredProviders).toHaveBeenCalledWith({ name: 'test-provider' });
            expect(result.provider_info.name).toBe('test-provider');
        });

        test('should handle provider lookup failure gracefully', async () => {
            mockProviderManager.getFilteredProviders.mockImplementation(() => {
                throw new Error('Provider not found');
            });

            const response = { data: [{ id: 'test-model' }] };
            const result = await parser.parseResponse(response, 'invalid-provider');

            expect(result).toBeDefined();
            expect(result.error).toBeFalsy();
        });
    });

    describe('Caching', () => {
        test('should cache parsing results', async () => {
            const response = { data: [{ id: 'cached-model' }] };

            // First parse
            const result1 = await parser.parseResponse(response, 'test-provider');
            expect(result1.models).toHaveLength(1);

            // Second parse should use cache
            const result2 = await parser.parseResponse(response, 'test-provider');
            expect(result2.models).toHaveLength(1);

            const stats = parser.getStats();
            expect(stats.cacheHits).toBe(1);
        });

        test('should clear cache when requested', () => {
            parser.parseCache.set('test', { data: 'test', timestamp: Date.now() });
            expect(parser.parseCache.size).toBe(1);

            parser.clearCache();
            expect(parser.parseCache.size).toBe(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid responses gracefully', async () => {
            const invalidResponse = null;

            const result = await parser.parseResponse(invalidResponse, 'test-provider');

            expect(result.error).toBe(true);
            expect(result.error_type).toBe('parsing_failed');
        });

        test('should handle parsing exceptions', async () => {
            // Mock a strategy to throw an error
            const mockStrategy = {
                name: 'mock',
                canHandle: () => true,
                parse: () => { throw new Error('Mock error'); }
            };

            parser.strategies.unshift(mockStrategy);

            const response = { test: 'data' };
            const result = await parser.parseResponse(response, 'test-provider');

            expect(result.error).toBe(true);
            expect(result.error_type).toBe('parser_exception');
        });
    });

    describe('Statistics', () => {
        test('should track parsing statistics', async () => {
            const response = { data: [{ id: 'stat-model' }] };

            await parser.parseResponse(response, 'test-provider');
            await parser.extractModels(response, 'test-provider');

            const stats = parser.getStats();
            expect(stats.totalParses).toBe(2);
            expect(stats.successfulParses).toBe(2);
            expect(stats.modelsExtracted).toBe(1);
        });

        test('should calculate success rate', async () => {
            // Successful parse
            await parser.parseResponse({ data: [{ id: 'success' }] }, 'test');

            // Failed parse
            await parser.parseResponse(null, 'test');

            const stats = parser.getStats();
            expect(stats.success_rate).toBe('50.00%');
        });

        test('should reset statistics', () => {
            parser.stats.totalParses = 10;
            parser.resetStats();

            const stats = parser.getStats();
            expect(stats.totalParses).toBe(0);
        });
    });

    describe('Strategy Management', () => {
        test('should add custom strategy with high priority', () => {
            const customStrategy = {
                name: 'custom',
                canHandle: () => false,
                parse: () => ({}),
                extractModels: () => []
            };

            const initialLength = parser.strategies.length;
            parser.addStrategy(customStrategy, 'high');

            expect(parser.strategies).toHaveLength(initialLength + 1);
            expect(parser.strategies[0]).toBe(customStrategy);
        });

        test('should add custom strategy with low priority', () => {
            const customStrategy = {
                name: 'custom-low',
                canHandle: () => false,
                parse: () => ({}),
                extractModels: () => []
            };

            const initialLength = parser.strategies.length;
            parser.addStrategy(customStrategy, 'low');

            expect(parser.strategies).toHaveLength(initialLength + 1);
            expect(parser.strategies[parser.strategies.length - 1]).toBe(customStrategy);
        });

        test('should remove strategy', () => {
            const strategyName = parser.strategies[0].name;
            const initialLength = parser.strategies.length;

            const removed = parser.removeStrategy(strategyName);

            expect(removed).toBe(true);
            expect(parser.strategies).toHaveLength(initialLength - 1);
            expect(parser.strategies.find(s => s.name === strategyName)).toBeUndefined();
        });

        test('should return false when removing non-existent strategy', () => {
            const initialLength = parser.strategies.length;
            const removed = parser.removeStrategy('non-existent');

            expect(removed).toBe(false);
            expect(parser.strategies).toHaveLength(initialLength);
        });
    });

    describe('Model Enhancement', () => {
        test('should enhance models with additional information', async () => {
            const basicModel = { name: 'Basic Model' };

            const result = await parser.extractModels([basicModel], 'test-provider');

            expect(result.all[0].id).toBeDefined();
            expect(result.all[0].provider).toBe('test-provider');
            expect(result.all[0].discovered_at).toBeDefined();
            expect(result.all[0].source.parser).toBe('dynamic-parser');
        });

        test('should infer capabilities from model name', async () => {
            const models = [
                { id: 'gpt-model', name: 'GPT Model' },
                { id: 'embed-model', name: 'Embedding Model' },
                { id: 'dalle-model', name: 'DALL-E Model' }
            ];

            const result = await parser.extractModels(models, 'test-provider');

            expect(result.all[0].capabilities).toContain('text-generation');
            expect(result.all[1].capabilities).toContain('embeddings');
            expect(result.all[2].capabilities).toContain('image-generation');
        });
    });
});