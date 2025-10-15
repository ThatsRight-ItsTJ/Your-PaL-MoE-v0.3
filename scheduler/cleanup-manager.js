/**
 * Cleanup Manager
 * Handles automated cleanup of stale data and system optimization
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { metricsCollector } = require('../utils/monitoring');

class CleanupManager {
    constructor(modelTracker) {
        this.modelTracker = modelTracker;
        this.isInitialized = false;

        // Cleanup configuration
        this.config = {
            cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
            staleModelThreshold: 30 * 24 * 60 * 60 * 1000, // 30 days
            staleProviderThreshold: 7 * 24 * 60 * 60 * 1000, // 7 days
            logRetentionDays: 30,
            tempFileMaxAge: 24 * 60 * 60 * 1000, // 24 hours
            cacheMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            maxCleanupRetries: 3,
            cleanupTimeout: 600000, // 10 minutes
            dryRun: false, // Set to true for testing
            aggressiveCleanup: false
        };

        // Cleanup state
        this.lastCleanupTime = null;
        this.cleanupHistory = [];
        this.cleanupQueue = [];

        // Statistics
        this.stats = {
            totalCleanups: 0,
            successfulCleanups: 0,
            failedCleanups: 0,
            modelsRemoved: 0,
            providersRemoved: 0,
            filesRemoved: 0,
            cacheCleared: 0,
            spaceReclaimed: 0,
            averageCleanupTime: 0
        };

        logger.info('CleanupManager initialized');
    }

    /**
     * Initialize the cleanup manager
     */
    async initialize(modelTracker) {
        if (this.isInitialized) return;

        this.modelTracker = modelTracker || this.modelTracker;
        this.isInitialized = true;

        logger.info('CleanupManager initialized successfully');
    }

    /**
     * Perform cleanup operations
     */
    async performCleanup(options = {}) {
        const startTime = Date.now();
        const cleanupId = `cleanup-${Date.now()}`;

        logger.info('Starting cleanup operations', { cleanupId, options });

        try {
            const results = {
                models: { removed: 0, errors: 0 },
                providers: { removed: 0, errors: 0 },
                files: { removed: 0, errors: 0 },
                cache: { cleared: 0, errors: 0 },
                logs: { cleaned: 0, errors: 0 }
            };

            // Clean stale models
            if (options.includeModels !== false) {
                const modelResults = await this.cleanupStaleModels(options);
                results.models = modelResults;
            }

            // Clean stale providers
            if (options.includeProviders !== false) {
                const providerResults = await this.cleanupStaleProviders(options);
                results.providers = providerResults;
            }

            // Clean temporary files
            if (options.includeFiles !== false) {
                const fileResults = await this.cleanupTempFiles(options);
                results.files = fileResults;
            }

            // Clean cache
            if (options.includeCache !== false) {
                const cacheResults = await this.cleanupCache(options);
                results.cache = cacheResults;
            }

            // Clean old logs
            if (options.includeLogs !== false) {
                const logResults = await this.cleanupOldLogs(options);
                results.logs = logResults;
            }

            // Update statistics
            this.updateStats(results);
            this.lastCleanupTime = new Date();
            this.stats.totalCleanups++;
            this.stats.successfulCleanups++;

            const duration = Date.now() - startTime;
            this.stats.averageCleanupTime = (this.stats.averageCleanupTime + duration) / 2;

            // Record metrics
            metricsCollector.recordRequest('cleanup', null, true, duration);

            // Record cleanup history
            this.recordCleanupHistory({
                cleanupId,
                timestamp: new Date(),
                success: true,
                duration,
                results,
                options
            });

            logger.info('Cleanup operations completed', {
                cleanupId,
                duration,
                results
            });

            return {
                cleanupId,
                duration,
                results,
                stats: this.getCleanupSummary(results)
            };

        } catch (error) {
            logger.error(`Cleanup operations failed: ${error.message}`, { cleanupId });
            this.stats.failedCleanups++;

            metricsCollector.recordRequest('cleanup', null, false, Date.now() - startTime);

            this.recordCleanupHistory({
                cleanupId,
                timestamp: new Date(),
                success: false,
                error: error.message,
                options
            });

            throw error;
        }
    }

    /**
     * Clean up stale models
     */
    async cleanupStaleModels(options) {
        let removed = 0;
        let errors = 0;

        try {
            const allModels = this.modelTracker.getAllModels();
            const staleThreshold = options.staleThreshold || this.config.staleModelThreshold;

            for (const model of allModels) {
                try {
                    if (this.isModelStale(model, staleThreshold)) {
                        if (!options.dryRun && !this.config.dryRun) {
                            await this.modelTracker.removeModel(model.id);
                            logger.debug(`Removed stale model: ${model.id}`);
                        } else {
                            logger.debug(`Would remove stale model: ${model.id} (dry run)`);
                        }
                        removed++;
                    }
                } catch (error) {
                    logger.warn(`Failed to cleanup model ${model.id}: ${error.message}`);
                    errors++;
                }
            }

            this.stats.modelsRemoved += removed;

        } catch (error) {
            logger.error(`Model cleanup failed: ${error.message}`);
            errors++;
        }

        return { removed, errors };
    }

    /**
     * Check if a model is stale
     */
    isModelStale(model, threshold) {
        if (!model.last_verified && !model.updated) return true;

        const lastActivity = new Date(model.last_verified || model.updated || model.created);
        const age = Date.now() - lastActivity.getTime();

        return age > threshold;
    }

    /**
     * Clean up stale providers
     */
    async cleanupStaleProviders(options) {
        let removed = 0;
        let errors = 0;

        try {
            const providers = this.modelTracker.providerManager.getFilteredProviders();
            const staleThreshold = options.staleThreshold || this.config.staleProviderThreshold;

            for (const provider of providers) {
                try {
                    if (this.isProviderStale(provider, staleThreshold)) {
                        if (!options.dryRun && !this.config.dryRun) {
                            // Mark provider as inactive rather than removing
                            provider.status = 'inactive';
                            logger.debug(`Marked stale provider as inactive: ${provider.name}`);
                        } else {
                            logger.debug(`Would mark stale provider as inactive: ${provider.name} (dry run)`);
                        }
                        removed++;
                    }
                } catch (error) {
                    logger.warn(`Failed to cleanup provider ${provider.name}: ${error.message}`);
                    errors++;
                }
            }

            this.stats.providersRemoved += removed;

        } catch (error) {
            logger.error(`Provider cleanup failed: ${error.message}`);
            errors++;
        }

        return { removed, errors };
    }

    /**
     * Check if a provider is stale
     */
    isProviderStale(provider, threshold) {
        // Check if provider has any recent model updates
        const models = this.modelTracker.getModelsByProvider(provider.name || provider.provider_name);
        const hasRecentModels = models.some(model => {
            const lastActivity = new Date(model.last_verified || model.updated || model.created);
            const age = Date.now() - lastActivity.getTime();
            return age <= threshold;
        });

        return !hasRecentModels;
    }

    /**
     * Clean up temporary files
     */
    async cleanupTempFiles(options) {
        let removed = 0;
        let errors = 0;

        const tempDirs = [
            './temp',
            './tmp',
            '/tmp/pal-moe-cache',
            './cache/temp'
        ];

        const maxAge = options.maxAge || this.config.tempFileMaxAge;

        for (const tempDir of tempDirs) {
            try {
                if (await this.directoryExists(tempDir)) {
                    const files = await this.getFilesOlderThan(tempDir, maxAge);

                    for (const file of files) {
                        try {
                            if (!options.dryRun && !this.config.dryRun) {
                                await fs.unlink(file);
                                logger.debug(`Removed temp file: ${file}`);
                            } else {
                                logger.debug(`Would remove temp file: ${file} (dry run)`);
                            }
                            removed++;
                        } catch (error) {
                            logger.warn(`Failed to remove temp file ${file}: ${error.message}`);
                            errors++;
                        }
                    }
                }
            } catch (error) {
                logger.debug(`Temp directory ${tempDir} not accessible: ${error.message}`);
            }
        }

        this.stats.filesRemoved += removed;

        return { removed, errors };
    }

    /**
     * Clean up cache
     */
    async cleanupCache(options) {
        let cleared = 0;
        let errors = 0;

        try {
            // Clear router cache
            if (this.modelTracker.cacheManager) {
                const cacheStats = await this.modelTracker.cacheManager.clearExpired(options.maxAge || this.config.cacheMaxAge);
                cleared += cacheStats.cleared || 0;
            }

            // Clear other cache directories
            const cacheDirs = [
                './cache',
                './.cache'
            ];

            const maxAge = options.maxAge || this.config.cacheMaxAge;

            for (const cacheDir of cacheDirs) {
                try {
                    if (await this.directoryExists(cacheDir)) {
                        const files = await this.getFilesOlderThan(cacheDir, maxAge);

                        for (const file of files) {
                            try {
                                if (!options.dryRun && !this.config.dryRun) {
                                    await fs.unlink(file);
                                    logger.debug(`Removed cache file: ${file}`);
                                } else {
                                    logger.debug(`Would remove cache file: ${file} (dry run)`);
                                }
                                cleared++;
                            } catch (error) {
                                logger.warn(`Failed to remove cache file ${file}: ${error.message}`);
                                errors++;
                            }
                        }
                    }
                } catch (error) {
                    logger.debug(`Cache directory ${cacheDir} not accessible: ${error.message}`);
                }
            }

            this.stats.cacheCleared += cleared;

        } catch (error) {
            logger.error(`Cache cleanup failed: ${error.message}`);
            errors++;
        }

        return { cleared, errors };
    }

    /**
     * Clean up old log files
     */
    async cleanupOldLogs(options) {
        let cleaned = 0;
        let errors = 0;

        const logDirs = [
            './logs',
            './utils/logs'
        ];

        const retentionDays = options.retentionDays || this.config.logRetentionDays;
        const maxAge = retentionDays * 24 * 60 * 60 * 1000;

        for (const logDir of logDirs) {
            try {
                if (await this.directoryExists(logDir)) {
                    const files = await this.getFilesOlderThan(logDir, maxAge);

                    for (const file of files) {
                        try {
                            if (!options.dryRun && !this.config.dryRun) {
                                await fs.unlink(file);
                                logger.debug(`Removed old log file: ${file}`);
                            } else {
                                logger.debug(`Would remove old log file: ${file} (dry run)`);
                            }
                            cleaned++;
                        } catch (error) {
                            logger.warn(`Failed to remove log file ${file}: ${error.message}`);
                            errors++;
                        }
                    }
                }
            } catch (error) {
                logger.debug(`Log directory ${logDir} not accessible: ${error.message}`);
            }
        }

        return { cleaned, errors };
    }

    /**
     * Get files older than specified age
     */
    async getFilesOlderThan(dirPath, maxAge) {
        const files = [];
        const now = Date.now();

        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isFile()) {
                    try {
                        const stats = await fs.stat(fullPath);
                        const age = now - stats.mtime.getTime();

                        if (age > maxAge) {
                            files.push(fullPath);
                        }
                    } catch (error) {
                        // Skip files we can't stat
                    }
                } else if (entry.isDirectory() && this.config.aggressiveCleanup) {
                    // Recursively check subdirectories in aggressive mode
                    const subFiles = await this.getFilesOlderThan(fullPath, maxAge);
                    files.push(...subFiles);
                }
            }
        } catch (error) {
            // Directory not accessible
        }

        return files;
    }

    /**
     * Check if directory exists
     */
    async directoryExists(dirPath) {
        try {
            const stats = await fs.stat(dirPath);
            return stats.isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Update cleanup statistics
     */
    updateStats(results) {
        this.stats.modelsRemoved += results.models.removed;
        this.stats.providersRemoved += results.providers.removed;
        this.stats.filesRemoved += results.files.removed;
        this.stats.cacheCleared += results.cache.cleared;
    }

    /**
     * Get cleanup summary
     */
    getCleanupSummary(results) {
        const totalRemoved = results.models.removed + results.providers.removed +
                           results.files.removed + results.cache.cleared;

        return {
            totalItemsRemoved: totalRemoved,
            modelsRemoved: results.models.removed,
            providersRemoved: results.providers.removed,
            filesRemoved: results.files.removed,
            cacheCleared: results.cache.cleared,
            errors: results.models.errors + results.providers.errors +
                   results.files.errors + results.cache.errors
        };
    }

    /**
     * Record cleanup history
     */
    recordCleanupHistory(record) {
        this.cleanupHistory.push(record);

        // Keep only last 30 records
        if (this.cleanupHistory.length > 30) {
            this.cleanupHistory.shift();
        }
    }

    /**
     * Get cleanup statistics
     */
    getStats() {
        return {
            ...this.stats,
            lastCleanupTime: this.lastCleanupTime,
            cleanupHistory: this.cleanupHistory.slice(-10) // Last 10 cleanups
        };
    }

    /**
     * Get cleanup recommendations
     */
    getCleanupRecommendations() {
        const recommendations = [];

        // Check for stale models
        const allModels = this.modelTracker.getAllModels();
        const staleModels = allModels.filter(model => this.isModelStale(model, this.config.staleModelThreshold));

        if (staleModels.length > 0) {
            recommendations.push({
                type: 'models',
                message: `${staleModels.length} stale models found`,
                action: 'cleanupStaleModels'
            });
        }

        // Check for stale providers
        const providers = this.modelTracker.providerManager.getFilteredProviders();
        const staleProviders = providers.filter(provider => this.isProviderStale(provider, this.config.staleProviderThreshold));

        if (staleProviders.length > 0) {
            recommendations.push({
                type: 'providers',
                message: `${staleProviders.length} stale providers found`,
                action: 'cleanupStaleProviders'
            });
        }

        return recommendations;
    }

    /**
     * Configure cleanup settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('CleanupManager configuration updated', this.config);
    }

    /**
     * Reset cleanup state
     */
    reset() {
        this.lastCleanupTime = null;
        this.cleanupHistory = [];
        this.cleanupQueue = [];
        this.stats = {
            totalCleanups: 0,
            successfulCleanups: 0,
            failedCleanups: 0,
            modelsRemoved: 0,
            providersRemoved: 0,
            filesRemoved: 0,
            cacheCleared: 0,
            spaceReclaimed: 0,
            averageCleanupTime: 0
        };
        logger.info('CleanupManager state reset');
    }
}

module.exports = new CleanupManager();