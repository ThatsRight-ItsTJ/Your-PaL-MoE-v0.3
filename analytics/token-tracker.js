/**
 * Token Tracker
 * Tracks and analyzes token usage patterns per user, plan, and provider
 * Provides detailed token consumption analytics and forecasting
 */

const logger = require('../utils/logger');

class TokenTracker {
    constructor(options = {}) {
        this.options = {
            retentionPeriod: options.retentionPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
            aggregationInterval: options.aggregationInterval || 60000, // 1 minute
            ...options
        };

        // Storage for token usage data
        this.usageRecords = new Map(); // userId -> usage records
        this.aggregatedData = new Map(); // timeBucket -> aggregated data
        this.userStats = new Map(); // userId -> stats
        this.planStats = new Map(); // planId -> stats
        this.providerStats = new Map(); // providerName -> stats

        // Aggregation timer
        this.aggregationTimer = null;

        logger.info('TokenTracker initialized', this.options);
    }

    /**
     * Initialize the token tracker
     */
    async initialize() {
        this.startAggregationTimer();
        logger.info('TokenTracker initialized successfully');
    }

    /**
     * Start periodic aggregation
     */
    startAggregationTimer() {
        this.aggregationTimer = setInterval(() => {
            this.aggregateData();
        }, this.options.aggregationInterval);
    }

    /**
     * Record token usage
     */
    async recordUsage(event) {
        const {
            userId,
            planId,
            provider,
            model,
            tokens,
            promptTokens = 0,
            completionTokens = 0,
            cost = 0,
            success = true,
            timestamp = new Date(),
            endpoint
        } = event;

        if (!userId || !provider || typeof tokens !== 'number') {
            logger.warn('Invalid usage event data', { userId, provider, tokens });
            return;
        }

        const record = {
            userId,
            planId,
            provider,
            model,
            tokens,
            promptTokens,
            completionTokens,
            cost,
            success,
            timestamp: new Date(timestamp),
            endpoint
        };

        // Store individual record
        if (!this.usageRecords.has(userId)) {
            this.usageRecords.set(userId, []);
        }
        this.usageRecords.get(userId).push(record);

        // Update user stats
        this.updateUserStats(userId, record);

        // Update plan stats
        if (planId) {
            this.updatePlanStats(planId, record);
        }

        // Update provider stats
        this.updateProviderStats(provider, record);

        // Keep only recent records (last 1000 per user)
        const userRecords = this.usageRecords.get(userId);
        if (userRecords.length > 1000) {
            userRecords.shift();
        }

        logger.debug('Recorded token usage', {
            userId,
            provider,
            tokens,
            cost
        });
    }

    /**
     * Update user statistics
     */
    updateUserStats(userId, record) {
        if (!this.userStats.has(userId)) {
            this.userStats.set(userId, {
                totalTokens: 0,
                totalCost: 0,
                requestCount: 0,
                successCount: 0,
                lastActivity: null,
                providers: new Set(),
                models: new Set(),
                dailyUsage: new Map(), // date -> tokens
                monthlyUsage: new Map() // month -> tokens
            });
        }

        const stats = this.userStats.get(userId);
        stats.totalTokens += record.tokens;
        stats.totalCost += record.cost;
        stats.requestCount++;
        if (record.success) stats.successCount++;
        stats.lastActivity = record.timestamp;
        stats.providers.add(record.provider);
        if (record.model) stats.models.add(record.model);

        // Update daily usage
        const dayKey = record.timestamp.toISOString().split('T')[0];
        stats.dailyUsage.set(dayKey, (stats.dailyUsage.get(dayKey) || 0) + record.tokens);

        // Update monthly usage
        const monthKey = `${record.timestamp.getFullYear()}-${String(record.timestamp.getMonth() + 1).padStart(2, '0')}`;
        stats.monthlyUsage.set(monthKey, (stats.monthlyUsage.get(monthKey) || 0) + record.tokens);
    }

    /**
     * Update plan statistics
     */
    updatePlanStats(planId, record) {
        if (!this.planStats.has(planId)) {
            this.planStats.set(planId, {
                totalTokens: 0,
                totalCost: 0,
                userCount: new Set(),
                providerUsage: new Map(),
                dailyUsage: new Map()
            });
        }

        const stats = this.planStats.get(planId);
        stats.totalTokens += record.tokens;
        stats.totalCost += record.cost;
        stats.userCount.add(record.userId);

        // Update provider usage for this plan
        stats.providerUsage.set(record.provider,
            (stats.providerUsage.get(record.provider) || 0) + record.tokens);

        // Update daily usage
        const dayKey = record.timestamp.toISOString().split('T')[0];
        stats.dailyUsage.set(dayKey, (stats.dailyUsage.get(dayKey) || 0) + record.tokens);
    }

