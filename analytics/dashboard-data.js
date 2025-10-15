/**
 * Dashboard Data Aggregator
 * Aggregates and prepares real-time data for dashboard visualization
 * Provides optimized data structures for frontend consumption
 */

const logger = require('../utils/logger');

class DashboardDataAggregator {
    constructor(options = {}) {
        this.options = {
            cacheTimeout: options.cacheTimeout || 30000, // 30 seconds
            maxDataPoints: options.maxDataPoints || 1000,
            enableRealTime: options.enableRealTime || true,
            ...options
        };

        // Cache for dashboard data
        this.cache = new Map();
        this.cacheTimestamps = new Map();

        // Real-time update tracking
        this.lastUpdates = new Map();
        this.updateListeners = new Set();

        logger.info('DashboardDataAggregator initialized', this.options);
    }

    /**
     * Initialize the dashboard data aggregator
     */
    async initialize() {
        if (this.options.enableRealTime) {
            this.startRealTimeUpdates();
        }
        logger.info('DashboardDataAggregator initialized successfully');
    }

    /**
     * Start real-time update mechanism
     */
    startRealTimeUpdates() {
        // Update dashboard data every 30 seconds
        setInterval(() => {
            this.refreshDashboardData();
        }, this.options.cacheTimeout);
    }

