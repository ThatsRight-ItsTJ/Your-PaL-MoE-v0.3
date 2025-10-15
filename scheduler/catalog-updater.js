/**
 * Catalog Updater
 * Handles automated model catalog discovery and updates
 */

const logger = require('../utils/logger');
const { metricsCollector } = require('../utils/monitoring');

class CatalogUpdater {
    constructor(modelTracker) {
        this.modelTracker = modelTracker;
        this.isInitialized = false;

        // Update configuration
        this.config = {
            batchSize: 10,
            maxConcurrentUpdates: 3,
            retryAttempts: 3,
            retryDelay: 30000, // 30 seconds
            updateTimeout: 300000, // 5 minutes
            enableIncrementalUpdates: true,
            forceFullUpdateInterval: 24 * 60 * 60 * 1000, // 24 hours
            staleThreshold: 7 * 24 * 60 * 60 * 1000 // 7 days
        };

        // Update state
        this.updateQueue = [];
        this.activeUpdates = new Map();
        this.lastFullUpdate = null;
        this.updateStats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            modelsAdded: 0,
            modelsUpdated: 0,
            modelsRemoved: 0,
            averageUpdateTime: 0
        };

        logger.info('CatalogUpdater initialized');
    }

    /**
     * Initialize the catalog updater
     */
    async initialize(modelTracker) {
        if (this.isInitialized) return;

        this.modelTracker = modelTracker || this.modelTracker;
        this.isInitialized = true;

        logger.info('CatalogUpdater initialized successfully');
    }

    /**
     * Perform catalog update for all providers
     */
    async performCatalogUpdate(options = {}) {
        const startTime = Date.now();
        const updateId = `update-${Date.now()}`;

        logger.info('Starting catalog update', { updateId, options });

        try {
            // Determine update type
            const isFullUpdate = this.shouldPerformFullUpdate();
            const providers = this.getProvidersToUpdate(options.providers);

            // Queue updates
            for (const provider of providers) {
                this.queueProviderUpdate(provider, {
                    updateId,
                    isFullUpdate,
                    ...options
                });
            }

            // Process update queue
            const results = await this.processUpdateQueue(updateId);

            // Update statistics
            this.updateStats.totalUpdates++;
            this.lastFullUpdate = isFullUpdate ? new Date() : this.lastFullUpdate;

            const duration = Date.now() - startTime;
            this.updateStats.averageUpdateTime =
                (this.updateStats.averageUpdateTime + duration) / 2;

            // Record metrics
            metricsCollector.recordRequest('catalog-update', null, true, duration);

            const summary = this.generateUpdateSummary(results);
            logger.info('Catalog update completed', { updateId, duration, summary });

            return {
                updateId,
                duration,
                isFullUpdate,
                results,
                summary
            };

        } catch (error) {
            logger.error(`Catalog update failed: ${error.message}`, { updateId });
            this.updateStats.failedUpdates++;

            metricsCollector.recordRequest('catalog-update', null, false, Date.now() - startTime);

            throw error;
        }
    }

    /**
     * Perform catalog update for a specific provider
     */
    async updateProviderCatalog(provider, options = {}) {
        const startTime = Date.now();
        const providerName = provider.name || provider.provider_name;

        logger.debug(`Updating catalog for provider: ${providerName}`);

        try {
            // Get existing models for this provider
            const existingModels = this.modelTracker.getModelsByProvider(providerName);
            const existingModelIds = new Set(existingModels.map(m => m.id));

            // Fetch new catalog from provider
            const catalogResult = await this.modelTracker.updateProviderCatalog(provider);

            // Process catalog changes
            const changes = await this.processCatalogChanges(
                providerName,
                catalogResult.models || [],
                existingModelIds,
                options
            );

            const duration = Date.now() - startTime;

            // Record success
            this.updateStats.successfulUpdates++;
            this.updateStats.modelsAdded += changes.added;
            this.updateStats.modelsUpdated += changes.updated;
            this.updateStats.modelsRemoved += changes.removed;

            logger.info(`Provider ${providerName} catalog updated`, {
                duration,
                added: changes.added,
                updated: changes.updated,
                removed: changes.removed
            });

            return {
                provider: providerName,
                duration,
                changes,
                models: catalogResult.models || []
            };

        } catch (error) {
            logger.error(`Provider ${providerName} catalog update failed: ${error.message}`);
            this.updateStats.failedUpdates++;

            throw error;
        }
    }

    /**
     * Process catalog changes
     */
    async processCatalogChanges(providerName, newModels, existingModelIds, options) {
        let added = 0, updated = 0, removed = 0;

        // Process new/updated models
        for (const model of newModels) {
            try {
                if (existingModelIds.has(model.id)) {
                    // Update existing model
                    await this.modelTracker.updateModel(model.id, model);
                    updated++;
                    existingModelIds.delete(model.id); // Remove from existing set
                } else {
                    // Add new model
                    await this.modelTracker.addModel(model);
                    added++;
                }
            } catch (error) {
                logger.warn(`Failed to process model ${model.id}: ${error.message}`);
            }
        }

        // Mark remaining models as potentially stale
        if (options.removeStale !== false) {
            for (const modelId of existingModelIds) {
                try {
                    const model = this.modelTracker.getModel(modelId);
                    if (this.isModelStale(model)) {
                        await this.modelTracker.removeModel(modelId);
                        removed++;
                        logger.debug(`Removed stale model: ${modelId}`);
                    }
                } catch (error) {
                    logger.warn(`Failed to check stale model ${modelId}: ${error.message}`);
                }
            }
        }

        return { added, updated, removed };
    }

    /**
     * Check if a model is stale
     */
    isModelStale(model) {
        if (!model.last_verified) return true;

        const age = Date.now() - new Date(model.last_verified).getTime();
        return age > this.config.staleThreshold;
    }

    /**
     * Determine if a full update should be performed
     */
    shouldPerformFullUpdate() {
        if (!this.lastFullUpdate) return true;

        const timeSinceLastFullUpdate = Date.now() - this.lastFullUpdate.getTime();
        return timeSinceLastFullUpdate >= this.config.forceFullUpdateInterval;
    }

    /**
     * Get providers that need updating
     */
    getProvidersToUpdate(requestedProviders) {
        const allProviders = this.modelTracker.providerManager.getFilteredProviders();

        if (requestedProviders && requestedProviders.length > 0) {
            return allProviders.filter(provider => {
                const providerName = provider.name || provider.provider_name;
                return requestedProviders.includes(providerName);
            });
        }

        return allProviders;
    }

    /**
     * Queue provider update
     */
    queueProviderUpdate(provider, options) {
        this.updateQueue.push({
            provider,
            options,
            queuedAt: new Date(),
            retries: 0
        });
    }

    /**
     * Process update queue
     */
    async processUpdateQueue(updateId) {
        const results = [];
        const batches = this.createUpdateBatches();

        for (const batch of batches) {
            const batchPromises = batch.map(async (update) => {
                try {
                    const result = await this.updateProviderCatalog(update.provider, update.options);
                    return { success: true, ...result };
                } catch (error) {
                    // Handle retries
                    if (update.retries < this.config.retryAttempts) {
                        update.retries++;
                        logger.warn(`Retrying update for ${update.provider.name} (attempt ${update.retries})`);

                        // Schedule retry
                        setTimeout(() => {
                            this.queueProviderUpdate(update.provider, update.options);
                        }, this.config.retryDelay * update.retries);

                        return { success: false, retry: true, provider: update.provider.name, error: error.message };
                    }

                    return { success: false, provider: update.provider.name, error: error.message };
                }
            });

            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults.map(result => result.value || result.reason));
        }

        return results;
    }

    /**
     * Create update batches
     */
    createUpdateBatches() {
        const batches = [];
        const queue = [...this.updateQueue];
        this.updateQueue = [];

        while (queue.length > 0) {
            const batch = queue.splice(0, this.config.maxConcurrentUpdates);
            batches.push(batch);
        }

        return batches;
    }

    /**
     * Generate update summary
     */
    generateUpdateSummary(results) {
        const summary = {
            totalProviders: results.length,
            successful: 0,
            failed: 0,
            retried: 0,
            totalModelsAdded: 0,
            totalModelsUpdated: 0,
            totalModelsRemoved: 0,
            totalDuration: 0
        };

        for (const result of results) {
            if (result.success) {
                summary.successful++;
                if (result.changes) {
                    summary.totalModelsAdded += result.changes.added;
                    summary.totalModelsUpdated += result.changes.updated;
                    summary.totalModelsRemoved += result.changes.removed;
                }
                summary.totalDuration += result.duration;
            } else if (result.retry) {
                summary.retried++;
            } else {
                summary.failed++;
            }
        }

        summary.averageDuration = summary.successful > 0 ?
            summary.totalDuration / summary.successful : 0;

        return summary;
    }

    /**
     * Get update statistics
     */
    getStats() {
        return {
            ...this.updateStats,
            queueLength: this.updateQueue.length,
            activeUpdates: this.activeUpdates.size,
            lastFullUpdate: this.lastFullUpdate,
            config: this.config
        };
    }

    /**
     * Configure updater settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('CatalogUpdater configuration updated', this.config);
    }

    /**
     * Reset updater state
     */
    reset() {
        this.updateQueue = [];
        this.activeUpdates.clear();
        this.updateStats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            modelsAdded: 0,
            modelsUpdated: 0,
            modelsRemoved: 0,
            averageUpdateTime: 0
        };
        logger.info('CatalogUpdater state reset');
    }
}

module.exports = new CatalogUpdater();