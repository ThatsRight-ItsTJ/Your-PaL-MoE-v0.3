/**
 * Provider Analytics
 * Analyzes provider performance, reliability, and usage patterns
 * Provides insights into provider efficiency and optimization opportunities
 */

const logger = require('../utils/logger');

class ProviderAnalytics {
    constructor(options = {}) {
        this.options = {
            retentionPeriod: options.retentionPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
            performanceThreshold: options.performanceThreshold || 0.95, // 95% success rate
            ...options
        };

        // Storage for provider metrics
        this.providerMetrics = new Map(); // providerName -> metrics
        this.performanceHistory = new Map(); // providerName -> performance records
        this.failureAnalysis = new Map(); // providerName -> failure patterns
        this.responseTimeStats = new Map(); // providerName -> response time data

        logger.info('ProviderAnalytics initialized', this.options);
    }

    /**
     * Initialize the provider analytics
     */
    async initialize() {
        logger.info('ProviderAnalytics initialized successfully');
    }

    /**
     * Record provider usage event
     */
    async recordUsage(event) {
        const {
            provider,
            model,
            success = true,
            responseTime = 0,
            errorType,
            errorMessage,
            tokens = 0,
            cost = 0,
            timestamp = new Date(),
            endpoint
        } = event;

        if (!provider) {
            logger.warn('Invalid provider usage event: missing provider');
            return;
        }

        // Initialize provider metrics if not exists
        if (!this.providerMetrics.has(provider)) {
            this.initializeProviderMetrics(provider);
        }

        const metrics = this.providerMetrics.get(provider);

        // Update basic metrics
        metrics.totalRequests++;
        metrics.totalTokens += tokens;
        metrics.totalCost += cost;

        if (success) {
            metrics.successfulRequests++;
        } else {
            metrics.failedRequests++;
            this.recordFailure(provider, { errorType, errorMessage, timestamp, model });
        }

        // Update response time statistics
        this.updateResponseTimeStats(provider, responseTime, success);

        // Update model-specific metrics
        if (model) {
            if (!metrics.modelMetrics.has(model)) {
                metrics.modelMetrics.set(model, {
                    requests: 0,
                    successful: 0,
                    failed: 0,
                    totalTokens: 0,
                    totalCost: 0,
                    averageResponseTime: 0
                });
            }

            const modelStats = metrics.modelMetrics.get(model);
            modelStats.requests++;
            if (success) modelStats.successful++;
            else modelStats.failed++;
            modelStats.totalTokens += tokens;
            modelStats.totalCost += cost;

            // Update rolling average response time
            const alpha = 0.1; // Smoothing factor
            modelStats.averageResponseTime = alpha * responseTime + (1 - alpha) * modelStats.averageResponseTime;
        }

        // Update performance history
        this.updatePerformanceHistory(provider, {
            timestamp,
            success,
            responseTime,
            tokens,
            cost,
            model
        });

        // Update last activity
        metrics.lastActivity = timestamp;

        logger.debug('Recorded provider usage', {
            provider,
            success,
            responseTime,
            tokens
        });
    }

    /**
     * Initialize metrics for a new provider
     */
    initializeProviderMetrics(provider) {
        this.providerMetrics.set(provider, {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            lastActivity: null,
            modelMetrics: new Map(),
            uptime: 0,
            averageResponseTime: 0,
            p95ResponseTime: 0,
            p99ResponseTime: 0,
            successRate: 0,
            costPerToken: 0,
            tokensPerSecond: 0
        });

        this.performanceHistory.set(provider, []);
        this.failureAnalysis.set(provider, {
            errorTypes: new Map(),
            errorMessages: new Map(),
            failurePatterns: [],
            lastFailures: []
        });

        this.responseTimeStats.set(provider, {
            samples: [],
            percentiles: new Map()
        });
    }

    /**
     * Record failure for analysis
     */
    recordFailure(provider, failure) {
        const analysis = this.failureAnalysis.get(provider);

        // Track error types
        const errorType = failure.errorType || 'unknown';
        analysis.errorTypes.set(errorType, (analysis.errorTypes.get(errorType) || 0) + 1);

        // Track error messages
        const errorMessage = failure.errorMessage || 'unknown';
        analysis.errorMessages.set(errorMessage, (analysis.errorMessages.get(errorMessage) || 0) + 1);

        // Keep recent failures for pattern analysis
        analysis.lastFailures.push({
            ...failure,
            timestamp: failure.timestamp
        });

        // Keep only last 100 failures
        if (analysis.lastFailures.length > 100) {
            analysis.lastFailures.shift();
        }
    }

