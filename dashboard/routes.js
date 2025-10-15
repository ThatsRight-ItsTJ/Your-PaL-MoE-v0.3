/**
 * Dashboard API Routes
 * Defines all API endpoints for the monitoring dashboard
 */

const express = require('express');
const logger = require('../utils/logger');
const { metricsCollector, healthCheckManager } = require('../utils/monitoring');

class DashboardRoutes {
    constructor(options = {}) {
        this.router = express.Router();
        this.cache = new Map();
        this.cacheTimeout = options.cacheTimeout || 30000; // 30 seconds

        this.initializeRoutes();
    }

    /**
     * Initialize all API routes
     */
    initializeRoutes() {
        // System status routes
        this.router.get('/status', this.getSystemStatus.bind(this));
        this.router.get('/health', this.getHealthStatus.bind(this));

        // Metrics routes
        this.router.get('/metrics', this.getMetrics.bind(this));
        this.router.get('/metrics/:type', this.getMetricsByType.bind(this));
        this.router.get('/metrics/history/:timeframe', this.getMetricsHistory.bind(this));

        // Provider routes
        this.router.get('/providers', this.getProviders.bind(this));
        this.router.get('/providers/:name', this.getProviderDetails.bind(this));
        this.router.get('/providers/:name/health', this.getProviderHealth.bind(this));
        this.router.get('/providers/:name/metrics', this.getProviderMetrics.bind(this));

        // Model routes
        this.router.get('/models', this.getModels.bind(this));
        this.router.get('/models/:id', this.getModelDetails.bind(this));
        this.router.get('/models/:id/health', this.getModelHealth.bind(this));
        this.router.get('/models/provider/:provider', this.getModelsByProvider.bind(this));

        // Usage and performance routes
        this.router.get('/usage', this.getUsageStats.bind(this));
        this.router.get('/usage/:period', this.getUsageByPeriod.bind(this));
        this.router.get('/performance', this.getPerformanceStats.bind(this));
        this.router.get('/performance/:metric', this.getPerformanceMetric.bind(this));

        // Cache routes
        this.router.get('/cache', this.getCacheStats.bind(this));
        this.router.get('/cache/performance', this.getCachePerformance.bind(this));

        // Alert routes
        this.router.get('/alerts', this.getAlerts.bind(this));
        this.router.get('/alerts/active', this.getActiveAlerts.bind(this));
        this.router.post('/alerts/:id/acknowledge', this.acknowledgeAlert.bind(this));

        // Configuration routes
        this.router.get('/config', this.getDashboardConfig.bind(this));
        this.router.put('/config', this.updateDashboardConfig.bind(this));

        // Real-time data routes (for polling clients)
        this.router.get('/realtime/metrics', this.getRealtimeMetrics.bind(this));
        this.router.get('/realtime/health', this.getRealtimeHealth.bind(this));
        this.router.get('/realtime/alerts', this.getRealtimeAlerts.bind(this));
    }

