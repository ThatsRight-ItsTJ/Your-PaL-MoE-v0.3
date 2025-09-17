const ProviderUtils = require('../../utils/providers');

describe('ProviderUtils', () => {
    const mockProviders = [
        {
            name: 'OpenAI',
            type: 'llm',
            available: true,
            priority: 10,
            models: [
                { name: 'gpt-4', type: 'chat' },
                { name: 'gpt-3.5-turbo', type: 'chat' }
            ]
        },
        {
            name: 'Anthropic',
            type: 'llm',
            available: true,
            priority: 8,
            models: [
                { name: 'claude-3', type: 'chat' }
            ]
        },
        {
            name: 'HuggingFace',
            type: 'ml',
            available: false,
            priority: 5,
            models: [
                { name: 'bert-base', type: 'embedding' }
            ]
        }
    ];
    
    describe('filterProviders', () => {
        test('should filter by name', () => {
            const result = ProviderUtils.filterProviders(mockProviders, { name: 'OpenAI' });
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('OpenAI');
        });
        
        test('should filter by availability', () => {
            const result = ProviderUtils.filterProviders(mockProviders, { available: true });
            expect(result).toHaveLength(2);
            expect(result.every(p => p.available)).toBe(true);
        });
        
        test('should filter by model type', () => {
            const result = ProviderUtils.filterProviders(mockProviders, { modelType: 'chat' });
            expect(result).toHaveLength(2);
            expect(result.every(p => p.models.some(m => m.type === 'chat'))).toBe(true);
        });
        
        test('should handle invalid input', () => {
            expect(ProviderUtils.filterProviders(null)).toEqual([]);
            expect(ProviderUtils.filterProviders(undefined)).toEqual([]);
            expect(ProviderUtils.filterProviders('invalid')).toEqual([]);
        });
    });
    
    describe('sortProviders', () => {
        test('should sort by name ascending', () => {
            const result = ProviderUtils.sortProviders(mockProviders, 'name', 'asc');
            expect(result[0].name).toBe('Anthropic');
            expect(result[1].name).toBe('HuggingFace');
            expect(result[2].name).toBe('OpenAI');
        });
        
        test('should sort by priority descending', () => {
            const result = ProviderUtils.sortProviders(mockProviders, 'priority', 'desc');
            expect(result[0].priority).toBe(10);
            expect(result[1].priority).toBe(8);
            expect(result[2].priority).toBe(5);
        });
        
        test('should sort by model count', () => {
            const result = ProviderUtils.sortProviders(mockProviders, 'modelCount', 'desc');
            expect(result[0].models.length).toBe(2);
            expect(result[1].models.length).toBe(1);
        });
    });
    
    describe('getProviderStats', () => {
        test('should calculate correct statistics', () => {
            const stats = ProviderUtils.getProviderStats(mockProviders);
            
            expect(stats.total).toBe(3);
            expect(stats.available).toBe(2);
            expect(stats.totalModels).toBe(4);
            expect(stats.modelTypes.chat).toBe(3);
            expect(stats.modelTypes.embedding).toBe(1);
        });
        
        test('should handle empty array', () => {
            const stats = ProviderUtils.getProviderStats([]);
            expect(stats.total).toBe(0);
            expect(stats.available).toBe(0);
            expect(stats.totalModels).toBe(0);
        });
    });
    
    describe('findBestProvider', () => {
        test('should find best provider for model type', () => {
            const result = ProviderUtils.findBestProvider(mockProviders, 'chat');
            expect(result.name).toBe('OpenAI'); // Highest priority
        });
        
        test('should return null if no provider found', () => {
            const result = ProviderUtils.findBestProvider(mockProviders, 'nonexistent');
            expect(result).toBeNull();
        });
        
        test('should respect availability filter', () => {
            const result = ProviderUtils.findBestProvider(mockProviders, 'embedding');
            expect(result).toBeNull(); // HuggingFace is not available
        });
    });
});