    /**
     * Update provider statistics
     */
    updateProviderStats(provider, record) {
        if (!this.providerStats.has(provider)) {
            this.providerStats.set(provider, {
                totalTokens: 0,
                totalCost: 0,
                requestCount: 0,
                successCount: 0,
                userCount: new Set(),
                modelUsage: new Map(),
                hourlyUsage: new Map()
            });
        }

        const stats = this.providerStats.get(provider);
        stats.totalTokens += record.tokens;
        stats.totalCost += record.cost;
        stats.requestCount++;
        if (record.success) stats.successCount++;
        stats.userCount.add(record.userId);

        if (record.model) {
            stats.modelUsage.set(record.model,
                (stats.modelUsage.get(record.model) || 0) + record.tokens);
        }

        // Update hourly usage
        const hourKey = `${record.timestamp.toISOString().split('T')[0]}T${String(record.timestamp.getHours()).padStart(2, '0')}`;
        stats.hourlyUsage.set(hourKey, (stats.hourlyUsage.get(hourKey) || 0) + record.tokens);
    }

    /**
     * Aggregate data periodically
     */
    aggregateData() {
        const now = new Date();
        const timeBucket = Math.floor(now.getTime() / (5 * 60 * 1000)) * 5 * 60 * 1000; // 5-minute buckets

        // Aggregate current usage data
        const aggregated = {
            timestamp: new Date(timeBucket),
            totalTokens: 0,
            totalCost: 0,
            requestCount: 0,
            providers: {},
            users: {},
            plans: {}
        };

        // Aggregate from user stats
        for (const [userId, stats] of this.userStats) {
            aggregated.users[userId] = {
                tokens: stats.totalTokens,
                cost: stats.totalCost,
                requests: stats.requestCount
            };
            aggregated.totalTokens += stats.totalTokens;
            aggregated.totalCost += stats.totalCost;
            aggregated.requestCount += stats.requestCount;
        }

        // Aggregate provider data
        for (const [provider, stats] of this.providerStats) {
            aggregated.providers[provider] = {
                tokens: stats.totalTokens,
                cost: stats.totalCost,
                requests: stats.requestCount,
                users: stats.userCount.size
            };
        }

        // Aggregate plan data
        for (const [planId, stats] of this.planStats) {
            aggregated.plans[planId] = {
                tokens: stats.totalTokens,
                cost: stats.totalCost,
                users: stats.userCount.size
            };
        }

        this.aggregatedData.set(timeBucket, aggregated);

        // Keep only recent aggregated data (last 1000 buckets)
        if (this.aggregatedData.size > 1000) {
            const oldestKey = Math.min(...this.aggregatedData.keys());
            this.aggregatedData.delete(oldestKey);
        }
    }

    /**
     * Get usage analytics
     */
    async getAnalytics(filters = {}) {
        const {
            userId,
            planId,
            provider,
            startDate,
            endDate,
            groupBy = 'day'
        } = filters;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const result = {
            period: { start, end },
            summary: this.getSummaryStats(filters),
            trends: this.getUsageTrends(filters, groupBy),
            topUsers: this.getTopUsers(filters),
            topProviders: this.getTopProviders(filters),
            efficiency: this.getEfficiencyMetrics(filters)
        };

        return result;
    }

    /**
     * Get summary statistics
     */
    getSummaryStats(filters) {
        let totalTokens = 0;
        let totalCost = 0;
        let requestCount = 0;
        let userCount = 0;
        let providerCount = 0;

        const applyFilters = (stats, filterKey, filterValue) => {
            if (!filterValue) return true;
            if (filterKey === 'userId') return stats.userId === filterValue;
            if (filterKey === 'planId') return stats.planId === filterValue;
            if (filterKey === 'provider') return stats.provider === filterValue;
            return true;
        };

        // Aggregate from user stats
        for (const [userId, stats] of this.userStats) {
            if (applyFilters({ userId }, 'userId', filters.userId)) {
                totalTokens += stats.totalTokens;
                totalCost += stats.totalCost;
                requestCount += stats.requestCount;
                userCount++;
                providerCount = Math.max(providerCount, stats.providers.size);
            }
        }

        return {
            totalTokens,
            totalCost,
            requestCount,
            userCount,
            providerCount,
            averageTokensPerRequest: requestCount > 0 ? totalTokens / requestCount : 0,
            averageCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0
        };
    }

