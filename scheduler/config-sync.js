/**
 * Configuration Synchronizer
 * Handles automated configuration file synchronization
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { metricsCollector } = require('../utils/monitoring');

class ConfigSync {
    constructor(modelTracker) {
        this.modelTracker = modelTracker;
        this.isInitialized = false;

        // Sync configuration
        this.config = {
            syncInterval: 60 * 60 * 1000, // 1 hour
            configPaths: [
                './config',
                './providers.json',
                './security-config.json'
            ],
            backupEnabled: true,
            backupRetention: 10, // Keep 10 backups
            backupPath: './backups/config',
            validateBeforeSync: true,
            syncOnChanges: true,
            maxSyncRetries: 3,
            syncTimeout: 300000 // 5 minutes
        };

        // Sync state
        this.lastSyncTime = null;
        this.syncHistory = [];
        this.pendingChanges = new Map();
        this.configHashes = new Map();

        // Statistics
        this.stats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            filesSynced: 0,
            backupsCreated: 0,
            averageSyncTime: 0
        };

        logger.info('ConfigSync initialized');
    }

    /**
     * Initialize the config synchronizer
     */
    async initialize(modelTracker) {
        if (this.isInitialized) return;

        this.modelTracker = modelTracker || this.modelTracker;

        // Create backup directory
        if (this.config.backupEnabled) {
            await this.ensureBackupDirectory();
        }

        // Load initial config hashes
        await this.loadConfigHashes();

        // Set up file watchers if enabled
        if (this.config.syncOnChanges) {
            this.setupFileWatchers();
        }

        this.isInitialized = true;
        logger.info('ConfigSync initialized successfully');
    }

    /**
     * Perform configuration synchronization
     */
    async performSync(options = {}) {
        const startTime = Date.now();
        const syncId = `sync-${Date.now()}`;

        logger.info('Starting configuration synchronization', { syncId, options });

        try {
            // Validate configurations
            if (this.config.validateBeforeSync) {
                await this.validateConfigurations();
            }

            // Perform sync operations
            const results = await this.performSyncOperations(options);

            // Create backup if enabled
            if (this.config.backupEnabled) {
                await this.createBackup(syncId);
            }

            // Update sync state
            this.lastSyncTime = new Date();
            this.stats.totalSyncs++;
            this.stats.successfulSyncs++;

            const duration = Date.now() - startTime;
            this.stats.averageSyncTime = (this.stats.averageSyncTime + duration) / 2;

            // Record metrics
            metricsCollector.recordRequest('config-sync', null, true, duration);

            // Record sync history
            this.recordSyncHistory({
                syncId,
                timestamp: new Date(),
                success: true,
                duration,
                results,
                options
            });

            logger.info('Configuration synchronization completed', {
                syncId,
                duration,
                filesSynced: results.length
            });

            return {
                syncId,
                duration,
                results,
                backupCreated: this.config.backupEnabled
            };

        } catch (error) {
            logger.error(`Configuration sync failed: ${error.message}`, { syncId });
            this.stats.failedSyncs++;

            metricsCollector.recordRequest('config-sync', null, false, Date.now() - startTime);

            this.recordSyncHistory({
                syncId,
                timestamp: new Date(),
                success: false,
                error: error.message,
                options
            });

            throw error;
        }
    }

    /**
     * Perform sync operations
     */
    async performSyncOperations(options) {
        const results = [];

        // Sync provider configurations
        if (options.includeProviders !== false) {
            const providerResults = await this.syncProviderConfigs();
            results.push(...providerResults);
        }

        // Sync system configurations
        if (options.includeSystem !== false) {
            const systemResults = await this.syncSystemConfigs();
            results.push(...systemResults);
        }

        // Sync custom configurations
        if (options.customPaths) {
            const customResults = await this.syncCustomConfigs(options.customPaths);
            results.push(...customResults);
        }

        return results;
    }

    /**
     * Sync provider configurations
     */
    async syncProviderConfigs() {
        const results = [];
        const providers = this.modelTracker.providerManager.getFilteredProviders();

        for (const provider of providers) {
            try {
                const result = await this.syncProviderConfig(provider);
                results.push(result);
            } catch (error) {
                logger.warn(`Failed to sync provider config for ${provider.name}: ${error.message}`);
                results.push({
                    type: 'provider',
                    name: provider.name,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Sync individual provider configuration
     */
    async syncProviderConfig(provider) {
        const providerName = provider.name || provider.provider_name;
        const configPath = path.join('./config', `${providerName}.json`);

        try {
            // Check if config file exists
            const exists = await this.fileExists(configPath);

            if (!exists) {
                // Create new config file
                const configData = this.generateProviderConfig(provider);
                await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
                this.stats.filesSynced++;

                return {
                    type: 'provider',
                    name: providerName,
                    action: 'created',
                    path: configPath,
                    success: true
                };
            } else {
                // Update existing config
                const existingConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
                const updatedConfig = this.mergeProviderConfig(existingConfig, provider);

                // Check if changes are needed
                if (this.configsDiffer(existingConfig, updatedConfig)) {
                    await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2));
                    this.stats.filesSynced++;

                    return {
                        type: 'provider',
                        name: providerName,
                        action: 'updated',
                        path: configPath,
                        success: true
                    };
                } else {
                    return {
                        type: 'provider',
                        name: providerName,
                        action: 'no_change',
                        path: configPath,
                        success: true
                    };
                }
            }
        } catch (error) {
            throw new Error(`Provider config sync failed: ${error.message}`);
        }
    }

    /**
     * Sync system configurations
     */
    async syncSystemConfigs() {
        const results = [];

        for (const configPath of this.config.configPaths) {
            try {
                const result = await this.syncSystemConfig(configPath);
                results.push(result);
            } catch (error) {
                logger.warn(`Failed to sync system config ${configPath}: ${error.message}`);
                results.push({
                    type: 'system',
                    path: configPath,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Sync system configuration file
     */
    async syncSystemConfig(configPath) {
        try {
            const exists = await this.fileExists(configPath);

            if (!exists) {
                logger.debug(`System config ${configPath} does not exist, skipping`);
                return {
                    type: 'system',
                    path: configPath,
                    action: 'skipped',
                    success: true
                };
            }

            // Read and validate config
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);

            // Perform any necessary transformations
            const processedConfig = await this.processSystemConfig(config, configPath);

            // Write back if changed
            if (this.configsDiffer(config, processedConfig)) {
                await fs.writeFile(configPath, JSON.stringify(processedConfig, null, 2));
                this.stats.filesSynced++;

                return {
                    type: 'system',
                    path: configPath,
                    action: 'updated',
                    success: true
                };
            } else {
                return {
                    type: 'system',
                    path: configPath,
                    action: 'no_change',
                    success: true
                };
            }
        } catch (error) {
            throw new Error(`System config sync failed: ${error.message}`);
        }
    }

    /**
     * Sync custom configuration paths
     */
    async syncCustomConfigs(customPaths) {
        const results = [];

        for (const configPath of customPaths) {
            try {
                const result = await this.syncSystemConfig(configPath);
                results.push(result);
            } catch (error) {
                results.push({
                    type: 'custom',
                    path: configPath,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Generate provider configuration
     */
    generateProviderConfig(provider) {
        return {
            name: provider.name || provider.provider_name,
            base_url: provider.baseURL,
            api_key: provider.apiKey || null,
            priority: provider.priority || 99,
            token_multiplier: provider.tokenMultiplier || 1.0,
            rate_limit: provider.rateLimit || {},
            auth: provider.auth || {},
            metadata: provider.metadata || {},
            status: provider.status || 'active',
            last_updated: new Date().toISOString()
        };
    }

    /**
     * Merge provider configuration
     */
    mergeProviderConfig(existing, provider) {
        return {
            ...existing,
            ...this.generateProviderConfig(provider),
            // Preserve custom fields
            custom_config: existing.custom_config || {}
        };
    }

    /**
     * Process system configuration
     */
    async processSystemConfig(config, configPath) {
        // Add last_updated timestamp
        config.last_updated = new Date().toISOString();

        // Add version info if not present
        if (!config.version) {
            config.version = require('../package.json').version;
        }

        return config;
    }

    /**
     * Check if configurations differ
     */
    configsDiffer(config1, config2) {
        return JSON.stringify(config1) !== JSON.stringify(config2);
    }

    /**
     * Validate configurations
     */
    async validateConfigurations() {
        // Validate provider configurations
        const providers = this.modelTracker.providerManager.getFilteredProviders();

        for (const provider of providers) {
            try {
                // Use existing validation logic
                this.modelTracker.providerManager.validateProvider(provider);
            } catch (error) {
                logger.warn(`Provider validation failed for ${provider.name}: ${error.message}`);
            }
        }

        logger.debug('Configuration validation completed');
    }

    /**
     * Create backup of current configurations
     */
    async createBackup(syncId) {
        try {
            const backupDir = path.join(this.config.backupPath, syncId);
            await fs.mkdir(backupDir, { recursive: true });

            // Backup config files
            for (const configPath of this.config.configPaths) {
                if (await this.fileExists(configPath)) {
                    const fileName = path.basename(configPath);
                    const backupPath = path.join(backupDir, fileName);
                    await fs.copyFile(configPath, backupPath);
                }
            }

            // Backup provider configs
            const providerConfigDir = path.join(backupDir, 'providers');
            await fs.mkdir(providerConfigDir, { recursive: true });

            const providers = this.modelTracker.providerManager.getFilteredProviders();
            for (const provider of providers) {
                const providerName = provider.name || provider.provider_name;
                const configPath = path.join('./config', `${providerName}.json`);

                if (await this.fileExists(configPath)) {
                    const backupPath = path.join(providerConfigDir, `${providerName}.json`);
                    await fs.copyFile(configPath, backupPath);
                }
            }

            this.stats.backupsCreated++;

            // Clean up old backups
            await this.cleanupOldBackups();

            logger.debug(`Configuration backup created: ${syncId}`);

        } catch (error) {
            logger.warn(`Failed to create configuration backup: ${error.message}`);
        }
    }

    /**
     * Clean up old backups
     */
    async cleanupOldBackups() {
        try {
            const backupDir = this.config.backupPath;
            const entries = await fs.readdir(backupDir);
            const backups = entries
                .filter(entry => entry.startsWith('sync-'))
                .sort()
                .reverse();

            if (backups.length > this.config.backupRetention) {
                const toDelete = backups.slice(this.config.backupRetention);

                for (const backup of toDelete) {
                    const backupPath = path.join(backupDir, backup);
                    await fs.rm(backupPath, { recursive: true, force: true });
                    logger.debug(`Cleaned up old backup: ${backup}`);
                }
            }
        } catch (error) {
            logger.warn(`Failed to cleanup old backups: ${error.message}`);
        }
    }

    /**
     * Ensure backup directory exists
     */
    async ensureBackupDirectory() {
        try {
            await fs.mkdir(this.config.backupPath, { recursive: true });
        } catch (error) {
            logger.warn(`Failed to create backup directory: ${error.message}`);
        }
    }

    /**
     * Load configuration hashes for change detection
     */
    async loadConfigHashes() {
        for (const configPath of this.config.configPaths) {
            try {
                if (await this.fileExists(configPath)) {
                    const content = await fs.readFile(configPath, 'utf8');
                    const hash = this.calculateHash(content);
                    this.configHashes.set(configPath, hash);
                }
            } catch (error) {
                logger.debug(`Failed to load hash for ${configPath}: ${error.message}`);
            }
        }
    }

    /**
     * Setup file watchers for change detection
     */
    setupFileWatchers() {
        // Note: In a real implementation, you would set up fs.watchers
        // For this example, we'll skip the implementation
        logger.debug('File watchers setup skipped (not implemented)');
    }

    /**
     * Calculate simple hash of content
     */
    calculateHash(content) {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString();
    }

    /**
     * Check if file exists
     */
    async fileExists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Record sync history
     */
    recordSyncHistory(record) {
        this.syncHistory.push(record);

        // Keep only last 50 records
        if (this.syncHistory.length > 50) {
            this.syncHistory.shift();
        }
    }

    /**
     * Get sync statistics
     */
    getStats() {
        return {
            ...this.stats,
            lastSyncTime: this.lastSyncTime,
            pendingChanges: this.pendingChanges.size,
            configHashes: Object.fromEntries(this.configHashes)
        };
    }

    /**
     * Get sync history
     */
    getSyncHistory(limit = 10) {
        return this.syncHistory.slice(-limit);
    }

    /**
     * Configure sync settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('ConfigSync configuration updated', this.config);
    }

    /**
     * Reset sync state
     */
    reset() {
        this.lastSyncTime = null;
        this.syncHistory = [];
        this.pendingChanges.clear();
        this.configHashes.clear();
        this.stats = {
            totalSyncs: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            filesSynced: 0,
            backupsCreated: 0,
            averageSyncTime: 0
        };
        logger.info('ConfigSync state reset');
    }
}

module.exports = new ConfigSync();