    /**
     * Get dashboard data for specified time range
     */
    async getDashboardData(timeRange = '24h') {
        const cacheKey = `dashboard_${timeRange}`;

        // Check cache validity
        if (this.isCacheValid(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        // Generate fresh data
        const data = await this.aggregateDashboardData(timeRange);

        // Cache the result
        this.cache.set(cacheKey, data);
        this.cacheTimestamps.set(cacheKey, Date.now());

        return data;
    }

    /**
     * Check if cache is still valid
     */
    isCacheValid(cacheKey) {
        const timestamp = this.cacheTimestamps.get(cacheKey);
        if (!timestamp) return false;

        return (Date.now() - timestamp) < this.options.cacheTimeout;
    }

    /**
     * Aggregate dashboard data
     */
    async aggregateDashboardData(timeRange) {
        const now = new Date();
        const startDate = this.calculateStartDate(timeRange, now);

        // In a real implementation, this would query the analytics components
        // For now, return structured mock data
        const data = {
            metadata: {
                timeRange,
                startDate,
                endDate: now,
                generated: now,
                dataPoints: 0
            },
            summary: {
                totalRequests: 0,
                totalTokens: 0,
                totalCost: 0,
                activeUsers: 0,
                activeProviders: 0,
                averageResponseTime: 0,
                successRate: 0
            },
            charts: {
                usageOverTime: [],
                costOverTime: [],
                providerUsage: [],
                userActivity: [],
                responseTimeDistribution: [],
                errorRates: []
            },
            alerts: [],
            recommendations: [],
            realTime: {
                activeConnections: 0,
                requestsPerSecond: 0,
                currentLoad: 0
            }
        };

        // Populate with mock data for demonstration
        data.summary = await this.getSummaryMetrics(startDate, now);
        data.charts = await this.getChartData(startDate, now, timeRange);
        data.alerts = await this.getActiveAlerts();
        data.recommendations = await this.getTopRecommendations();
        data.realTime = await this.getRealTimeMetrics();

        return data;
    }

    /**
     * Calculate start date based on time range
     */
    calculateStartDate(timeRange, now) {
        const ranges = {
            '1h': 1 * 60 * 60 * 1000,
            '6h': 6 * 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };

        const milliseconds = ranges[timeRange] || ranges['24h'];
        return new Date(now.getTime() - milliseconds);
    }

    /**
     * Get summary metrics
     */
    async getSummaryMetrics(startDate, endDate) {
        // Mock summary data - in real implementation, aggregate from analytics components
        return {
            totalRequests: Math.floor(Math.random() * 10000) + 5000,
            totalTokens: Math.floor(Math.random() * 1000000) + 500000,
            totalCost: Math.random() * 1000 + 500,
            activeUsers: Math.floor(Math.random() * 500) + 100,
            activeProviders: Math.floor(Math.random() * 10) + 3,
            averageResponseTime: Math.random() * 2000 + 500,
            successRate: Math.random() * 0.2 + 0.8
        };
    }

    /**
     * Get chart data for dashboard
     */
    async getChartData(startDate, endDate, timeRange) {
        const dataPoints = this.calculateDataPoints(timeRange);

        return {
            usageOverTime: this.generateTimeSeriesData(startDate, endDate, dataPoints, 'requests'),
            costOverTime: this.generateTimeSeriesData(startDate, endDate, dataPoints, 'cost'),
            providerUsage: this.generateProviderUsageData(),
            userActivity: this.generateUserActivityData(),
            responseTimeDistribution: this.generateResponseTimeData(),
            errorRates: this.generateErrorRateData(startDate, endDate, dataPoints)
        };
    }

    /**
     * Calculate number of data points based on time range
     */
    calculateDataPoints(timeRange) {
        const points = {
            '1h': 60,    // 1 point per minute
            '6h': 72,    // 1 point per 5 minutes
            '24h': 96,   // 1 point per 15 minutes
            '7d': 168,   // 1 point per hour
            '30d': 180   // 1 point per 4 hours
        };

        return Math.min(points[timeRange] || 96, this.options.maxDataPoints);
    }

    /**
     * Generate time series data
     */
    generateTimeSeriesData(startDate, endDate, dataPoints, metric) {
        const data = [];
        const interval = (endDate.getTime() - startDate.getTime()) / dataPoints;

        for (let i = 0; i < dataPoints; i++) {
            const timestamp = new Date(startDate.getTime() + i * interval);
            let value;

            switch (metric) {
                case 'requests':
                    value = Math.floor(Math.random() * 100) + 10;
                    break;
                case 'cost':
                    value = Math.random() * 50 + 5;
                    break;
                case 'tokens':
                    value = Math.floor(Math.random() * 10000) + 1000;
                    break;
                default:
                    value = Math.random() * 100;
            }

            data.push({
                timestamp: timestamp.toISOString(),
                value: Math.round(value * 100) / 100
            });
        }

        return data;
    }

    /**
     * Generate provider usage data
     */
    generateProviderUsageData() {
        const providers = ['openai', 'anthropic', 'google', 'huggingface', 'cohere'];
        return providers.map(provider => ({
            provider,
            requests: Math.floor(Math.random() * 1000) + 100,
            tokens: Math.floor(Math.random() * 100000) + 10000,
            cost: Math.random() * 200 + 20,
            successRate: Math.random() * 0.3 + 0.7
        }));
    }

    /**
     * Generate user activity data
     */
    generateUserActivityData() {
        const activities = ['active', 'idle', 'inactive'];
        return activities.map(activity => ({
            activity,
            count: Math.floor(Math.random() * 200) + 50,
            percentage: 0 // Will be calculated
        })).map(item => ({
            ...item,
            percentage: Math.round((item.count / 450) * 100)
        }));
    }

    /**
     * Generate response time distribution data
     */
    generateResponseTimeData() {
        const buckets = [
            { range: '< 500ms', count: 0 },
            { range: '500-1000ms', count: 0 },
            { range: '1000-2000ms', count: 0 },
            { range: '2000-5000ms', count: 0 },
            { range: '> 5000ms', count: 0 }
        ];

        // Generate random distribution
        const total = 1000;
        let remaining = total;

        buckets.forEach((bucket, index) => {
            if (index === buckets.length - 1) {
                bucket.count = remaining;
            } else {
                bucket.count = Math.floor(Math.random() * remaining * 0.4);
                remaining -= bucket.count;
            }
        });

        return buckets;
    }

    /**
     * Generate error rate data
     */
    generateErrorRateData(startDate, endDate, dataPoints) {
        return this.generateTimeSeriesData(startDate, endDate, dataPoints, 'errorRate')
            .map(point => ({
                ...point,
                value: Math.round((Math.random() * 0.1) * 100) / 100 // 0-10% error rate
            }));
    }

    /**
     * Get active alerts
     */
    async getActiveAlerts() {
        // Mock alerts - in real implementation, check system health and thresholds
        const alerts = [
            {
                id: 'high_memory',
                level: 'warning',
                message: 'Memory usage above 90%',
                timestamp: new Date(Date.now() - 300000).toISOString(),
                acknowledged: false
            },
            {
                id: 'provider_down',
                level: 'error',
                message: 'OpenAI provider experiencing issues',
                timestamp: new Date(Date.now() - 600000).toISOString(),
                acknowledged: false
            }
        ];

        return alerts;
    }

    /**
     * Get top recommendations
     */
    async getTopRecommendations() {
        // Mock recommendations - in real implementation, get from analytics components
        return [
            {
                id: 'cost_optimization',
                type: 'cost',
                priority: 'high',
                message: 'Consider switching to cheaper provider for non-critical requests',
                potentialSavings: 150.50
            },
            {
                id: 'caching',
                type: 'performance',
                priority: 'medium',
                message: 'Implement response caching to reduce API calls',
                impact: 'high'
            }
        ];
    }

    /**
     * Get real-time metrics
     */
    async getRealTimeMetrics() {
        return {
            activeConnections: Math.floor(Math.random() * 50) + 10,
            requestsPerSecond: Math.random() * 10 + 2,
            currentLoad: Math.random() * 100,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Refresh dashboard data (called periodically)
     */
    async refreshDashboardData() {
        try {
            // Clear expired cache
            this.clearExpiredCache();

            // Notify listeners of updates
            this.notifyUpdateListeners();

            logger.debug('Dashboard data refreshed');

        } catch (error) {
            logger.error('Error refreshing dashboard data', { error: error.message });
        }
    }

    /**
     * Clear expired cache entries
     */
    clearExpiredCache() {
        const now = Date.now();
        const expired = [];

        for (const [key, timestamp] of this.cacheTimestamps) {
            if (now - timestamp > this.options.cacheTimeout) {
                expired.push(key);
            }
        }

        expired.forEach(key => {
            this.cache.delete(key);
            this.cacheTimestamps.delete(key);
        });

        if (expired.length > 0) {
            logger.debug(`Cleared ${expired.length} expired cache entries`);
        }
    }

    /**
     * Add update listener
     */
    addUpdateListener(callback) {
        this.updateListeners.add(callback);
    }

    /**
     * Remove update listener
     */
    removeUpdateListener(callback) {
        this.updateListeners.delete(callback);
    }

    /**
     * Notify update listeners
     */
    notifyUpdateListeners() {
        const updateData = {
            timestamp: new Date().toISOString(),
            type: 'dashboard_update'
        };

        this.updateListeners.forEach(callback => {
            try {
                callback(updateData);
            } catch (error) {
                logger.error('Error notifying update listener', { error: error.message });
            }
        });
    }

    /**
     * Get real-time updates stream
     */
    getRealTimeUpdates() {
        // In a real implementation, this might return a WebSocket or Server-Sent Events stream
        return {
            onUpdate: (callback) => this.addUpdateListener(callback),
            offUpdate: (callback) => this.removeUpdateListener(callback)
        };
    }

    /**
     * Export dashboard data
     */
    async exportDashboardData(timeRange = '24h', format = 'json') {
        const data = await this.getDashboardData(timeRange);

        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);

            case 'csv':
                return this.convertToCSV(data);

            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Convert dashboard data to CSV
     */
    convertToCSV(data) {
        let csv = 'Metric,Value\n';

        // Add summary metrics
        Object.entries(data.summary).forEach(([key, value]) => {
            csv += `${key},${value}\n`;
        });

        // Add chart data summaries
        csv += `\nUsage Data Points,${data.charts.usageOverTime.length}\n`;
        csv += `Cost Data Points,${data.charts.costOverTime.length}\n`;
        csv += `Active Providers,${data.charts.providerUsage.length}\n`;

        return csv;
    }

    /**
     * Get dashboard configuration
     */
    getDashboardConfig() {
        return {
            timeRanges: ['1h', '6h', '24h', '7d', '30d'],
            refreshInterval: this.options.cacheTimeout,
            maxDataPoints: this.options.maxDataPoints,
            realTimeEnabled: this.options.enableRealTime,
            charts: {
                usageOverTime: { type: 'line', title: 'Usage Over Time' },
                costOverTime: { type: 'area', title: 'Cost Over Time' },
                providerUsage: { type: 'bar', title: 'Provider Usage' },
                userActivity: { type: 'pie', title: 'User Activity' },
                responseTimeDistribution: { type: 'histogram', title: 'Response Times' },
                errorRates: { type: 'line', title: 'Error Rates' }
            }
        };
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        this.cache.clear();
        this.cacheTimestamps.clear();
        this.updateListeners.clear();
        logger.info('DashboardDataAggregator cleanup completed');
    }

    /**
     * Shutdown the dashboard data aggregator
     */
    async shutdown() {
        await this.cleanup();
        logger.info('DashboardDataAggregator shutdown complete');
    }
}

module.exports = DashboardDataAggregator;