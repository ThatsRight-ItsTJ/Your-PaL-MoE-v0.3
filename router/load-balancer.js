/**
 * Load Balancer for Intelligent Router
 * Manages provider load balancing and request distribution
 * Ensures optimal resource utilization across providers
 */

const logger = require('../utils/logger');

class LoadBalancer {
    constructor(providerManager) {
        this.providerManager = providerManager;

        // Load tracking
        this.providerLoad = new Map(); // provider -> load metrics
        this.requestQueue = new Map(); // provider -> queued requests

        // Balancing strategies
        this.strategies = {
            ROUND_ROBIN: 'round_robin',
            LEAST_LOAD: 'least_load',
            WEIGHTED: 'weighted',
            RANDOM: 'random'
        };

        this.currentStrategy = this.strategies.LEAST_LOAD;

        // Configuration
        this.config = {
            maxConcurrentRequests: 10,
            loadThreshold: 0.8, // 80% capacity
            queueTimeout: 30000, // 30 seconds
            healthCheckInterval: 60000, // 1 minute
            balancingStrategy: this.strategies.LEAST_LOAD
        };

        // Statistics
        this.stats = {
            totalRequests: 0,
            balancedRequests: 0,
            queuedRequests: 0,
            rejectedRequests: 0,
            providerStats: new Map()
        };

        // Round-robin state
        this.roundRobinIndex = 0;

        // Start health monitoring
        this.startHealthMonitoring();

        logger.info('LoadBalancer initialized', { strategy: this.currentStrategy });
    }

