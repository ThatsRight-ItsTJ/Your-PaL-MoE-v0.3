/**
 * Free Model Tracker
 * Main tracker engine for maintaining real-time catalog of available free models
 * Integrates with Provider Configuration Manager and Dynamic Model Parser
 */

const logger = require('../utils/logger');
const DynamicModelParser = require('../parsers/dynamic-parser');
const { ModelProfileManager } = require('../schema/modelProfileSchema');

class ModelTracker {
    constructor(providerManager = null) {
        this.providerManager = providerManager;
        this.dynamicParser = new DynamicModelParser(providerManager);
        this.profileManager = new ModelProfileManager();

        // Model catalog storage
        this.modelCatalog = new Map(); // modelId -> modelProfile
        this.providerCatalogs = new Map(); // providerName -> Set<modelId>

        // Tracking state
        this.lastUpdate = new Date();
        this.updateInProgress = false;

        // Statistics
        this.stats = {
            totalModels: 0,
            freeModels: 0,
            providersTracked: 0,
            lastFullUpdate: null,
            updatesPerformed: 0,
            errorsEncountered: 0
        };

        // Configuration
        this.config = {
            updateInterval: 5 * 60 * 1000, // 5 minutes default
            maxConcurrentUpdates: 3,
            retryAttempts: 3,
            retryDelay: 1000,
            cacheTimeout: 10 * 60 * 1000 // 10 minutes
        };

        logger.info('ModelTracker initialized');
    }