    /**
     * Get cached data or fetch fresh data
     */
    getCachedData(key, fetchFunction, ttl = this.cacheTimeout) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < ttl) {
            return cached.data;
        }

        try {
            const data = fetchFunction();
            this.cache.set(key, { data, timestamp: Date.now() });
            return data;
        } catch (error) {
            logger.error(`Error fetching data for ${key}`, { error: error.message });
            throw error;
        }
    }

    /**
     * Get system status
     */
    getSystemStatus(req, res) {
        try {
            const status = {
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                version: process.version,
                platform: process.platform,
                arch: process.arch
            };

            res.json(status);
        } catch (error) {
            logger.error('Error getting system status', { error: error.message });
            res.status(500).json({ error: 'Failed to get system status' });
        }
    }

    /**
     * Get health status
     */
    getHealthStatus(req, res) {
        try {
            const health = this.getCachedData('health', () => healthCheckManager.getHealth());
            res.json(health);
        } catch (error) {
            logger.error('Error getting health status', { error: error.message });
            res.status(500).json({ error: 'Failed to get health status' });
        }
    }

    /**
     * Get all metrics
     */
    getMetrics(req, res) {
        try {
            const metrics = this.getCachedData('metrics', () => metricsCollector.getMetrics());
            res.json(metrics);
        } catch (error) {
            logger.error('Error getting metrics', { error: error.message });
            res.status(500).json({ error: 'Failed to get metrics' });
        }
    }

    /**
     * Get metrics by type
     */
    getMetricsByType(req, res) {
        const { type } = req.params;

        try {
            const metrics = this.getCachedData(`metrics-${type}`, () => {
                const allMetrics = metricsCollector.getMetrics();
                return allMetrics[type] || null;
            });

            if (!metrics) {
                return res.status(404).json({ error: `Metrics type '${type}' not found` });
            }

            res.json(metrics);
        } catch (error) {
            logger.error(`Error getting metrics for type ${type}`, { error: error.message });
            res.status(500).json({ error: `Failed to get ${type} metrics` });
        }
    }

    /**
     * Get metrics history
     */
    getMetricsHistory(req, res) {
        const { timeframe } = req.params;
        // This would integrate with a metrics history store
        // For now, return current metrics

        try {
            const metrics = this.getCachedData(`metrics-history-${timeframe}`, () => ({
                timeframe,
                data: metricsCollector.getMetrics(),
                timestamp: new Date().toISOString()
            }));

            res.json(metrics);
        } catch (error) {
            logger.error(`Error getting metrics history for ${timeframe}`, { error: error.message });
            res.status(500).json({ error: 'Failed to get metrics history' });
        }
    }

    /**
     * Get all providers
     */
    getProviders(req, res) {
        try {
            // This would integrate with provider manager
            const providers = this.getCachedData('providers', () => [
                {
                    name: 'openai',
                    status: 'active',
                    models: 15,
                    priority: 1,
                    health: 'healthy'
                },
                {
                    name: 'anthropic',
                    status: 'active',
                    models: 8,
                    priority: 2,
                    health: 'healthy'
                },
                {
                    name: 'huggingface',
                    status: 'active',
                    models: 25,
                    priority: 3,
                    health: 'unhealthy'
                }
            ]);

            res.json({ providers });
        } catch (error) {
            logger.error('Error getting providers', { error: error.message });
            res.status(500).json({ error: 'Failed to get providers' });
        }
    }

    /**
     * Get provider details
     */
    getProviderDetails(req, res) {
        const { name } = req.params;

        try {
            const provider = this.getCachedData(`provider-${name}`, () => {
                // Mock provider data - would integrate with actual provider manager
                const providers = {
                    openai: {
                        name: 'openai',
                        baseUrl: 'https://api.openai.com',
                        status: 'active',
                        models: ['gpt-4', 'gpt-3.5-turbo', 'dall-e-3'],
                        rateLimit: { requests: 1000, tokens: 100000 },
                        health: { status: 'healthy', responseTime: 150 }
                    },
                    anthropic: {
                        name: 'anthropic',
                        baseUrl: 'https://api.anthropic.com',
                        status: 'active',
                        models: ['claude-3-opus', 'claude-3-sonnet'],
                        rateLimit: { requests: 500, tokens: 50000 },
                        health: { status: 'healthy', responseTime: 200 }
                    }
                };

                return providers[name] || null;
            });

            if (!provider) {
                return res.status(404).json({ error: `Provider '${name}' not found` });
            }

            res.json(provider);
        } catch (error) {
            logger.error(`Error getting provider ${name}`, { error: error.message });
            res.status(500).json({ error: `Failed to get provider ${name}` });
        }
    }

    /**
     * Get provider health
     */
    getProviderHealth(req, res) {
        const { name } = req.params;

        try {
            const health = this.getCachedData(`provider-health-${name}`, () => ({
                provider: name,
                status: Math.random() > 0.1 ? 'healthy' : 'unhealthy',
                responseTime: Math.floor(Math.random() * 500) + 100,
                lastChecked: new Date().toISOString(),
                uptime: 99.5
            }));

            res.json(health);
        } catch (error) {
            logger.error(`Error getting provider health for ${name}`, { error: error.message });
            res.status(500).json({ error: `Failed to get provider health for ${name}` });
        }
    }

    /**
     * Get provider metrics
     */
    getProviderMetrics(req, res) {
        const { name } = req.params;

        try {
            const metrics = this.getCachedData(`provider-metrics-${name}`, () => ({
                provider: name,
                requests: {
                    total: Math.floor(Math.random() * 10000),
                    successful: Math.floor(Math.random() * 9500),
                    failed: Math.floor(Math.random() * 500)
                },
                performance: {
                    averageResponseTime: Math.floor(Math.random() * 300) + 100,
                    p95ResponseTime: Math.floor(Math.random() * 500) + 200,
                    p99ResponseTime: Math.floor(Math.random() * 1000) + 500
                },
                timestamp: new Date().toISOString()
            }));

            res.json(metrics);
        } catch (error) {
            logger.error(`Error getting provider metrics for ${name}`, { error: error.message });
            res.status(500).json({ error: `Failed to get provider metrics for ${name}` });
        }
    }

    /**
     * Get all models
     */
    getModels(req, res) {
        try {
            const models = this.getCachedData('models', () => [
                {
                    id: 'gpt-4',
                    name: 'GPT-4',
                    provider: 'openai',
                    status: 'available',
                    capabilities: ['chat', 'completion'],
                    contextLength: 8192
                },
                {
                    id: 'claude-3-opus',
                    name: 'Claude 3 Opus',
                    provider: 'anthropic',
                    status: 'available',
                    capabilities: ['chat', 'completion'],
                    contextLength: 200000
                },
                {
                    id: 'llama-2-70b',
                    name: 'Llama 2 70B',
                    provider: 'huggingface',
                    status: 'unavailable',
                    capabilities: ['chat', 'completion'],
                    contextLength: 4096
                }
            ]);

            res.json({ models });
        } catch (error) {
            logger.error('Error getting models', { error: error.message });
            res.status(500).json({ error: 'Failed to get models' });
        }
    }

    /**
     * Get model details
     */
    getModelDetails(req, res) {
        const { id } = req.params;

        try {
            const model = this.getCachedData(`model-${id}`, () => {
                const models = {
                    'gpt-4': {
                        id: 'gpt-4',
                        name: 'GPT-4',
                        provider: 'openai',
                        description: 'Most advanced GPT model',
                        status: 'available',
                        capabilities: ['chat', 'completion', 'function-calling'],
                        parameters: { contextLength: 8192, maxTokens: 4096 },
                        metrics: { downloads: 1000000, rating: 4.8 }
                    },
                    'claude-3-opus': {
                        id: 'claude-3-opus',
                        name: 'Claude 3 Opus',
                        provider: 'anthropic',
                        description: 'Most intelligent Claude model',
                        status: 'available',
                        capabilities: ['chat', 'completion'],
                        parameters: { contextLength: 200000, maxTokens: 4096 },
                        metrics: { downloads: 500000, rating: 4.9 }
                    }
                };

                return models[id] || null;
            });

            if (!model) {
                return res.status(404).json({ error: `Model '${id}' not found` });
            }

            res.json(model);
        } catch (error) {
            logger.error(`Error getting model ${id}`, { error: error.message });
            res.status(500).json({ error: `Failed to get model ${id}` });
        }
    }

    /**
     * Get model health
     */
    getModelHealth(req, res) {
        const { id } = req.params;

        try {
            const health = this.getCachedData(`model-health-${id}`, () => ({
                model: id,
                status: Math.random() > 0.05 ? 'available' : 'unavailable',
                lastChecked: new Date().toISOString(),
                availability: 98.5
            }));

            res.json(health);
        } catch (error) {
            logger.error(`Error getting model health for ${id}`, { error: error.message });
            res.status(500).json({ error: `Failed to get model health for ${id}` });
        }
    }

    /**
     * Get models by provider
     */
    getModelsByProvider(req, res) {
        const { provider } = req.params;

        try {
            const models = this.getCachedData(`models-provider-${provider}`, () => {
                const providerModels = {
                    openai: [
                        { id: 'gpt-4', name: 'GPT-4', status: 'available' },
                        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', status: 'available' }
                    ],
                    anthropic: [
                        { id: 'claude-3-opus', name: 'Claude 3 Opus', status: 'available' },
                        { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', status: 'available' }
                    ]
                };

                return providerModels[provider] || [];
            });

            res.json({ provider, models });
        } catch (error) {
            logger.error(`Error getting models for provider ${provider}`, { error: error.message });
            res.status(500).json({ error: `Failed to get models for provider ${provider}` });
        }
    }

    /**
     * Get usage statistics
     */
    getUsageStats(req, res) {
        try {
            const usage = this.getCachedData('usage', () => ({
                totalRequests: 15420,
                successfulRequests: 15200,
                failedRequests: 220,
                successRate: 98.57,
                requestsByProvider: {
                    openai: 8920,
                    anthropic: 4500,
                    huggingface: 2000
                },
                requestsByEndpoint: {
                    '/api/chat': 12000,
                    '/api/completions': 3420
                },
                tokensConsumed: 2500000,
                averageTokensPerRequest: 162,
                period: '24h'
            }));

            res.json(usage);
        } catch (error) {
            logger.error('Error getting usage stats', { error: error.message });
            res.status(500).json({ error: 'Failed to get usage stats' });
        }
    }

    /**
     * Get usage by period
     */
    getUsageByPeriod(req, res) {
        const { period } = req.params;

        try {
            const usage = this.getCachedData(`usage-${period}`, () => ({
                period,
                totalRequests: Math.floor(Math.random() * 10000) + 5000,
                successfulRequests: Math.floor(Math.random() * 9500) + 4750,
                failedRequests: Math.floor(Math.random() * 500) + 250,
                successRate: 95 + Math.random() * 5,
                timestamp: new Date().toISOString()
            }));

            res.json(usage);
        } catch (error) {
            logger.error(`Error getting usage for period ${period}`, { error: error.message });
            res.status(500).json({ error: `Failed to get usage for period ${period}` });
        }
    }

    /**
     * Get performance statistics
     */
    getPerformanceStats(req, res) {
        try {
            const performance = this.getCachedData('performance', () => ({
                averageResponseTime: 245,
                p50ResponseTime: 180,
                p95ResponseTime: 450,
                p99ResponseTime: 800,
                throughput: 50, // requests per second
                errorRate: 1.43,
                cacheHitRate: 87.3,
                memoryUsage: 75.2,
                cpuUsage: 45.8
            }));

            res.json(performance);
        } catch (error) {
            logger.error('Error getting performance stats', { error: error.message });
            res.status(500).json({ error: 'Failed to get performance stats' });
        }
    }

    /**
     * Get specific performance metric
     */
    getPerformanceMetric(req, res) {
        const { metric } = req.params;

        try {
            const value = this.getCachedData(`performance-${metric}`, () => {
                const metrics = {
                    responseTime: { current: 245, average: 240, trend: 'stable' },
                    throughput: { current: 50, average: 48, trend: 'increasing' },
                    errorRate: { current: 1.43, average: 1.2, trend: 'stable' },
                    cacheHitRate: { current: 87.3, average: 85.1, trend: 'increasing' }
                };

                return metrics[metric] || null;
            });

            if (!value) {
                return res.status(404).json({ error: `Performance metric '${metric}' not found` });
            }

            res.json({ metric, ...value });
        } catch (error) {
            logger.error(`Error getting performance metric ${metric}`, { error: error.message });
            res.status(500).json({ error: `Failed to get performance metric ${metric}` });
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats(req, res) {
        try {
            const cache = this.getCachedData('cache', () => ({
                totalRequests: 25600,
                cacheHits: 22380,
                cacheMisses: 3220,
                hitRate: 87.3,
                averageResponseTime: 45,
                memoryUsage: 128, // MB
                entries: 1540,
                evictions: 120
            }));

            res.json(cache);
        } catch (error) {
            logger.error('Error getting cache stats', { error: error.message });
            res.status(500).json({ error: 'Failed to get cache stats' });
        }
    }

    /**
     * Get cache performance
     */
    getCachePerformance(req, res) {
        try {
            const performance = this.getCachedData('cache-performance', () => ({
                hitRate: 87.3,
                missRate: 12.7,
                averageHitTime: 5,
                averageMissTime: 150,
                throughput: 200, // requests per second
                efficiency: 85.2
            }));

            res.json(performance);
        } catch (error) {
            logger.error('Error getting cache performance', { error: error.message });
            res.status(500).json({ error: 'Failed to get cache performance' });
        }
    }

    /**
     * Get alerts
     */
    getAlerts(req, res) {
        try {
            const alerts = this.getCachedData('alerts', () => [
                {
                    id: 'alert-1',
                    level: 'warning',
                    message: 'High error rate detected',
                    details: 'Success rate dropped below 95%',
                    timestamp: new Date(Date.now() - 300000).toISOString(),
                    acknowledged: false
                },
                {
                    id: 'alert-2',
                    level: 'info',
                    message: 'Provider health check failed',
                    details: 'OpenAI provider temporarily unavailable',
                    timestamp: new Date(Date.now() - 600000).toISOString(),
                    acknowledged: true
                }
            ]);

            res.json({ alerts });
        } catch (error) {
            logger.error('Error getting alerts', { error: error.message });
            res.status(500).json({ error: 'Failed to get alerts' });
        }
    }

    /**
     * Get active alerts
     */
    getActiveAlerts(req, res) {
        try {
            const alerts = this.getCachedData('alerts-active', () => {
                const allAlerts = [
                    {
                        id: 'alert-1',
                        level: 'warning',
                        message: 'High error rate detected',
                        details: 'Success rate dropped below 95%',
                        timestamp: new Date(Date.now() - 300000).toISOString(),
                        acknowledged: false
                    }
                ];

                return allAlerts.filter(alert => !alert.acknowledged);
            });

            res.json({ alerts });
        } catch (error) {
            logger.error('Error getting active alerts', { error: error.message });
            res.status(500).json({ error: 'Failed to get active alerts' });
        }
    }

    /**
     * Acknowledge alert
     */
    acknowledgeAlert(req, res) {
        const { id } = req.params;

        try {
            // In a real implementation, this would update the alert in a database
            logger.info(`Alert ${id} acknowledged by user`, { user: req.user });

            res.json({
                success: true,
                message: `Alert ${id} acknowledged`,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error(`Error acknowledging alert ${id}`, { error: error.message });
            res.status(500).json({ error: `Failed to acknowledge alert ${id}` });
        }
    }

    /**
     * Get dashboard configuration
     */
    getDashboardConfig(req, res) {
        try {
            const config = this.getCachedData('config', () => ({
                updateInterval: 5000,
                retentionPeriod: 86400000, // 24 hours
                alertThresholds: {
                    errorRate: 5,
                    responseTime: 1000,
                    memoryUsage: 90
                },
                enabledFeatures: ['realtime', 'alerts', 'metrics', 'health'],
                theme: 'dark'
            }));

            res.json(config);
        } catch (error) {
            logger.error('Error getting dashboard config', { error: error.message });
            res.status(500).json({ error: 'Failed to get dashboard config' });
        }
    }

    /**
     * Update dashboard configuration
     */
    updateDashboardConfig(req, res) {
        try {
            const newConfig = req.body;

            // In a real implementation, this would validate and save the config
            logger.info('Dashboard configuration updated', { config: newConfig });

            res.json({
                success: true,
                message: 'Configuration updated',
                config: newConfig
            });
        } catch (error) {
            logger.error('Error updating dashboard config', { error: error.message });
            res.status(500).json({ error: 'Failed to update dashboard config' });
        }
    }

    /**
     * Get real-time metrics (for polling clients)
     */
    getRealtimeMetrics(req, res) {
        try {
            const metrics = metricsCollector.getMetrics();
            res.json({
                type: 'metrics',
                data: metrics,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error getting realtime metrics', { error: error.message });
            res.status(500).json({ error: 'Failed to get realtime metrics' });
        }
    }

    /**
     * Get real-time health (for polling clients)
     */
    getRealtimeHealth(req, res) {
        try {
            const health = healthCheckManager.getHealth();
            res.json({
                type: 'health',
                data: health,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error getting realtime health', { error: error.message });
            res.status(500).json({ error: 'Failed to get realtime health' });
        }
    }

    /**
     * Get real-time alerts (for polling clients)
     */
    getRealtimeAlerts(req, res) {
        try {
            const alerts = [
                {
                    id: 'alert-1',
                    level: 'warning',
                    message: 'High error rate detected',
                    timestamp: new Date().toISOString()
                }
            ];

            res.json({
                type: 'alerts',
                data: alerts,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Error getting realtime alerts', { error: error.message });
            res.status(500).json({ error: 'Failed to get realtime alerts' });
        }
    }

    /**
     * Get the router instance
     */
    getRouter() {
        return this.router;
    }
}

module.exports = DashboardRoutes;