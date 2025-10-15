/**
 * Health Checker
 * Performs automated provider health validation and status updates
 */

const logger = require('../utils/logger');
const { healthCheckManager, checkProviderHealth } = require('../utils/monitoring');

class HealthChecker {
    constructor(modelTracker) {
        this.modelTracker = modelTracker;
        this.isInitialized = false;

        // Health check configuration
        this.config = {
            checkInterval: 5 * 60 * 1000, // 5 minutes
            timeout: 30000, // 30 seconds
            maxConcurrentChecks: 5,
            retryAttempts: 2,
            unhealthyThreshold: 3, // Mark unhealthy after 3 failures
            recoveryThreshold: 2, // Mark healthy after 2 successes
            enableDetailedChecks: true,
            criticalProviders: ['openai', 'anthropic'] // Providers that are critical
        };

        // Health state
        this.providerHealth = new Map();
        this.checkHistory = new Map();
        this.activeChecks = new Set();

        // Statistics
        this.stats = {
            totalChecks: 0,
            healthyProviders: 0,
            unhealthyProviders: 0,
            averageResponseTime: 0,
            lastCheckTime: null
        };

        logger.info('HealthChecker initialized');
    }

    /**
     * Initialize the health checker
     */
    async initialize(modelTracker) {
        if (this.isInitialized) return;

        this.modelTracker = modelTracker || this.modelTracker;

        // Register provider health checks
        this.registerProviderChecks();

        this.isInitialized = true;
        logger.info('HealthChecker initialized successfully');
    }

    /**
     * Register health checks for all providers
     */
    registerProviderChecks() {
        const providers = this.modelTracker.providerManager.getFilteredProviders();

        for (const provider of providers) {
            const providerName = provider.name || provider.provider_name;
            const isCritical = this.config.criticalProviders.includes(providerName.toLowerCase());

            // Register with health check manager
            healthCheckManager.register(
                `provider-${providerName}`,
                () => this.checkProviderHealth(provider),
                {
                    timeout: this.config.timeout,
                    critical: isCritical
                }
            );

            // Initialize health state
            this.providerHealth.set(providerName, {
                status: 'unknown',
                consecutiveFailures: 0,
                consecutiveSuccesses: 0,
                lastCheck: null,
                lastSuccess: null,
                lastFailure: null,
                responseTime: 0,
                isCritical
            });
        }

        logger.info(`Registered health checks for ${providers.length} providers`);
    }