    /**
     * Update response time statistics
     */
    updateResponseTimeStats(provider, responseTime, success) {
        const stats = this.responseTimeStats.get(provider);

        // Only track successful requests for response time analysis
        if (success && responseTime > 0) {
            stats.samples.push(responseTime);

            // Keep only last 1000 samples
            if (stats.samples.length > 1000) {
                stats.samples.shift();
            }

            // Update percentiles periodically
            if (stats.samples.length % 100 === 0) {
                this.calculatePercentiles(provider);
            }
        }
    }

    /**
     * Calculate response time percentiles
     */
    calculatePercentiles(provider) {
        const stats = this.responseTimeStats.get(provider);
        const samples = [...stats.samples].sort((a, b) => a - b);

        const percentiles = [0.5, 0.95, 0.99];
        percentiles.forEach(p => {
            const index = Math.floor(samples.length * p);
            stats.percentiles.set(p, samples[index] || 0);
        });
    }

    /**
     * Update performance history
     */
    updatePerformanceHistory(provider, record) {
        const history = this.performanceHistory.get(provider);
        history.push(record);

        // Keep only last 1000 records
        if (history.length > 1000) {
            history.shift();
        }
    }

    /**
     * Calculate provider metrics
     */
    calculateProviderMetrics(provider) {
        const metrics = this.providerMetrics.get(provider);
        const history = this.performanceHistory.get(provider);

        if (metrics.totalRequests === 0) return;

        // Calculate success rate
        metrics.successRate = metrics.successfulRequests / metrics.totalRequests;

        // Calculate cost per token
        metrics.costPerToken = metrics.totalTokens > 0 ? metrics.totalCost / metrics.totalTokens : 0;

        // Calculate average response time
        const responseTimes = history
            .filter(h => h.success && h.responseTime > 0)
            .map(h => h.responseTime);

        if (responseTimes.length > 0) {
            metrics.averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        }

        // Get percentiles
        const rtStats = this.responseTimeStats.get(provider);
        metrics.p95ResponseTime = rtStats.percentiles.get(0.95) || 0;
        metrics.p99ResponseTime = rtStats.percentiles.get(0.99) || 0;

        // Calculate tokens per second (rough estimate)
        const totalTimeSeconds = history.length > 1 ?
            (history[history.length - 1].timestamp - history[0].timestamp) / 1000 : 1;
        metrics.tokensPerSecond = totalTimeSeconds > 0 ? metrics.totalTokens / totalTimeSeconds : 0;
    }

    /**
     * Get provider analytics
     */
    async getAnalytics(filters = {}) {
        const {
            provider,
            startDate,
            endDate,
            includeHistory = false
        } = filters;

        const providers = provider ? [provider] : Array.from(this.providerMetrics.keys());
        const result = {
            summary: {},
            performance: {},
            reliability: {},
            costAnalysis: {},
            recommendations: []
        };

        for (const p of providers) {
            if (!this.providerMetrics.has(p)) continue;

            // Calculate current metrics
            this.calculateProviderMetrics(p);
            const metrics = this.providerMetrics.get(p);

            // Summary
            result.summary[p] = {
                totalRequests: metrics.totalRequests,
                successRate: metrics.successRate,
                totalTokens: metrics.totalTokens,
                totalCost: metrics.totalCost,
                averageResponseTime: metrics.averageResponseTime,
                lastActivity: metrics.lastActivity
            };

            // Performance metrics
            result.performance[p] = {
                averageResponseTime: metrics.averageResponseTime,
                p95ResponseTime: metrics.p95ResponseTime,
                p99ResponseTime: metrics.p99ResponseTime,
                tokensPerSecond: metrics.tokensPerSecond,
                modelPerformance: this.getModelPerformance(p)
            };

            // Reliability analysis
            result.reliability[p] = {
                uptime: this.calculateUptime(p),
                failurePatterns: this.analyzeFailurePatterns(p),
                errorDistribution: this.getErrorDistribution(p)
            };

            // Cost analysis
            result.costAnalysis[p] = {
                costPerToken: metrics.costPerToken,
                costEfficiency: this.calculateCostEfficiency(p),
                costTrends: this.getCostTrends(p, startDate, endDate)
            };

            // Generate recommendations
            result.recommendations.push(...this.generateRecommendations(p, metrics));
        }

        if (includeHistory) {
            result.history = this.getPerformanceHistory(filters);
        }

        return result;
    }

