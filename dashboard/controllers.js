/**
 * Dashboard Controllers
 * Business logic for data aggregation, processing, and formatting
 */

const logger = require('../utils/logger');
const { metricsCollector, healthCheckManager } = require('../utils/monitoring');

class DashboardController {
    constructor(options = {}) {
        this.modelTracker = options.modelTracker;
        this.healthMonitor = options.healthMonitor;
        this.cacheManager = options.cacheManager;
        this.rateLimiter = options.rateLimiter;

        // Data processing options
        this.aggregationWindow = options.aggregationWindow || 3600000; // 1 hour
        this.maxDataPoints = options.maxDataPoints || 100;

        // Initialize data stores
        this.dataCache = new Map();
        this.cacheTimeout = options.cacheTimeout || 30000; // 30 seconds
    }

    /**
     * Get cached data with TTL
     */
    getCachedData(key, fetchFunction, ttl = this.cacheTimeout) {
        const cached = this.dataCache.get(key);
        if (cached && (Date.now() - cached.timestamp) < ttl) {
            return cached.data;
        }

        try {
            const data = fetchFunction();
            this.dataCache.set(key, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            logger.error(`Error fetching data for ${key}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Aggregate system metrics
     */
    aggregateSystemMetrics(timeRange = 3600000) {
        return this.getCachedData(`system-metrics-${timeRange}`, () => {
            const metrics = metricsCollector.getMetrics();
            const health = healthCheckManager.getHealth();

            return {
                timestamp: new Date().toISOString(),
                timeRange,

                // System resources
                system: {
                    uptime: metrics.system.uptime,
                    memory: {
                        used: metrics.system.memory.heapUsed,
                        total: metrics.system.memory.heapTotal,
                        external: metrics.system.memory.external,
                        usagePercent: (metrics.system.memory.heapUsed / metrics.system.memory.heapTotal) * 100
                    },
                    cpu: metrics.system.cpu
                },

                // Request metrics
                requests: {
                    total: metrics.requests.total,
                    successful: metrics.requests.success,
                    failed: metrics.requests.errors,
                    successRate: metrics.requests.successRate,
                    byProvider: metrics.requests.byProvider,
                    byEndpoint: metrics.requests.byEndpoint
                },

                // Performance metrics
                performance: {
                    averageResponseTime: metrics.performance.averageResponseTime,
                    p95ResponseTime: metrics.performance.p95ResponseTime,
                    p99ResponseTime: metrics.performance.p99ResponseTime
                },

                // Health status
                health: {
                    overall: health.status,
                    checks: health.checks
                }
            };
        });
    }

    /**
     * Aggregate provider data
     */
    aggregateProviderData() {
        return this.getCachedData('provider-data', () => {
            const providers = this.modelTracker?.providerManager?.getFilteredProviders() || [];
            const healthData = this.healthMonitor?.getHealthSummary() || {};

            return providers.map(provider => {
                const name = provider.name || provider.provider_name;
                const health = this.healthMonitor?.getProviderHealth(name);

                return {
                    name,
                    baseUrl: provider.base_url || provider.baseURL,
                    status: provider.status || 'unknown',
                    priority: provider.priority || 99,
                    models: this.modelTracker?.getModelsByProvider(name)?.length || 0,
                    health: health ? {
                        status: health.status,
                        responseTime: health.responseTime,
                        uptime: health.uptime,
                        lastChecked: health.lastChecked
                    } : null,
                    metrics: this.aggregateProviderMetrics(name)
                };
            });
        });
    }

    /**
     * Aggregate provider-specific metrics
     */
    aggregateProviderMetrics(providerName) {
        return this.getCachedData(`provider-metrics-${providerName}`, () => {
            const metrics = metricsCollector.getMetrics();

            if (!metrics.requests.byProvider.has(providerName)) {
                return {
                    requests: { total: 0, success: 0, errors: 0 },
                    performance: { averageResponseTime: 0 },
                    successRate: 0
                };
            }

            const providerStats = metrics.requests.byProvider.get(providerName);
            const providerResponseTimes = metrics.performance.providerResponseTime.get(providerName) || [];

            return {
                requests: {
                    total: providerStats.total,
                    success: providerStats.success,
                    errors: providerStats.errors
                },
                performance: {
                    averageResponseTime: providerResponseTimes.length > 0
                        ? providerResponseTimes.reduce((a, b) => a + b, 0) / providerResponseTimes.length
                        : 0,
                    responseTimes: providerResponseTimes.slice(-10) // Last 10 response times
                },
                successRate: providerStats.total > 0
                    ? (providerStats.success / providerStats.total) * 100
                    : 0
            };
        });
    }

    /**
     * Aggregate model data
     */
    aggregateModelData() {
        return this.getCachedData('model-data', () => {
            const models = this.modelTracker?.getAllModels() || [];
            const healthSummary = this.healthMonitor?.getHealthSummary() || {};

            return models.map(model => {
                const health = this.healthMonitor?.getModelHealth(model.id);

                return {
                    id: model.id,
                    name: model.name || model.id,
                    provider: model.provider,
                    status: model.status || 'unknown',
                    capabilities: model.capabilities || [],
                    contextLength: model.parameters?.context_length || model.contextLength,
                    health: health ? {
                        status: health.status,
                        availability: health.availability,
                        lastChecked: health.lastChecked
                    } : null,
                    metrics: this.aggregateModelMetrics(model.id)
                };
            });
        });
    }

    /**
     * Aggregate model-specific metrics
     */
    aggregateModelMetrics(modelId) {
        return this.getCachedData(`model-metrics-${modelId}`, () => {
            // In a real implementation, this would track per-model usage
            // For now, return mock data
            return {
                requests: Math.floor(Math.random() * 1000),
                successRate: 95 + Math.random() * 5,
                averageResponseTime: 200 + Math.random() * 100,
                lastUsed: new Date(Date.now() - Math.random() * 86400000).toISOString()
            };
        });
    }

    /**
     * Aggregate usage statistics
     */
    aggregateUsageStats(timeRange = '24h') {
        return this.getCachedData(`usage-${timeRange}`, () => {
            const metrics = metricsCollector.getMetrics();

            // Convert time range to milliseconds
            const timeRangeMs = this.parseTimeRange(timeRange);

            return {
                timeRange,
                period: {
                    start: new Date(Date.now() - timeRangeMs).toISOString(),
                    end: new Date().toISOString()
                },

                // Overall usage
                total: {
                    requests: metrics.requests.total,
                    successful: metrics.requests.success,
                    failed: metrics.requests.errors,
                    successRate: metrics.requests.successRate
                },

                // Usage by provider
                byProvider: Object.fromEntries(
                    Array.from(metrics.requests.byProvider.entries()).map(([provider, stats]) => [
                        provider,
                        {
                            requests: stats.total,
                            successful: stats.success,
                            failed: stats.errors,
                            successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0
                        }
                    ])
                ),

                // Usage by endpoint
                byEndpoint: Object.fromEntries(
                    Array.from(metrics.requests.byEndpoint.entries()).map(([endpoint, stats]) => [
                        endpoint,
                        {
                            requests: stats.total,
                            successful: stats.success,
                            failed: stats.errors,
                            successRate: stats.total > 0 ? (stats.success / stats.total) * 100 : 0
                        }
                    ])
                ),

                // Performance metrics
                performance: {
                    averageResponseTime: metrics.performance.averageResponseTime,
                    p95ResponseTime: metrics.performance.p95ResponseTime,
                    p99ResponseTime: metrics.performance.p99ResponseTime
                }
            };
        });
    }

    /**
     * Aggregate performance data
     */
    aggregatePerformanceData(timeRange = 3600000) {
        return this.getCachedData(`performance-${timeRange}`, () => {
            const metrics = metricsCollector.getMetrics();
            const health = healthCheckManager.getHealth();

            return {
                timestamp: new Date().toISOString(),
                timeRange,

                // Response time metrics
                responseTime: {
                    average: metrics.performance.averageResponseTime,
                    p50: this.calculatePercentile(metrics.performance.responseTime, 0.5),
                    p95: metrics.performance.p95ResponseTime,
                    p99: metrics.performance.p99ResponseTime,
                    min: Math.min(...metrics.performance.responseTime),
                    max: Math.max(...metrics.performance.responseTime)
                },

                // Throughput (requests per second)
                throughput: {
                    current: this.calculateThroughput(metrics.requests.total, timeRange),
                    average: this.calculateThroughput(metrics.requests.total, timeRange)
                },

                // Error rates
                errorRate: {
                    overall: (metrics.requests.errors / metrics.requests.total) * 100,
                    byProvider: Object.fromEntries(
                        Array.from(metrics.requests.byProvider.entries()).map(([provider, stats]) => [
                            provider,
                            stats.total > 0 ? (stats.errors / stats.total) * 100 : 0
                        ])
                    )
                },

                // System performance
                system: {
                    memoryUsage: (metrics.system.memory.heapUsed / metrics.system.memory.heapTotal) * 100,
                    uptime: metrics.system.uptime,
                    healthStatus: health.status
                },

                // Cache performance (if available)
                cache: this.cacheManager ? {
                    hitRate: this.cacheManager.getHitRate ? this.cacheManager.getHitRate() : 0,
                    size: this.cacheManager.getSize ? this.cacheManager.getSize() : 0,
                    evictions: this.cacheManager.getEvictions ? this.cacheManager.getEvictions() : 0
                } : null
            };
        });
    }

    /**
     * Aggregate cache performance data
     */
    aggregateCacheData() {
        return this.getCachedData('cache-data', () => {
            if (!this.cacheManager) {
                return {
                    available: false,
                    message: 'Cache manager not available'
                };
            }

            // In a real implementation, this would get actual cache stats
            return {
                available: true,
                totalRequests: 25600,
                cacheHits: 22380,
                cacheMisses: 3220,
                hitRate: 87.3,
                averageResponseTime: 45,
                memoryUsage: 128, // MB
                entries: 1540,
                evictions: 120,
                performance: {
                    hitTime: 5, // ms
                    missTime: 150, // ms
                    efficiency: 85.2
                }
            };
        });
    }

    /**
     * Generate alerts based on current data
     */
    generateAlerts() {
        return this.getCachedData('alerts', () => {
            const alerts = [];
            const metrics = metricsCollector.getMetrics();
            const health = healthCheckManager.getHealth();

            // Check error rate
            if (metrics.requests.successRate < 95) {
                alerts.push({
                    id: `error-rate-${Date.now()}`,
                    level: 'warning',
                    category: 'performance',
                    message: 'High error rate detected',
                    details: `Success rate: ${metrics.requests.successRate.toFixed(2)}%`,
                    value: metrics.requests.successRate,
                    threshold: 95,
                    timestamp: new Date().toISOString(),
                    acknowledged: false
                });
            }

            // Check response time
            if (metrics.performance.averageResponseTime > 1000) {
                alerts.push({
                    id: `response-time-${Date.now()}`,
                    level: 'warning',
                    category: 'performance',
                    message: 'Slow response times detected',
                    details: `Average: ${metrics.performance.averageResponseTime.toFixed(0)}ms`,
                    value: metrics.performance.averageResponseTime,
                    threshold: 1000,
                    timestamp: new Date().toISOString(),
                    acknowledged: false
                });
            }

            // Check memory usage
            const memoryUsage = (metrics.system.memory.heapUsed / metrics.system.memory.heapTotal) * 100;
            if (memoryUsage > 85) {
                alerts.push({
                    id: `memory-usage-${Date.now()}`,
                    level: 'critical',
                    category: 'system',
                    message: 'High memory usage detected',
                    details: `Memory usage: ${memoryUsage.toFixed(2)}%`,
                    value: memoryUsage,
                    threshold: 85,
                    timestamp: new Date().toISOString(),
                    acknowledged: false
                });
            }

            // Check health status
            if (health.status === 'unhealthy') {
                alerts.push({
                    id: `health-status-${Date.now()}`,
                    level: 'critical',
                    category: 'health',
                    message: 'System health is unhealthy',
                    details: 'One or more critical health checks have failed',
                    value: health.status,
                    threshold: 'healthy',
                    timestamp: new Date().toISOString(),
                    acknowledged: false
                });
            }

            // Check provider health
            const providerHealth = this.healthMonitor?.getHealthSummary();
            if (providerHealth) {
                const unhealthyProviders = providerHealth.providers.unhealthy + providerHealth.providers.error;
                if (unhealthyProviders > 0) {
                    alerts.push({
                        id: `provider-health-${Date.now()}`,
                        level: unhealthyProviders > 1 ? 'critical' : 'warning',
                        category: 'providers',
                        message: `${unhealthyProviders} provider(s) are unhealthy`,
                        details: `Unhealthy providers: ${unhealthyProviders}`,
                        value: unhealthyProviders,
                        threshold: 0,
                        timestamp: new Date().toISOString(),
                        acknowledged: false
                    });
                }
            }

            return alerts;
        });
    }

    /**
     * Get dashboard summary data
     */
    getDashboardSummary() {
        return this.getCachedData('dashboard-summary', () => {
            const metrics = this.aggregateSystemMetrics();
            const providers = this.aggregateProviderData();
            const models = this.aggregateModelData();
            const alerts = this.generateAlerts();

            return {
                timestamp: new Date().toISOString(),

                // System overview
                system: {
                    status: metrics.health.overall,
                    uptime: metrics.system.uptime,
                    memoryUsage: metrics.system.memory.usagePercent,
                    cpuUsage: 0 // Would need to calculate from CPU metrics
                },

                // Key metrics
                metrics: {
                    totalRequests: metrics.requests.total,
                    successRate: metrics.requests.successRate,
                    averageResponseTime: metrics.performance.averageResponseTime,
                    activeProviders: providers.filter(p => p.status === 'active').length,
                    totalModels: models.length,
                    availableModels: models.filter(m => m.status === 'available').length
                },

                // Status counts
                counts: {
                    providers: {
                        total: providers.length,
                        healthy: providers.filter(p => p.health?.status === 'healthy').length,
                        unhealthy: providers.filter(p => p.health?.status === 'unhealthy').length
                    },
                    models: {
                        total: models.length,
                        available: models.filter(m => m.status === 'available').length,
                        unavailable: models.filter(m => m.status === 'unavailable').length
                    },
                    alerts: {
                        total: alerts.length,
                        critical: alerts.filter(a => a.level === 'critical').length,
                        warning: alerts.filter(a => a.level === 'warning').length
                    }
                },

                // Recent alerts
                recentAlerts: alerts.slice(0, 5)
            };
        });
    }

    /**
     * Utility: Parse time range string to milliseconds
     */
    parseTimeRange(timeRange) {
        const ranges = {
            '1h': 3600000,
            '6h': 21600000,
            '24h': 86400000,
            '7d': 604800000,
            '30d': 2592000000
        };

        return ranges[timeRange] || 86400000; // Default to 24h
    }

    /**
     * Utility: Calculate percentile
     */
    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;

        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[index] || 0;
    }

    /**
     * Utility: Calculate throughput
     */
    calculateThroughput(totalRequests, timeRangeMs) {
        const timeRangeSeconds = timeRangeMs / 1000;
        return totalRequests / timeRangeSeconds;
    }

    /**
     * Clear data cache
     */
    clearCache() {
        this.dataCache.clear();
        logger.info('Dashboard controller cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.dataCache.size,
            keys: Array.from(this.dataCache.keys()),
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = DashboardController;