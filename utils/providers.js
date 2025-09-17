const { validators } = require('./security');
const logger = require('./logger');

/**
 * Provider filtering and sorting utilities
 */
class ProviderUtils {
    /**
     * Filter providers by various criteria
     */
    static filterProviders(providers, filters = {}) {
        if (!Array.isArray(providers)) {
            return [];
        }
        
        return providers.filter(provider => {
            // Validate provider structure
            if (!validators.validateProvider(provider)) {
                logger.warn(`Invalid provider structure: ${provider?.name || 'unknown'}`);
                return false;
            }
            
            // Filter by name
            if (filters.name && !provider.name.toLowerCase().includes(filters.name.toLowerCase())) {
                return false;
            }
            
            // Filter by type
            if (filters.type && provider.type !== filters.type) {
                return false;
            }
            
            // Filter by availability
            if (filters.available !== undefined && provider.available !== filters.available) {
                return false;
            }
            
            // Filter by model capabilities
            if (filters.modelType) {
                const hasModelType = provider.models.some(model => 
                    model.type === filters.modelType
                );
                if (!hasModelType) {
                    return false;
                }
            }
            
            return true;
        });
    }
    
    /**
     * Sort providers by various criteria
     */
    static sortProviders(providers, sortBy = 'name', order = 'asc') {
        if (!Array.isArray(providers)) {
            return [];
        }
        
        const sortedProviders = [...providers];
        
        sortedProviders.sort((a, b) => {
            let comparison = 0;
            
            switch (sortBy) {
                case 'name':
                    comparison = a.name.localeCompare(b.name);
                    break;
                case 'priority':
                    comparison = (a.priority || 0) - (b.priority || 0);
                    break;
                case 'modelCount':
                    comparison = (a.models?.length || 0) - (b.models?.length || 0);
                    break;
                case 'availability':
                    comparison = (a.available === b.available) ? 0 : (a.available ? -1 : 1);
                    break;
                default:
                    comparison = 0;
            }
            
            return order === 'desc' ? -comparison : comparison;
        });
        
        return sortedProviders;
    }
    
    /**
     * Get provider statistics
     */
    static getProviderStats(providers) {
        if (!Array.isArray(providers)) {
            return {
                total: 0,
                available: 0,
                totalModels: 0,
                modelTypes: {}
            };
        }
        
        const stats = {
            total: providers.length,
            available: 0,
            totalModels: 0,
            modelTypes: {}
        };
        
        providers.forEach(provider => {
            if (provider.available) {
                stats.available++;
            }
            
            if (provider.models) {
                stats.totalModels += provider.models.length;
                
                provider.models.forEach(model => {
                    const type = model.type || 'unknown';
                    stats.modelTypes[type] = (stats.modelTypes[type] || 0) + 1;
                });
            }
        });
        
        return stats;
    }
    
    /**
     * Find best provider for a specific model type
     */
    static findBestProvider(providers, modelType, criteria = {}) {
        const filtered = this.filterProviders(providers, {
            modelType,
            available: true,
            ...criteria
        });
        
        if (filtered.length === 0) {
            return null;
        }
        
        // Sort by priority and return the best one
        const sorted = this.sortProviders(filtered, 'priority', 'desc');
        return sorted[0];
    }
}

module.exports = ProviderUtils;