    /**
     * Get model-specific performance
     */
    getModelPerformance(provider) {
        const metrics = this.providerMetrics.get(provider);
        const modelPerf = {};

        for (const [model, stats] of metrics.modelMetrics) {
            modelPerf[model] = {
                requests: stats.requests,
                successRate: stats.requests > 0 ? stats.successful / stats.requests : 0,
                averageResponseTime: stats.averageResponseTime,
                totalTokens: stats.totalTokens,
                totalCost: stats.totalCost,
                costPerToken: stats.totalTokens > 0 ? stats.totalCost / stats.totalTokens : 0
            };
        }

        return modelPerf;
    }

    /**
     * Calculate provider uptime
     */
    calculateUptime(provider) {
        const history = this.performanceHistory.get(provider);
        if (history.length < 2) return 1; // Assume 100% if insufficient data

        const totalPeriod = history[history.length - 1].timestamp - history[0].timestamp;
        const downtime = history
            .filter((h, i) => i > 0 && !h.success)
            .reduce((acc, h, i) => {
                const prev = history[i - 1];
                return acc + (h.timestamp - prev.timestamp);
            }, 0);

        return Math.max(0, 1 - (downtime / totalPeriod));
    }

    /**
     * Analyze failure patterns
     */
    analyzeFailurePatterns(provider) {
        const analysis = this.failureAnalysis.get(provider);
        const failures = analysis.lastFailures;

        if (failures.length === 0) return { patterns: [], riskLevel: 'low' };

        // Analyze failure frequency over time
        const recentFailures = failures.filter(f =>
            Date.now() - f.timestamp.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
        );

        const patterns = [];

        // Check for rate limiting patterns
        const rateLimitErrors = recentFailures.filter(f =>
            f.errorType === 'rate_limit' || f.errorMessage?.includes('rate limit')
        );
        if (rateLimitErrors.length > recentFailures.length * 0.5) {
            patterns.push({
                type: 'rate_limiting',
                frequency: rateLimitErrors.length / recentFailures.length,
                severity: 'high'
            });
        }

        // Check for timeout patterns
        const timeoutErrors = recentFailures.filter(f =>
            f.errorType === 'timeout' || f.errorMessage?.includes('timeout')
        );
        if (timeoutErrors.length > recentFailures.length * 0.3) {
            patterns.push({
                type: 'timeouts',
                frequency: timeoutErrors.length / recentFailures.length,
                severity: 'medium'
            });
        }

        // Determine overall risk level
        let riskLevel = 'low';
        if (patterns.some(p => p.severity === 'high') || recentFailures.length > 10) {
            riskLevel = 'high';
        } else if (patterns.length > 0 || recentFailures.length > 5) {
            riskLevel = 'medium';
        }

        return { patterns, riskLevel, recentFailureCount: recentFailures.length };
    }

    /**
     * Get error distribution
     */
    getErrorDistribution(provider) {
        const analysis = this.failureAnalysis.get(provider);
        return {
            errorTypes: Object.fromEntries(analysis.errorTypes),
            errorMessages: Object.fromEntries(analysis.errorMessages)
        };
    }

    /**
     * Calculate cost efficiency
     */
    calculateCostEfficiency(provider) {
        const metrics = this.providerMetrics.get(provider);

        // Compare cost per token against expected ranges
        const costPerToken = metrics.costPerToken;
        let efficiency = 'unknown';

        // These are example ranges - would need to be configured based on actual pricing
        if (costPerToken < 0.0001) efficiency = 'excellent';
        else if (costPerToken < 0.0005) efficiency = 'good';
        else if (costPerToken < 0.001) efficiency = 'fair';
        else efficiency = 'poor';

        return {
            costPerToken,
            efficiency,
            benchmarkComparison: this.getBenchmarkComparison(provider, costPerToken)
        };
    }

    /**
     * Get benchmark comparison
     */
    getBenchmarkComparison(provider, costPerToken) {
        // This would compare against industry benchmarks or historical data
        // For now, return a simple comparison
        const benchmarks = {
            'openai': 0.00015,
            'anthropic': 0.00025,
            'google': 0.0001,
            'default': 0.0002
        };

        const benchmark = benchmarks[provider.toLowerCase()] || benchmarks.default;
        const difference = ((costPerToken - benchmark) / benchmark) * 100;

        return {
            benchmark,
            differencePercent: difference,
            status: Math.abs(difference) < 10 ? 'on_target' :
                   difference > 0 ? 'above_benchmark' : 'below_benchmark'
        };
    }