    /**
     * Balance request across available providers
     */
    async balanceRequest(request, candidateProviders) {
        try {
            this.stats.totalRequests++;

            // Filter healthy providers
            const healthyProviders = await this.getHealthyProviders(candidateProviders);

            if (healthyProviders.length === 0) {
                this.stats.rejectedRequests++;
                throw new Error('No healthy providers available');
            }

            // Apply balancing strategy
            const selectedProvider = await this.applyBalancingStrategy(request, healthyProviders);

            if (!selectedProvider) {
                // Queue request if all providers are at capacity
                return await this.queueRequest(request, healthyProviders);
            }

            // Update load metrics
            await this.updateProviderLoad(selectedProvider, 1);

            this.stats.balancedRequests++;
            this.updateProviderStats(selectedProvider, 'requests', 1);

            return {
                provider: selectedProvider,
                queued: false,
                estimatedWait: 0
            };

        } catch (error) {
            logger.error('Load balancing failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Apply the configured balancing strategy
     */
    async applyBalancingStrategy(request, providers) {
        switch (this.currentStrategy) {
            case this.strategies.LEAST_LOAD:
                return this.selectLeastLoaded(providers);
            case this.strategies.ROUND_ROBIN:
                return this.selectRoundRobin(providers);
            case this.strategies.WEIGHTED:
                return this.selectWeighted(providers);
            case this.strategies.RANDOM:
                return this.selectRandom(providers);
            default:
                return this.selectLeastLoaded(providers);
        }
    }

    /**
     * Select least loaded provider
     */
    selectLeastLoaded(providers) {
        let bestProvider = null;
        let lowestLoad = Infinity;

        for (const provider of providers) {
            const load = this.getProviderLoad(provider);
            if (load < lowestLoad && load < this.config.loadThreshold) {
                lowestLoad = load;
                bestProvider = provider;
            }
        }

        return bestProvider;
    }

    /**
     * Select provider using round-robin
     */
    selectRoundRobin(providers) {
        if (providers.length === 0) return null;

        const availableProviders = providers.filter(p => this.getProviderLoad(p) < this.config.loadThreshold);

        if (availableProviders.length === 0) return null;

        const selected = availableProviders[this.roundRobinIndex % availableProviders.length];
        this.roundRobinIndex++;

        return selected;
    }

    /**
     * Select provider using weighted distribution
     */
    selectWeighted(providers) {
        const weights = providers.map(provider => {
            const load = this.getProviderLoad(provider);
            // Higher weight for less loaded providers
            return Math.max(0.1, 1 - load);
        });

        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let random = Math.random() * totalWeight;

        for (let i = 0; i < providers.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return providers[i];
            }
        }

        return providers[0];
    }

    /**
     * Select random provider
     */
    selectRandom(providers) {
        const availableProviders = providers.filter(p => this.getProviderLoad(p) < this.config.loadThreshold);

        if (availableProviders.length === 0) return null;

        const randomIndex = Math.floor(Math.random() * availableProviders.length);
        return availableProviders[randomIndex];
    }

    /**
     * Queue request when all providers are at capacity
     */
    async queueRequest(request, providers) {
        // Find provider with shortest queue
        let bestProvider = null;
        let shortestQueue = Infinity;

        for (const provider of providers) {
            const queueLength = this.getQueueLength(provider);
            if (queueLength < shortestQueue) {
                shortestQueue = queueLength;
                bestProvider = provider;
            }
        }

        if (!bestProvider) {
            throw new Error('Unable to queue request - all providers at capacity');
        }

        // Add to queue
        const queue = this.requestQueue.get(bestProvider) || [];
        const queueItem = {
            request,
            timestamp: Date.now(),
            id: this.generateQueueId()
        };

        queue.push(queueItem);
        this.requestQueue.set(bestProvider, queue);

        this.stats.queuedRequests++;

        // Estimate wait time
        const estimatedWait = this.estimateWaitTime(bestProvider);

        logger.debug('Request queued', { provider: bestProvider, queueLength: queue.length });

        return {
            provider: bestProvider,
            queued: true,
            estimatedWait,
            queueId: queueItem.id
        };
    }

    /**
     * Process queued requests for a provider
     */
    async processQueue(provider) {
        const queue = this.requestQueue.get(provider) || [];

        if (queue.length === 0) return;

        const currentLoad = this.getProviderLoad(provider);

        // Process requests while under load threshold
        while (queue.length > 0 && currentLoad < this.config.loadThreshold) {
            const queueItem = queue.shift();

            // Check timeout
            if (Date.now() - queueItem.timestamp > this.config.queueTimeout) {
                logger.warn('Queued request timed out', { queueId: queueItem.id });
                continue;
            }

            try {
                // Process the queued request
                await this.updateProviderLoad(provider, 1);
                this.stats.balancedRequests++;

                // Here you would typically emit an event or callback to process the request
                logger.debug('Processed queued request', { queueId: queueItem.id });

            } catch (error) {
                logger.error('Failed to process queued request', { error: error.message });
            }
        }

        this.requestQueue.set(provider, queue);
    }

    /**
     * Get current load for a provider
     */
    getProviderLoad(providerName) {
        const load = this.providerLoad.get(providerName);
        return load ? load.current / load.capacity : 0;
    }

    /**
     * Update provider load metrics
     */
    async updateProviderLoad(providerName, delta) {
        const load = this.providerLoad.get(providerName) || {
            current: 0,
            capacity: this.config.maxConcurrentRequests,
            lastUpdated: Date.now()
        };

        load.current = Math.max(0, load.current + delta);
        load.lastUpdated = Date.now();

        this.providerLoad.set(providerName, load);

        // Process queue if load decreased
        if (delta < 0) {
            await this.processQueue(providerName);
        }
    }

    /**
     * Get queue length for provider
     */
    getQueueLength(providerName) {
        const queue = this.requestQueue.get(providerName);
        return queue ? queue.length : 0;
    }

    /**
     * Estimate wait time for queued request
     */
    estimateWaitTime(providerName) {
        const queueLength = this.getQueueLength(providerName);
        const avgProcessingTime = 2000; // 2 seconds average (configurable)

        return queueLength * avgProcessingTime;
    }

    /**
     * Get healthy providers from candidates
     */
    async getHealthyProviders(candidateProviders) {
        const healthy = [];

        for (const provider of candidateProviders) {
            const health = this.providerManager.getProviderHealth(provider);

            if (health.status === 'healthy' || health.status === 'degraded') {
                healthy.push(provider);
            }
        }

        return healthy;
    }

    /**
     * Start health monitoring for load balancing
     */
    startHealthMonitoring() {
        this.healthTimer = setInterval(async () => {
            await this.performHealthChecks();
        }, this.config.healthCheckInterval);
    }

    /**
     * Stop health monitoring
     */
    stopHealthMonitoring() {
        if (this.healthTimer) {
            clearInterval(this.healthTimer);
            this.healthTimer = null;
        }
    }

    /**
     * Perform health checks and update load metrics
     */
    async performHealthChecks() {
        try {
            const providers = this.providerManager.getFilteredProviders();

            for (const provider of providers) {
                const providerName = provider.name || provider.provider_name;

                // Update load metrics based on health
                const health = this.providerManager.getProviderHealth(providerName);

                if (health.status === 'error') {
                    // Reduce capacity for unhealthy providers
                    const load = this.providerLoad.get(providerName);
                    if (load) {
                        load.capacity = Math.max(1, this.config.maxConcurrentRequests * 0.5);
                        this.providerLoad.set(providerName, load);
                    }
                } else {
                    // Restore full capacity for healthy providers
                    const load = this.providerLoad.get(providerName) || {
                        current: 0,
                        capacity: this.config.maxConcurrentRequests,
                        lastUpdated: Date.now()
                    };
                    load.capacity = this.config.maxConcurrentRequests;
                    this.providerLoad.set(providerName, load);
                }
            }
        } catch (error) {
            logger.error('Health check failed', { error: error.message });
        }
    }

    /**
     * Update provider statistics
     */
    updateProviderStats(providerName, metric, value) {
        const stats = this.stats.providerStats.get(providerName) || {
            requests: 0,
            queued: 0,
            rejected: 0,
            avgResponseTime: 0
        };

        stats[metric] = (stats[metric] || 0) + value;
        this.stats.providerStats.set(providerName, stats);
    }

    /**
     * Get load balancer statistics
     */
    getStats() {
        const providerLoads = {};
        for (const [provider, load] of this.providerLoad.entries()) {
            providerLoads[provider] = {
                current: load.current,
                capacity: load.capacity,
                utilization: load.current / load.capacity
            };
        }

        const queueLengths = {};
        for (const [provider, queue] of this.requestQueue.entries()) {
            queueLengths[provider] = queue.length;
        }

        return {
            ...this.stats,
            providerLoads,
            queueLengths,
            strategy: this.currentStrategy,
            config: this.config
        };
    }

    /**
     * Change balancing strategy
     */
    setStrategy(strategy) {
        if (!Object.values(this.strategies).includes(strategy)) {
            throw new Error(`Invalid strategy: ${strategy}`);
        }

        this.currentStrategy = strategy;
        logger.info('Load balancing strategy changed', { strategy });
    }

    /**
     * Generate unique queue ID
     */
    generateQueueId() {
        return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Configure load balancer settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };

        if (newConfig.balancingStrategy) {
            this.setStrategy(newConfig.balancingStrategy);
        }

        if (newConfig.healthCheckInterval !== undefined) {
            this.stopHealthMonitoring();
            this.startHealthMonitoring();
        }

        logger.info('LoadBalancer configuration updated', this.config);
    }

    /**
     * Get provider performance metrics
     */
    getProviderMetrics(providerName) {
        const load = this.providerLoad.get(providerName);
        const stats = this.stats.providerStats.get(providerName);
        const queue = this.requestQueue.get(providerName);

        return {
            load: load ? {
                current: load.current,
                capacity: load.capacity,
                utilization: load.current / load.capacity
            } : null,
            stats: stats || {
                requests: 0,
                queued: 0,
                rejected: 0,
                avgResponseTime: 0
            },
            queueLength: queue ? queue.length : 0
        };
    }

    /**
     * Reset load balancer state
     */
    reset() {
        this.providerLoad.clear();
        this.requestQueue.clear();
        this.roundRobinIndex = 0;
        this.stats = {
            totalRequests: 0,
            balancedRequests: 0,
            queuedRequests: 0,
            rejectedRequests: 0,
            providerStats: new Map()
        };

        logger.info('LoadBalancer reset');
    }

    /**
     * Destroy load balancer
     */
    destroy() {
        this.stopHealthMonitoring();
        this.reset();
        logger.info('LoadBalancer destroyed');
    }
}

module.exports = LoadBalancer;