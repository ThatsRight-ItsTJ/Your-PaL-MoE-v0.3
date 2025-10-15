const ProviderManager = require('../../config/provider-manager');
const ProviderLoader = require('../../config/provider-loader');
const ProviderNormalizer = require('../../config/provider-normalizer');
const ProviderValidator = require('../../config/provider-validator');

describe('ProviderManager', () => {
    let providerManager;

    beforeEach(() => {
        providerManager = new ProviderManager();
    });

    describe('loadProviders', () => {
        it('should load providers from CSV file', async () => {
            // Mock the provider loader
            jest.spyOn(ProviderLoader, 'loadProviders').mockResolvedValue([
                { name: 'TestProvider', baseUrl: 'https://api.test.com' }
            ]);

            await providerManager.loadProviders('test.csv');

            expect(providerManager.providers).toHaveLength(1);
            expect(providerManager.providers[0].name).toBe('TestProvider');
        });
    });

    describe('normalizeProviders', () => {
        it('should normalize provider data', () => {
            providerManager.providers = [
                { name: 'TestProvider', baseUrl: 'https://api.test.com' }
            ];

            jest.spyOn(ProviderNormalizer, 'normalize').mockReturnValue([
                { name: 'TestProvider', baseUrl: 'https://api.test.com' }
            ]);

            providerManager.normalizeProviders();

            expect(providerManager.normalizedProviders).toHaveLength(1);
        });
    });

    describe('validateConfigurations', () => {
        it('should validate provider configurations', () => {
            providerManager.normalizedProviders = [
                { name: 'TestProvider', baseUrl: 'https://api.test.com', apiKey: 'test-key' }
            ];

            jest.spyOn(ProviderValidator, 'validate').mockReturnValue({
                isValid: true,
                validProviders: providerManager.normalizedProviders,
                errors: []
            });

            const result = providerManager.validateConfigurations();

            expect(result.isValid).toBe(true);
        });
    });

    describe('getFilteredProviders', () => {
        it('should filter providers based on criteria', () => {
            providerManager.normalizedProviders = [
                { provider_name: 'Provider1', base_url: 'https://api1.com', model: 'gpt-3.5', type: 'openai' },
                { provider_name: 'Provider2', base_url: 'https://api2.com', model: 'claude-3', type: 'anthropic' }
            ];

            const filtered = providerManager.getFilteredProviders({ type: 'openai' });

            expect(filtered).toHaveLength(1);
            expect(filtered[0].provider_name).toBe('Provider1');
        });
    });

    describe('getSortedProviders', () => {
        it('should sort providers by specified criteria', () => {
            providerManager.normalizedProviders = [
                { name: 'BProvider', priority: 1 },
                { name: 'AProvider', priority: 2 }
            ];

            const sorted = providerManager.getSortedProviders('priority', 'desc');

            expect(sorted[0].name).toBe('AProvider');
            expect(sorted[1].name).toBe('BProvider');
        });
    });
});