    /**
     * Initialize tracker with provider configurations
     */
    async initialize() {
        try {
            logger.info('Initializing Model Tracker');

            if (!this.providerManager) {
                throw new Error('ProviderManager is required for ModelTracker initialization');
            }

            // Load and validate providers
            await this.providerManager.loadProviders();
            this.providerManager.normalizeProviders();
            const validationResult = this.providerManager.validateConfigurations();

            if (!validationResult.isValid) {
                logger.warn(`Provider validation issues: ${validationResult.errors.length} errors`);
            }

            // Initialize provider catalogs
            const providers = this.providerManager.getFilteredProviders();
            providers.forEach(provider => {
                const providerName = provider.name || provider.provider_name;
                this.providerCatalogs.set(providerName, new Set());
            });

            this.stats.providersTracked = providers.length;
            logger.info(`ModelTracker initialized with ${providers.length} providers`);

        } catch (error) {
            logger.error(`ModelTracker initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Perform full catalog update for all providers
     */
    async updateCatalog(options = {}) {
        if (this.updateInProgress) {
            logger.warn('Catalog update already in progress, skipping');
            return { skipped: true, reason: 'update_in_progress' };
        }

        this.updateInProgress = true;
        const startTime = Date.now();

        try {
            logger.info('Starting full catalog update');

            const providers = this.providerManager.getFilteredProviders();
            const results = [];
            const errors = [];

            // Process providers with concurrency control
            const batches = this.chunkArray(providers, this.config.maxConcurrentUpdates);

            for (const batch of batches) {
                const batchPromises = batch.map(provider =>
                    this.updateProviderCatalog(provider, options)
                );

                const batchResults = await Promise.allSettled(batchPromises);

                batchResults.forEach((result, index) => {
                    const provider = batch[index];
                    const providerName = provider.name || provider.provider_name;

                    if (result.status === 'fulfilled') {
                        results.push({
                            provider: providerName,
                            ...result.value
                        });
                    } else {
                        errors.push({
                            provider: providerName,
                            error: result.reason.message
                        });
                        this.stats.errorsEncountered++;
                    }
                });
            }

            // Update statistics
            this.stats.updatesPerformed++;
            this.stats.lastFullUpdate = new Date();
            this.lastUpdate = new Date();

            const duration = Date.now() - startTime;
            logger.info(`Catalog update completed in ${duration}ms. Results: ${results.length} success, ${errors.length} errors`);

            return {
                success: true,
                duration,
                results,
                errors,
                stats: this.getStats()
            };

        } catch (error) {
            logger.error(`Catalog update failed: ${error.message}`);
            this.stats.errorsEncountered++;
            return {
                success: false,
                error: error.message,
                stats: this.getStats()
            };
        } finally {
            this.updateInProgress = false;
        }
    }

    /**
     * Update catalog for specific provider
     */
    async updateProviderCatalog(provider, options = {}) {
        const providerName = provider.name || provider.provider_name;
        const startTime = Date.now();

        try {
            logger.debug(`Updating catalog for provider: ${providerName}`);

            // Simulate API call to provider (in real implementation, this would make actual HTTP requests)
            const apiResponse = await this.fetchProviderModels(provider);

            // Parse response using dynamic parser
            const parseResult = await this.dynamicParser.extractModels(apiResponse, providerName);

            if (parseResult.error) {
                throw new Error(`Parsing failed: ${parseResult.error}`);
            }

            // Process extracted models
            const processedModels = await this.processProviderModels(providerName, parseResult.all);

            // Update provider catalog
            const modelIds = new Set(processedModels.map(m => m.id));
            this.providerCatalogs.set(providerName, modelIds);

            const duration = Date.now() - startTime;

            return {
                provider: providerName,
                modelsFound: parseResult.total,
                freeModels: parseResult.freeCount,
                newModels: processedModels.length,
                duration
            };

        } catch (error) {
            logger.error(`Provider catalog update failed for ${providerName}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Fetch models from provider API (mock implementation)
     */
    async fetchProviderModels(provider) {
        // This is a mock implementation
        // In real implementation, this would make HTTP requests to provider APIs
        const providerName = provider.name || provider.provider_name;

        // Simulate API response based on provider type
        if (providerName.toLowerCase().includes('openai')) {
            return {
                data: [
                    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
                    { id: 'gpt-4', name: 'GPT-4' }
                ]
            };
        } else if (providerName.toLowerCase().includes('huggingface')) {
            return {
                models: [
                    { modelId: 'microsoft/DialoGPT-medium', tags: ['conversational'] },
                    { modelId: 'distilbert-base-uncased', tags: ['embeddings'] }
                ]
            };
        }

        // Default mock response
        return {
            models: [
                { id: `${providerName}-model-1`, name: `${providerName} Model 1` },
                { id: `${providerName}-model-2`, name: `${providerName} Model 2` }
            ]
        };
    }

    /**
     * Process and validate models from provider
     */
    async processProviderModels(providerName, models) {
        const processedModels = [];

        for (const model of models) {
            try {
                // Create standardized profile
                const profile = {
                    id: model.id || model.name || `${providerName}_${Date.now()}`,
                    name: model.name || model.id,
                    provider: providerName,
                    capabilities: model.capabilities || [],
                    tags: model.tags || [],
                    discovered_at: new Date().toISOString(),
                    last_updated: new Date().toISOString(),
                    source: {
                        parser: 'dynamic-parser',
                        provider: providerName
                    }
                };

                // Validate and store profile
                const validatedProfile = this.profileManager.addProfile(profile);
                this.modelCatalog.set(profile.id, validatedProfile);
                processedModels.push(validatedProfile);

            } catch (error) {
                logger.warn(`Failed to process model ${model.id || model.name}: ${error.message}`);
                continue;
            }
        }

        return processedModels;
    }

    /**
     * Get all available models
     */
    getAllModels() {
        return Array.from(this.modelCatalog.values());
    }

    /**
     * Get free models only
     */
    getFreeModels() {
        return this.getAllModels().filter(model => {
            // In real implementation, this would check pricing information
            // For now, assume all models are free for demonstration
            return true;
        });
    }

    /**
     * Get models by provider
     */
    getModelsByProvider(providerName) {
        const modelIds = this.providerCatalogs.get(providerName);
        if (!modelIds) return [];

        return Array.from(modelIds)
            .map(id => this.modelCatalog.get(id))
            .filter(model => model !== undefined);
    }

    /**
     * Search models by capability
     */
    searchModelsByCapability(capability) {
        return this.profileManager.getProfilesByCapability(capability);
    }

    /**
     * Get tracker statistics
     */
    getStats() {
        const allModels = this.getAllModels();
        const freeModels = this.getFreeModels();

        return {
            ...this.stats,
            totalModels: allModels.length,
            freeModels: freeModels.length,
            providersTracked: this.providerCatalogs.size,
            lastUpdate: this.lastUpdate.toISOString(),
            updateInProgress: this.updateInProgress
        };
    }

    /**
     * Check if catalog needs update
     */
    needsUpdate() {
        const timeSinceLastUpdate = Date.now() - this.lastUpdate.getTime();
        return timeSinceLastUpdate > this.config.updateInterval;
    }

    /**
     * Utility function to chunk arrays
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Configure tracker settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('ModelTracker configuration updated', this.config);
    }

    /**
     * Clear all catalogs and reset state
     */
    clearCatalog() {
        this.modelCatalog.clear();
        this.providerCatalogs.clear();
        this.profileManager = new ModelProfileManager();
        this.lastUpdate = new Date();
        this.stats = {
            totalModels: 0,
            freeModels: 0,
            providersTracked: 0,
            lastFullUpdate: null,
            updatesPerformed: 0,
            errorsEncountered: 0
        };
        logger.info('Model catalog cleared');
    }
}

module.exports = ModelTracker;