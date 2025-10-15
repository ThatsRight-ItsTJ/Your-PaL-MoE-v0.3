/**
 * Health Monitor
 * Monitors availability status of models and providers
 * Tracks health metrics and provides availability insights
 */

const logger = require('../utils/logger');

class HealthMonitor {
    constructor(modelTracker, rateLimiter) {
        this.modelTracker = modelTracker;
        this.rateLimiter = rateLimiter;

        // Health tracking storage
        this.providerHealth = new Map(); // providerName -> healthStatus
        this.modelHealth = new Map(); // modelId -> healthStatus
        this.healthHistory = new Map(); // entityId -> healthRecords[]

        // Monitoring configuration
        this.config = {
            healthCheckInterval: 60 * 1000, // 1 minute
            unhealthyThreshold: 3, // consecutive failures
            recoveryThreshold: 2, // consecutive successes for recovery
            maxHistorySize: 100,
            enablePredictiveHealth: true,
            healthTimeout: 30000, // 30 seconds
            enableDetailedMetrics: true
        };

        // Statistics
        this.stats = {
            totalHealthChecks: 0,
            healthyProviders: 0,
            unhealthyProviders: 0,
            healthyModels: 0,
            unhealthyModels: 0,
            averageResponseTime: 0,
            uptimePercentage: 100
        };

        // Active monitoring
        this.monitoringActive = false;
        this.healthCheckTimer = null;

        logger.info('HealthMonitor initialized');
    }