    /**
     * Get usage trends
     */
    getUsageTrends(filters, groupBy = 'day') {
        const trends = new Map();

        for (const [userId, records] of this.usageRecords) {
            if (filters.userId && userId !== filters.userId) continue;

            for (const record of records) {
                if (filters.provider && record.provider !== filters.provider) continue;
                if (filters.startDate && record.timestamp < new Date(filters.startDate)) continue;
                if (filters.endDate && record.timestamp > new Date(filters.endDate)) continue;

                let key;
                if (groupBy === 'hour') {
                    key = record.timestamp.toISOString().slice(0, 13);
                } else if (groupBy === 'day') {
                    key = record.timestamp.toISOString().split('T')[0];
                } else if (groupBy === 'month') {
                    key = `${record.timestamp.getFullYear()}-${String(record.timestamp.getMonth() + 1).padStart(2, '0')}`;
                }

                if (!trends.has(key)) {
                    trends.set(key, { tokens: 0, cost: 0, requests: 0 });
                }

                const data = trends.get(key);
                data.tokens += record.tokens;
                data.cost += record.cost;
                data.requests++;
            }
        }

        return Array.from(trends.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([period, data]) => ({ period, ...data }));
    }

    /**
     * Get top users by usage
     */
    getTopUsers(filters, limit = 10) {
        const userUsage = [];

        for (const [userId, stats] of this.userStats) {
            if (filters.provider && !stats.providers.has(filters.provider)) continue;

            userUsage.push({
                userId,
                totalTokens: stats.totalTokens,
                totalCost: stats.totalCost,
                requestCount: stats.requestCount,
                lastActivity: stats.lastActivity
            });
        }

        return userUsage
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .slice(0, limit);
    }

    /**
     * Get top providers by usage
     */
    getTopProviders(filters, limit = 10) {
        const providerUsage = [];

        for (const [provider, stats] of this.providerStats) {
            providerUsage.push({
                provider,
                totalTokens: stats.totalTokens,
                totalCost: stats.totalCost,
                requestCount: stats.requestCount,
                userCount: stats.userCount.size,
                successRate: stats.requestCount > 0 ? stats.successCount / stats.requestCount : 0
            });
        }

        return providerUsage
            .sort((a, b) => b.totalTokens - a.totalTokens)
            .slice(0, limit);
    }

    /**
     * Get efficiency metrics
     */
    getEfficiencyMetrics(filters) {
        const metrics = {
            averageTokensPerRequest: 0,
            costEfficiency: 0,
            providerEfficiency: {},
            userEfficiency: {}
        };

        let totalTokens = 0;
        let totalRequests = 0;
        let totalCost = 0;

        // Calculate overall efficiency
        for (const [userId, stats] of this.userStats) {
            if (filters.userId && userId !== filters.userId) continue;
            totalTokens += stats.totalTokens;
            totalRequests += stats.requestCount;
            totalCost += stats.totalCost;
        }

        metrics.averageTokensPerRequest = totalRequests > 0 ? totalTokens / totalRequests : 0;
        metrics.costEfficiency = totalTokens > 0 ? totalCost / totalTokens : 0;

        // Calculate per-provider efficiency
        for (const [provider, stats] of this.providerStats) {
            metrics.providerEfficiency[provider] = {
                averageTokensPerRequest: stats.requestCount > 0 ? stats.totalTokens / stats.requestCount : 0,
                costPerToken: stats.totalTokens > 0 ? stats.totalCost / stats.totalTokens : 0,
                successRate: stats.requestCount > 0 ? stats.successCount / stats.requestCount : 0
            };
        }

        return metrics;
    }

    /**
     * Clean up old data
     */
    async cleanup(maxAge = this.options.retentionPeriod) {
        const cutoff = Date.now() - maxAge;
        let cleanedRecords = 0;
        let cleanedAggregated = 0;

        // Clean usage records
        for (const [userId, records] of this.usageRecords) {
            const filtered = records.filter(record => record.timestamp.getTime() > cutoff);
            cleanedRecords += records.length - filtered.length;
            if (filtered.length === 0) {
                this.usageRecords.delete(userId);
                this.userStats.delete(userId);
            } else {
                this.usageRecords.set(userId, filtered);
            }
        }

        // Clean aggregated data
        for (const [timestamp, data] of this.aggregatedData) {
            if (timestamp < cutoff) {
                this.aggregatedData.delete(timestamp);
                cleanedAggregated++;
            }
        }

        logger.info(`TokenTracker cleanup: removed ${cleanedRecords} records and ${cleanedAggregated} aggregated entries`);
        return { cleanedRecords, cleanedAggregated };
    }

    /**
     * Shutdown the token tracker
     */
    async shutdown() {
        if (this.aggregationTimer) {
            clearInterval(this.aggregationTimer);
            this.aggregationTimer = null;
        }
        logger.info('TokenTracker shutdown complete');
    }
}

module.exports = TokenTracker;