    /**
     * Perform health checks for all providers
     */
    async performHealthChecks(options = {}) {
        const startTime = Date.now();
        logger.info('Starting provider health checks');

        try {
            // Get providers to check
            const providers = options.providers ||
                this.modelTracker.providerManager.getFilteredProviders();

            // Perform checks in batches
            const results = await this.performBatchChecks(providers);

            // Update health states
            this.updateHealthStates(results);

            // Update statistics
            this.updateStats(results);

            const duration = Date.now() - startTime;
            this.stats.lastCheckTime = new Date();

            logger.info('Provider health checks completed', {
                duration,
                checked: results.length,
                healthy: results.filter(r => r.healthy).length,
                unhealthy: results.filter(r => !r.healthy).length
            });

            return {
                duration,
                results,
                summary: this.getHealthSummary()
            };

        } catch (error) {
            logger.error(`Health checks failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Perform batch health checks
     */
    async performBatchChecks(providers) {
        const results = [];
        const batches = this.createCheckBatches(providers);

        for (const batch of batches) {
            const batchPromises = batch.map(provider => this.checkProviderHealth(provider));
            const batchResults = await Promise.allSettled(batchPromises);

            for (let i = 0; i < batch.length; i++) {
                const provider = batch[i];
                const result = batchResults[i];

                if (result.status === 'fulfilled') {
                    results.push({
                        provider: provider.name || provider.provider_name,
                        healthy: true,
                        responseTime: result.value?.responseTime || 0,
                        details: result.value
                    });
                } else {
                    results.push({
                        provider: provider.name || provider.provider_name,
                        healthy: false,
                        error: result.reason?.message || 'Check failed',
                        responseTime: 0
                    });
                }
            }
        }

        return results;
    }

    /**
     * Check health of a specific provider
     */
    async checkProviderHealth(provider) {
        const providerName = provider.name || provider.provider_name;
        const startTime = Date.now();

        try {
            // Use the monitoring utility's checkProviderHealth
            const result = await checkProviderHealth(provider);
            const responseTime = Date.now() - startTime;

            // Perform additional detailed checks if enabled
            if (this.config.enableDetailedChecks) {
                await this.performDetailedChecks(provider, result);
            }

            return {
                ...result,
                responseTime
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            logger.warn(`Health check failed for ${providerName}: ${error.message}`);

            throw {
                message: error.message,
                responseTime
            };
        }
    }

    /**
     * Perform detailed health checks
     */
    async performDetailedChecks(provider, baseResult) {
        const providerName = provider.name || provider.provider_name;
        const checks = [];

        try {
            // Check API connectivity
            if (provider.baseURL) {
                checks.push(this.checkApiConnectivity(provider));
            }

            // Check model availability
            checks.push(this.checkModelAvailability(provider));

            // Check rate limits
            if (provider.rate_limit) {
                checks.push(this.checkRateLimits(provider));
            }

            // Execute additional checks
            const detailedResults = await Promise.allSettled(checks);
            const failedChecks = detailedResults.filter(r => r.status === 'rejected');

            if (failedChecks.length > 0) {
                logger.warn(`Detailed checks failed for ${providerName}: ${failedChecks.length} failures`);
            }

        } catch (error) {
            logger.debug(`Detailed checks error for ${providerName}: ${error.message}`);
        }
    }

    /**
     * Check API connectivity
     */
    async checkApiConnectivity(provider) {
        // Basic connectivity check - ping the base URL
        const response = await fetch(provider.baseURL, {
            method: 'HEAD',
            timeout: this.config.timeout
        });

        if (!response.ok) {
            throw new Error(`API connectivity check failed: ${response.status}`);
        }

        return { check: 'connectivity', status: 'ok' };
    }

    /**
     * Check model availability
     */
    async checkModelAvailability(provider) {
        // Check if provider has available models
        const models = this.modelTracker.getModelsByProvider(provider.name || provider.provider_name);

        if (models.length === 0) {
            throw new Error('No models available for provider');
        }

        // Check if models are recent
        const staleModels = models.filter(model => {
            if (!model.last_verified) return true;
            const age = Date.now() - new Date(model.last_verified).getTime();
            return age > 24 * 60 * 60 * 1000; // 24 hours
        });

        if (staleModels.length > 0) {
            logger.warn(`${staleModels.length} stale models for provider ${provider.name}`);
        }

        return {
            check: 'model_availability',
            status: 'ok',
            totalModels: models.length,
            staleModels: staleModels.length
        };
    }

    /**
     * Check rate limits
     */
    async checkRateLimits(provider) {
        // Check if rate limiter is available and not exhausted
        const rateLimiter = this.modelTracker.rateLimiter;
        if (rateLimiter) {
            const limits = rateLimiter.getProviderLimits(provider.name || provider.provider_name);
            return {
                check: 'rate_limits',
                status: 'ok',
                limits
            };
        }

        return { check: 'rate_limits', status: 'not_configured' };
    }

    /**
     * Update health states based on check results
     */
    updateHealthStates(results) {
        for (const result of results) {
            const health = this.providerHealth.get(result.provider);

            if (!health) continue;

            health.lastCheck = new Date();
            health.responseTime = result.responseTime;

            if (result.healthy) {
                health.status = 'healthy';
                health.consecutiveSuccesses++;
                health.consecutiveFailures = 0;
                health.lastSuccess = new Date();

                // Update provider status if recovered
                if (health.consecutiveSuccesses >= this.config.recoveryThreshold) {
                    this.updateProviderStatus(result.provider, 'healthy');
                }
            } else {
                health.consecutiveFailures++;
                health.consecutiveSuccesses = 0;
                health.lastFailure = new Date();

                // Update provider status if unhealthy
                if (health.consecutiveFailures >= this.config.unhealthyThreshold) {
                    health.status = 'unhealthy';
                    this.updateProviderStatus(result.provider, 'unhealthy');
                }
            }

            // Record in history
            this.recordHealthHistory(result.provider, result);
        }
    }

    /**
     * Update provider status in the model tracker
     */
    updateProviderStatus(providerName, status) {
        try {
            const provider = this.modelTracker.providerManager.getFilteredProviders({ name: providerName })[0];
            if (provider) {
                provider.status = status;
                logger.info(`Updated provider ${providerName} status to ${status}`);
            }
        } catch (error) {
            logger.warn(`Failed to update provider status for ${providerName}: ${error.message}`);
        }
    }

    /**
     * Record health check history
     */
    recordHealthHistory(providerName, result) {
        if (!this.checkHistory.has(providerName)) {
            this.checkHistory.set(providerName, []);
        }

        const history = this.checkHistory.get(providerName);
        history.push({
            timestamp: new Date(),
            healthy: result.healthy,
            responseTime: result.responseTime,
            error: result.error
        });

        // Keep only last 50 records
        if (history.length > 50) {
            history.shift();
        }
    }

    /**
     * Update health statistics
     */
    updateStats(results) {
        this.stats.totalChecks += results.length;

        const healthy = results.filter(r => r.healthy).length;
        const unhealthy = results.length - healthy;

        this.stats.healthyProviders = healthy;
        this.stats.unhealthyProviders = unhealthy;

        // Update average response time
        const totalResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0);
        if (results.length > 0) {
            this.stats.averageResponseTime = totalResponseTime / results.length;
        }
    }

    /**
     * Create batches for concurrent checking
     */
    createCheckBatches(providers) {
        const batches = [];
        for (let i = 0; i < providers.length; i += this.config.maxConcurrentChecks) {
            batches.push(providers.slice(i, i + this.config.maxConcurrentChecks));
        }
        return batches;
    }

    /**
     * Get health summary
     */
    getHealthSummary() {
        const providers = Array.from(this.providerHealth.entries());
        const healthy = providers.filter(([, health]) => health.status === 'healthy').length;
        const unhealthy = providers.filter(([, health]) => health.status === 'unhealthy').length;
        const unknown = providers.filter(([, health]) => health.status === 'unknown').length;

        return {
            totalProviders: providers.length,
            healthy,
            unhealthy,
            unknown,
            overallStatus: unhealthy > 0 ? 'degraded' : 'healthy'
        };
    }

    /**
     * Get detailed health status
     */
    getHealthStatus() {
        const status = {};

        for (const [providerName, health] of this.providerHealth) {
            const history = this.checkHistory.get(providerName) || [];
            const recentChecks = history.slice(-10); // Last 10 checks

            status[providerName] = {
                ...health,
                successRate: recentChecks.length > 0 ?
                    recentChecks.filter(c => c.healthy).length / recentChecks.length : 0,
                averageResponseTime: recentChecks.length > 0 ?
                    recentChecks.reduce((sum, c) => sum + c.responseTime, 0) / recentChecks.length : 0
            };
        }

        return {
            providers: status,
            summary: this.getHealthSummary(),
            stats: this.stats
        };
    }

    /**
     * Configure health checker settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('HealthChecker configuration updated', this.config);
    }

    /**
     * Reset health checker state
     */
    reset() {
        this.providerHealth.clear();
        this.checkHistory.clear();
        this.activeChecks.clear();
        this.stats = {
            totalChecks: 0,
            healthyProviders: 0,
            unhealthyProviders: 0,
            averageResponseTime: 0,
            lastCheckTime: null
        };

        // Re-register checks
        this.registerProviderChecks();

        logger.info('HealthChecker state reset');
    }
}

module.exports = new HealthChecker();