    /**
     * Start health monitoring
     */
    async startMonitoring() {
        if (this.monitoringActive) {
            logger.warn('Health monitoring is already active');
            return;
        }

        try {
            logger.info('Starting health monitoring');

            // Initialize health status for all providers and models
            await this.initializeHealthStatus();

            // Start periodic health checks
            this.healthCheckTimer = setInterval(() => {
                this.performHealthChecks();
            }, this.config.healthCheckInterval);

            this.monitoringActive = true;
            logger.info('Health monitoring started successfully');

        } catch (error) {
            logger.error(`Failed to start health monitoring: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop health monitoring
     */
    async stopMonitoring() {
        if (!this.monitoringActive) {
            logger.warn('Health monitoring is not active');
            return;
        }

        logger.info('Stopping health monitoring');

        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        this.monitoringActive = false;
        logger.info('Health monitoring stopped');
    }

    /**
     * Initialize health status for all entities
     */
    async initializeHealthStatus() {
        const providers = this.modelTracker.providerManager.getFilteredProviders();
        const models = this.modelTracker.getAllModels();

        // Initialize provider health
        for (const provider of providers) {
            const providerName = provider.name || provider.provider_name;
            this.initializeProviderHealth(providerName);
        }

        // Initialize model health
        for (const model of models) {
            this.initializeModelHealth(model.id, model.provider);
        }

        logger.info(`Initialized health monitoring for ${providers.length} providers and ${models.length} models`);
    }

    /**
     * Initialize health status for a provider
     */
    initializeProviderHealth(providerName) {
        const healthStatus = {
            entityId: providerName,
            entityType: 'provider',
            status: 'unknown',
            lastChecked: null,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            responseTime: null,
            lastError: null,
            uptime: 100,
            checksPerformed: 0,
            lastSuccessfulCheck: null,
            predictedHealth: null
        };

        this.providerHealth.set(providerName, healthStatus);
        this.initializeHealthHistory(providerName);
    }

    /**
     * Initialize health status for a model
     */
    initializeModelHealth(modelId, providerName) {
        const healthStatus = {
            entityId: modelId,
            entityType: 'model',
            provider: providerName,
            status: 'unknown',
            lastChecked: null,
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            responseTime: null,
            lastError: null,
            availability: 100,
            checksPerformed: 0,
            lastSuccessfulCheck: null,
            predictedHealth: null
        };

        this.modelHealth.set(modelId, healthStatus);
        this.initializeHealthHistory(modelId);
    }

    /**
     * Initialize health history for an entity
     */
    initializeHealthHistory(entityId) {
        this.healthHistory.set(entityId, []);
    }

    /**
     * Perform periodic health checks
     */
    async performHealthChecks() {
        if (!this.monitoringActive) return;

        try {
            const providers = Array.from(this.providerHealth.keys());
            const models = Array.from(this.modelHealth.keys());

            // Check providers (limit concurrent checks)
            const providerBatches = this.chunkArray(providers, 3);
            for (const batch of providerBatches) {
                await Promise.allSettled(
                    batch.map(provider => this.checkProviderHealth(provider))
                );
            }

            // Check models (limit concurrent checks)
            const modelBatches = this.chunkArray(models, 5);
            for (const batch of modelBatches) {
                await Promise.allSettled(
                    batch.map(modelId => this.checkModelHealth(modelId))
                );
            }

            // Update statistics
            this.updateHealthStatistics();

        } catch (error) {
            logger.error(`Health check cycle failed: ${error.message}`);
        }
    }

    /**
     * Check health of a provider
     */
    async checkProviderHealth(providerName) {
        const startTime = Date.now();
        const healthStatus = this.providerHealth.get(providerName);

        if (!healthStatus) return;

        try {
            // Perform lightweight health check (e.g., API ping or model list)
            const isHealthy = await this.performProviderHealthCheck(providerName);
            const responseTime = Date.now() - startTime;

            healthStatus.lastChecked = new Date();
            healthStatus.responseTime = responseTime;
            healthStatus.checksPerformed++;

            if (isHealthy) {
                healthStatus.status = 'healthy';
                healthStatus.consecutiveFailures = 0;
                healthStatus.consecutiveSuccesses++;
                healthStatus.lastSuccessfulCheck = new Date();
                healthStatus.lastError = null;

                // Check for recovery
                if (healthStatus.consecutiveSuccesses >= this.config.recoveryThreshold &&
                    healthStatus.status !== 'healthy') {
                    logger.info(`Provider ${providerName} recovered from unhealthy state`);
                }
            } else {
                healthStatus.status = 'unhealthy';
                healthStatus.consecutiveFailures++;
                healthStatus.consecutiveSuccesses = 0;
                healthStatus.lastError = 'Health check failed';

                // Check for unhealthy threshold
                if (healthStatus.consecutiveFailures >= this.config.unhealthyThreshold) {
                    logger.warn(`Provider ${providerName} marked as unhealthy (${healthStatus.consecutiveFailures} consecutive failures)`);
                }
            }

            // Record health check result
            this.recordHealthCheck(providerName, {
                timestamp: new Date(),
                status: healthStatus.status,
                responseTime,
                error: healthStatus.lastError
            });

            this.stats.totalHealthChecks++;

        } catch (error) {
            logger.error(`Provider health check failed for ${providerName}: ${error.message}`);

            healthStatus.status = 'error';
            healthStatus.lastChecked = new Date();
            healthStatus.consecutiveFailures++;
            healthStatus.consecutiveSuccesses = 0;
            healthStatus.lastError = error.message;
            healthStatus.checksPerformed++;

            this.recordHealthCheck(providerName, {
                timestamp: new Date(),
                status: 'error',
                responseTime: Date.now() - startTime,
                error: error.message
            });
        }
    }

    /**
     * Perform actual provider health check
     */
    async performProviderHealthCheck(providerName) {
        // This is a mock implementation
        // In real implementation, this would make a lightweight API call

        const rateLimitStatus = await this.rateLimiter.canMakeRequest(providerName, 0);
        if (!rateLimitStatus.allowed) {
            return false; // Consider rate limited as unhealthy
        }

        // Simulate API health check
        const providers = this.modelTracker.providerManager.getFilteredProviders({ name: providerName });
        if (providers.length === 0) {
            return false;
        }

        // Mock health check - in real implementation, ping the provider's health endpoint
        const isHealthy = Math.random() > 0.1; // 90% success rate for demo

        // Record the request
        await this.rateLimiter.recordRequest(providerName, 0, isHealthy);

        return isHealthy;
    }

    /**
     * Check health of a model
     */
    async checkModelHealth(modelId) {
        const startTime = Date.now();
        const healthStatus = this.modelHealth.get(modelId);

        if (!healthStatus) return;

        try {
            // Check if model is still available in catalog
            const model = this.modelTracker.modelCatalog.get(modelId);
            const isAvailable = !!model;

            healthStatus.lastChecked = new Date();
            healthStatus.checksPerformed++;

            if (isAvailable) {
                healthStatus.status = 'available';
                healthStatus.consecutiveFailures = 0;
                healthStatus.consecutiveSuccesses++;
                healthStatus.lastError = null;
            } else {
                healthStatus.status = 'unavailable';
                healthStatus.consecutiveFailures++;
                healthStatus.consecutiveSuccesses = 0;
                healthStatus.lastError = 'Model not found in catalog';
            }

            // Record health check result
            this.recordHealthCheck(modelId, {
                timestamp: new Date(),
                status: healthStatus.status,
                responseTime: Date.now() - startTime,
                available: isAvailable
            });

        } catch (error) {
            logger.error(`Model health check failed for ${modelId}: ${error.message}`);

            healthStatus.status = 'error';
            healthStatus.lastChecked = new Date();
            healthStatus.consecutiveFailures++;
            healthStatus.consecutiveSuccesses = 0;
            healthStatus.lastError = error.message;
            healthStatus.checksPerformed++;
        }
    }

    /**
     * Record health check result in history
     */
    recordHealthCheck(entityId, result) {
        const history = this.healthHistory.get(entityId);
        if (history) {
            history.push(result);

            // Maintain history size
            if (history.length > this.config.maxHistorySize) {
                history.shift();
            }
        }
    }

    /**
     * Update overall health statistics
     */
    updateHealthStatistics() {
        const providers = Array.from(this.providerHealth.values());
        const models = Array.from(this.modelHealth.values());

        const healthyProviders = providers.filter(p => p.status === 'healthy').length;
        const unhealthyProviders = providers.filter(p => p.status === 'unhealthy' || p.status === 'error').length;

        const healthyModels = models.filter(m => m.status === 'available').length;
        const unhealthyModels = models.filter(m => m.status === 'unavailable' || m.status === 'error').length;

        this.stats.healthyProviders = healthyProviders;
        this.stats.unhealthyProviders = unhealthyProviders;
        this.stats.healthyModels = healthyModels;
        this.stats.unhealthyModels = unhealthyModels;

        // Calculate uptime percentage
        const totalEntities = providers.length + models.length;
        const healthyEntities = healthyProviders + healthyModels;
        this.stats.uptimePercentage = totalEntities > 0 ? (healthyEntities / totalEntities) * 100 : 100;
    }

    /**
     * Get health status for a provider
     */
    getProviderHealth(providerName) {
        return this.providerHealth.get(providerName);
    }

    /**
     * Get health status for a model
     */
    getModelHealth(modelId) {
        return this.modelHealth.get(modelId);
    }

    /**
     * Get health summary
     */
    getHealthSummary() {
        const providers = Array.from(this.providerHealth.values());
        const models = Array.from(this.modelHealth.values());

        const providerSummary = {
            total: providers.length,
            healthy: providers.filter(p => p.status === 'healthy').length,
            unhealthy: providers.filter(p => p.status === 'unhealthy').length,
            error: providers.filter(p => p.status === 'error').length,
            unknown: providers.filter(p => p.status === 'unknown').length
        };

        const modelSummary = {
            total: models.length,
            available: models.filter(m => m.status === 'available').length,
            unavailable: models.filter(m => m.status === 'unavailable').length,
            error: models.filter(m => m.status === 'error').length,
            unknown: models.filter(m => m.status === 'unknown').length
        };

        return {
            providers: providerSummary,
            models: modelSummary,
            overall: {
                totalEntities: providerSummary.total + modelSummary.total,
                healthyEntities: providerSummary.healthy + modelSummary.available,
                uptimePercentage: this.stats.uptimePercentage
            },
            monitoring: {
                active: this.monitoringActive,
                lastUpdate: new Date().toISOString()
            }
        };
    }

    /**
     * Get health history for an entity
     */
    getHealthHistory(entityId, limit = 20) {
        const history = this.healthHistory.get(entityId) || [];
        return history.slice(-limit);
    }

    /**
     * Get detailed health metrics
     */
    getHealthMetrics(timeRange = 3600000) { // 1 hour default
        const cutoff = Date.now() - timeRange;
        const metrics = {
            providers: {},
            models: {},
            summary: {
                period: `${timeRange / 1000 / 60} minutes`,
                totalChecks: 0,
                averageResponseTime: 0,
                failureRate: 0
            }
        };

        // Collect provider metrics
        for (const [providerName, history] of this.healthHistory) {
            if (this.providerHealth.has(providerName)) {
                const recentHistory = history.filter(h => h.timestamp.getTime() > cutoff);
                if (recentHistory.length > 0) {
                    metrics.providers[providerName] = this.calculateEntityMetrics(recentHistory);
                    metrics.summary.totalChecks += recentHistory.length;
                }
            }
        }

        // Collect model metrics
        for (const [modelId, history] of this.healthHistory) {
            if (this.modelHealth.has(modelId)) {
                const recentHistory = history.filter(h => h.timestamp.getTime() > cutoff);
                if (recentHistory.length > 0) {
                    metrics.models[modelId] = this.calculateEntityMetrics(recentHistory);
                    metrics.summary.totalChecks += recentHistory.length;
                }
            }
        }

        // Calculate summary metrics
        const allChecks = [];
        Object.values(metrics.providers).forEach(p => allChecks.push(...p.checks));
        Object.values(metrics.models).forEach(m => allChecks.push(...m.checks));

        if (allChecks.length > 0) {
            const responseTimes = allChecks.map(c => c.responseTime).filter(t => t != null);
            metrics.summary.averageResponseTime = responseTimes.length > 0 ?
                responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

            const failures = allChecks.filter(c => c.status === 'error' || c.status === 'unhealthy' || c.status === 'unavailable').length;
            metrics.summary.failureRate = (failures / allChecks.length) * 100;
        }

        return metrics;
    }

    /**
     * Calculate metrics for an entity
     */
    calculateEntityMetrics(history) {
        const checks = history.map(h => ({
            timestamp: h.timestamp,
            status: h.status,
            responseTime: h.responseTime,
            error: h.error
        }));

        const successful = checks.filter(c => c.status === 'healthy' || c.status === 'available').length;
        const failed = checks.filter(c => c.status === 'error' || c.status === 'unhealthy' || c.status === 'unavailable').length;

        const responseTimes = checks.map(c => c.responseTime).filter(t => t != null);
        const avgResponseTime = responseTimes.length > 0 ?
            responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : null;

        return {
            checks,
            totalChecks: checks.length,
            successRate: checks.length > 0 ? (successful / checks.length) * 100 : 0,
            failureRate: checks.length > 0 ? (failed / checks.length) * 100 : 0,
            averageResponseTime: avgResponseTime,
            lastStatus: checks.length > 0 ? checks[checks.length - 1].status : null
        };
    }

    /**
     * Get health monitor statistics
     */
    getStats() {
        return {
            ...this.stats,
            monitoringActive: this.monitoringActive,
            providersMonitored: this.providerHealth.size,
            modelsMonitored: this.modelHealth.size,
            config: this.config
        };
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
     * Configure health monitor settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('HealthMonitor configuration updated', this.config);
    }

    /**
     * Reset health monitor state
     */
    reset() {
        this.stopMonitoring();
        this.providerHealth.clear();
        this.modelHealth.clear();
        this.healthHistory.clear();
        this.stats = {
            totalHealthChecks: 0,
            healthyProviders: 0,
            unhealthyProviders: 0,
            healthyModels: 0,
            unhealthyModels: 0,
            averageResponseTime: 0,
            uptimePercentage: 100
        };
        logger.info('HealthMonitor state reset');
    }
}

module.exports = HealthMonitor;