    /**
     * Get cost trends
     */
    getCostTrends(provider, startDate, endDate) {
        const history = this.performanceHistory.get(provider);
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const filtered = history.filter(h =>
            h.timestamp >= start && h.timestamp <= end && h.cost > 0
        );

        if (filtered.length === 0) return { trend: 'insufficient_data', data: [] };

        // Group by day
        const dailyCosts = new Map();
        filtered.forEach(h => {
            const day = h.timestamp.toISOString().split('T')[0];
            dailyCosts.set(day, (dailyCosts.get(day) || 0) + h.cost);
        });

        const data = Array.from(dailyCosts.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, cost]) => ({ date, cost }));

        // Calculate trend
        let trend = 'stable';
        if (data.length >= 7) {
            const recent = data.slice(-7).reduce((sum, d) => sum + d.cost, 0) / 7;
            const previous = data.slice(-14, -7).reduce((sum, d) => sum + d.cost, 0) / 7;
            const change = ((recent - previous) / previous) * 100;

            if (change > 10) trend = 'increasing';
            else if (change < -10) trend = 'decreasing';
        }

        return { trend, data };
    }

    /**
     * Generate recommendations for provider optimization
     */
    generateRecommendations(provider, metrics) {
        const recommendations = [];

        // Success rate recommendations
        if (metrics.successRate < this.options.performanceThreshold) {
            recommendations.push({
                provider,
                type: 'reliability',
                priority: 'high',
                message: `Low success rate (${(metrics.successRate * 100).toFixed(1)}%). Consider failover strategies.`,
                action: 'implement_circuit_breaker'
            });
        }

        // Response time recommendations
        if (metrics.averageResponseTime > 5000) { // 5 seconds
            recommendations.push({
                provider,
                type: 'performance',
                priority: 'medium',
                message: `High average response time (${metrics.averageResponseTime.toFixed(0)}ms). Consider caching or optimization.`,
                action: 'optimize_requests'
            });
        }

        // Cost optimization recommendations
        const costEfficiency = this.calculateCostEfficiency(provider);
        if (costEfficiency.efficiency === 'poor') {
            recommendations.push({
                provider,
                type: 'cost',
                priority: 'medium',
                message: `High cost per token ($${metrics.costPerToken.toFixed(6)}). Consider alternative providers or models.`,
                action: 'evaluate_alternatives'
            });
        }

        // Failure pattern recommendations
        const failureAnalysis = this.analyzeFailurePatterns(provider);
        if (failureAnalysis.riskLevel === 'high') {
            recommendations.push({
                provider,
                type: 'reliability',
                priority: 'high',
                message: 'High failure rate detected. Implement retry logic and monitoring.',
                action: 'add_retry_logic'
            });
        }

        return recommendations;
    }

    /**
     * Get performance history
     */
    getPerformanceHistory(filters = {}) {
        const { provider, startDate, endDate, limit = 1000 } = filters;
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const result = {};

        const providers = provider ? [provider] : Array.from(this.performanceHistory.keys());

        for (const p of providers) {
            const history = this.performanceHistory.get(p) || [];
            result[p] = history
                .filter(h => h.timestamp >= start && h.timestamp <= end)
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);
        }

        return result;
    }

    /**
     * Clean up old data
     */
    async cleanup(maxAge = this.options.retentionPeriod) {
        const cutoff = Date.now() - maxAge;
        let cleanedHistory = 0;
        let cleanedFailures = 0;

        // Clean performance history
        for (const [provider, history] of this.performanceHistory) {
            const filtered = history.filter(record => record.timestamp.getTime() > cutoff);
            cleanedHistory += history.length - filtered.length;
            this.performanceHistory.set(provider, filtered);
        }

        // Clean failure analysis
        for (const [provider, analysis] of this.failureAnalysis) {
            const filtered = analysis.lastFailures.filter(failure => failure.timestamp.getTime() > cutoff);
            cleanedFailures += analysis.lastFailures.length - filtered.length;
            analysis.lastFailures = filtered;
        }

        logger.info(`ProviderAnalytics cleanup: removed ${cleanedHistory} history records and ${cleanedFailures} failure records`);
        return { cleanedHistory, cleanedFailures };
    }

    /**
     * Shutdown the provider analytics
     */
    async shutdown() {
        logger.info('ProviderAnalytics shutdown complete');
    }
}

module.exports = ProviderAnalytics;