/**
 * Cost Analyzer
 * Analyzes and optimizes costs across providers, plans, and usage patterns
 * Provides cost optimization recommendations and budget management
 */

const logger = require('../utils/logger');

class CostAnalyzer {
    constructor(options = {}) {
        this.options = {
            retentionPeriod: options.retentionPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
            costOptimizationThreshold: options.costOptimizationThreshold || 0.1, // 10% savings
            budgetAlertThreshold: options.budgetAlertThreshold || 0.8, // 80% of budget
            ...options
        };

        // Storage for cost data
        this.costRecords = new Map(); // userId -> cost records
        this.providerPricing = new Map(); // provider -> pricing data
        this.budgets = new Map(); // userId/planId -> budget settings
        this.costOptimization = new Map(); // provider -> optimization suggestions
        this.spendingTrends = new Map(); // timeBucket -> spending data

        // Analysis intervals
        this.analysisTimer = null;

        logger.info('CostAnalyzer initialized', this.options);
    }

    /**
     * Initialize the cost analyzer
     */
    async initialize() {
        this.startAnalysisTimer();
        this.loadProviderPricing();
        logger.info('CostAnalyzer initialized successfully');
    }

    /**
     * Start periodic cost analysis
     */
    startAnalysisTimer() {
        // Run cost analysis every hour
        this.analysisTimer = setInterval(() => {
            this.performCostAnalysis();
        }, 60 * 60 * 1000);
    }

    /**
     * Load provider pricing data
     */
    loadProviderPricing() {
        // This would typically load from a configuration file or database
        // For now, using example pricing data
        const defaultPricing = {
            openai: {
                'gpt-4': { prompt: 0.03, completion: 0.06 },
                'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
                'gpt-4-turbo': { prompt: 0.01, completion: 0.03 }
            },
            anthropic: {
                'claude-3-opus': { prompt: 0.015, completion: 0.075 },
                'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
                'claude-3-haiku': { prompt: 0.00025, completion: 0.00125 }
            },
            google: {
                'gemini-pro': { prompt: 0.00025, completion: 0.0005 },
                'gemini-pro-vision': { prompt: 0.00025, completion: 0.0005 }
            }
        };

        for (const [provider, models] of Object.entries(defaultPricing)) {
            this.providerPricing.set(provider, models);
        }

        logger.info('Loaded provider pricing data');
    }

    /**
     * Record cost event
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
            cost,
            timestamp = new Date()
        } = event;

        if (!userId || !provider) {
            logger.warn('Invalid cost event data', { userId, provider });
            return;
        }

        // Calculate cost if not provided
        let actualCost = cost;
        if (actualCost === undefined && tokens > 0) {
            actualCost = this.calculateCost(provider, model, promptTokens, completionTokens);
        }

        if (actualCost === undefined) {
            logger.warn('Unable to calculate cost for event', { provider, model, tokens });
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
            cost: actualCost,
            timestamp: new Date(timestamp),
            costPerToken: tokens > 0 ? actualCost / tokens : 0
        };

        // Store individual record
        if (!this.costRecords.has(userId)) {
            this.costRecords.set(userId, []);
        }
        this.costRecords.get(userId).push(record);

        // Update spending trends
        this.updateSpendingTrends(record);

        // Keep only recent records (last 1000 per user)
        const userRecords = this.costRecords.get(userId);
        if (userRecords.length > 1000) {
            userRecords.shift();
        }

        // Check budget alerts
        await this.checkBudgetAlerts(userId, planId, record);

        logger.debug('Recorded cost', {
            userId,
            provider,
            cost: actualCost,
            tokens
        });
    }

    /**
     * Calculate cost based on provider pricing
     */
    calculateCost(provider, model, promptTokens, completionTokens) {
        const pricing = this.providerPricing.get(provider);
        if (!pricing || !pricing[model]) {
            return undefined;
        }

        const modelPricing = pricing[model];
        const promptCost = (promptTokens || 0) * (modelPricing.prompt || 0);
        const completionCost = (completionTokens || 0) * (modelPricing.completion || 0);

        return promptCost + completionCost;
    }

    /**
     * Update spending trends
     */
    updateSpendingTrends(record) {
        const hourBucket = Math.floor(record.timestamp.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000;

        if (!this.spendingTrends.has(hourBucket)) {
            this.spendingTrends.set(hourBucket, {
                timestamp: new Date(hourBucket),
                totalCost: 0,
                totalTokens: 0,
                providers: new Map(),
                users: new Set()
            });
        }

        const trend = this.spendingTrends.get(hourBucket);
        trend.totalCost += record.cost;
        trend.totalTokens += record.tokens;
        trend.users.add(record.userId);

        // Update provider spending
        if (!trend.providers.has(record.provider)) {
            trend.providers.set(record.provider, { cost: 0, tokens: 0 });
        }
        const providerData = trend.providers.get(record.provider);
        providerData.cost += record.cost;
        providerData.tokens += record.tokens;
    }

    /**
     * Set budget for user or plan
     */
    setBudget(identifier, budget) {
        this.budgets.set(identifier, {
            ...budget,
            setAt: new Date(),
            alertsTriggered: []
        });

        logger.info(`Budget set for ${identifier}`, budget);
    }

    /**
     * Check budget alerts
     */
    async checkBudgetAlerts(userId, planId, record) {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        // Check user budget
        const userBudget = this.budgets.get(userId);
        if (userBudget) {
            const userSpending = this.calculateSpending(userId, monthStart, now);
            await this.checkBudgetThreshold(userId, userBudget, userSpending, 'user');
        }

        // Check plan budget
        if (planId) {
            const planBudget = this.budgets.get(planId);
            if (planBudget) {
                const planSpending = this.calculatePlanSpending(planId, monthStart, now);
                await this.checkBudgetThreshold(planId, planBudget, planSpending, 'plan');
            }
        }
    }

    /**
     * Check if budget threshold is exceeded
     */
    async checkBudgetThreshold(identifier, budget, currentSpending, type) {
        const usagePercent = currentSpending.totalCost / budget.monthlyLimit;

        if (usagePercent >= this.options.budgetAlertThreshold) {
            // Check if alert already triggered
            const recentAlerts = budget.alertsTriggered.filter(
                alert => Date.now() - alert.timestamp < 24 * 60 * 60 * 1000 // Last 24 hours
            );

            if (recentAlerts.length === 0) {
                logger.warn(`Budget alert for ${type} ${identifier}`, {
                    usagePercent: (usagePercent * 100).toFixed(1) + '%',
                    currentSpending: currentSpending.totalCost,
                    limit: budget.monthlyLimit
                });

                budget.alertsTriggered.push({
                    timestamp: Date.now(),
                    usagePercent,
                    currentSpending: currentSpending.totalCost
                });
            }
        }
    }

    /**
     * Calculate spending for a user
     */
    calculateSpending(userId, startDate, endDate) {
        const records = this.costRecords.get(userId) || [];
        const filtered = records.filter(r =>
            r.timestamp >= startDate && r.timestamp <= endDate
        );

        return {
            totalCost: filtered.reduce((sum, r) => sum + r.cost, 0),
            totalTokens: filtered.reduce((sum, r) => sum + r.tokens, 0),
            requestCount: filtered.length
        };
    }

    /**
     * Calculate spending for a plan
     */
    calculatePlanSpending(planId, startDate, endDate) {
        let totalCost = 0;
        let totalTokens = 0;
        let requestCount = 0;

        for (const [userId, records] of this.costRecords) {
            const filtered = records.filter(r =>
                r.planId === planId &&
                r.timestamp >= startDate &&
                r.timestamp <= endDate
            );

            totalCost += filtered.reduce((sum, r) => sum + r.cost, 0);
            totalTokens += filtered.reduce((sum, r) => sum + r.tokens, 0);
            requestCount += filtered.length;
        }

        return { totalCost, totalTokens, requestCount };
    }

    /**
     * Perform periodic cost analysis
     */
    async performCostAnalysis() {
        try {
            logger.info('Performing cost analysis...');

            // Analyze cost optimization opportunities
            await this.analyzeCostOptimization();

            // Update spending forecasts
            await this.updateSpendingForecasts();

            // Generate cost reports
            await this.generateCostReports();

            logger.info('Cost analysis completed');

        } catch (error) {
            logger.error('Error in cost analysis', { error: error.message });
        }
    }

    /**
     * Analyze cost optimization opportunities
     */
    async analyzeCostOptimization() {
        const optimizations = new Map();

        // Analyze provider costs
        for (const [provider, pricing] of this.providerPricing) {
            const analysis = this.analyzeProviderCosts(provider, pricing);
            if (analysis.savings > 0) {
                optimizations.set(provider, analysis);
            }
        }

        // Analyze model alternatives
        const modelOptimizations = this.analyzeModelAlternatives();
        for (const [key, analysis] of modelOptimizations) {
            optimizations.set(key, analysis);
        }

        this.costOptimization = optimizations;
        logger.info(`Identified ${optimizations.size} cost optimization opportunities`);
    }

    /**
     * Analyze provider-specific costs
     */
    analyzeProviderCosts(provider, pricing) {
        // Calculate average cost per token for this provider
        let totalCost = 0;
        let totalTokens = 0;

        for (const [userId, records] of this.costRecords) {
            const providerRecords = records.filter(r => r.provider === provider);
            totalCost += providerRecords.reduce((sum, r) => sum + r.cost, 0);
            totalTokens += providerRecords.reduce((sum, r) => sum + r.tokens, 0);
        }

        if (totalTokens === 0) return { savings: 0 };

        const avgCostPerToken = totalCost / totalTokens;

        // Find cheaper alternatives
        const alternatives = [];
        for (const [altProvider, altPricing] of this.providerPricing) {
            if (altProvider === provider) continue;

            for (const [model, modelPricing] of Object.entries(altPricing)) {
                const altCost = (modelPricing.prompt + modelPricing.completion) / 2;
                if (altCost < avgCostPerToken) {
                    const savings = (avgCostPerToken - altCost) * totalTokens;
                    if (savings > this.options.costOptimizationThreshold * totalCost) {
                        alternatives.push({
                            provider: altProvider,
                            model,
                            currentCost: avgCostPerToken,
                            alternativeCost: altCost,
                            potentialSavings: savings
                        });
                    }
                }
            }
        }

        return {
            provider,
            currentAvgCost: avgCostPerToken,
            alternatives,
            totalSavings: alternatives.reduce((sum, alt) => sum + alt.potentialSavings, 0)
        };
    }

    /**
     * Analyze model alternatives within providers
     */
    analyzeModelAlternatives() {
        const optimizations = new Map();

        // Group usage by provider and model
        const usageByProviderModel = new Map();

        for (const [userId, records] of this.costRecords) {
            for (const record of records) {
                const key = `${record.provider}:${record.model}`;
                if (!usageByProviderModel.has(key)) {
                    usageByProviderModel.set(key, { cost: 0, tokens: 0, records: [] });
                }
                const data = usageByProviderModel.get(key);
                data.cost += record.cost;
                data.tokens += record.tokens;
                data.records.push(record);
            }
        }

        // Find expensive models with cheaper alternatives
        for (const [key, data] of usageByProviderModel) {
            const [provider, model] = key.split(':');
            const pricing = this.providerPricing.get(provider);
            if (!pricing) continue;

            const currentCost = data.cost / data.tokens;

            // Check other models from same provider
            for (const [altModel, altPricing] of Object.entries(pricing)) {
                if (altModel === model) continue;

                const altCost = (altPricing.prompt + altPricing.completion) / 2;
                if (altCost < currentCost) {
                    const savings = (currentCost - altCost) * data.tokens;
                    if (savings > this.options.costOptimizationThreshold * data.cost) {
                        const optKey = `model:${provider}:${model}->${altModel}`;
                        optimizations.set(optKey, {
                            type: 'model_alternative',
                            provider,
                            currentModel: model,
                            alternativeModel: altModel,
                            currentCost,
                            alternativeCost: altCost,
                            potentialSavings: savings,
                            affectedTokens: data.tokens
                        });
                    }
                }
            }
        }

        return optimizations;
    }

    /**
     * Update spending forecasts
     */
    async updateSpendingForecasts() {
        // Simple linear regression for forecasting
        const trends = Array.from(this.spendingTrends.values())
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-30); // Last 30 hours

        if (trends.length < 7) return; // Need at least a week of data

        const costs = trends.map(t => t.totalCost);
        const forecast = this.linearRegressionForecast(costs, 24); // 24 hour forecast

        this.spendingForecast = {
            next24h: forecast,
            confidence: this.calculateForecastConfidence(costs),
            generated: new Date()
        };
    }

    /**
     * Simple linear regression forecast
     */
    linearRegressionForecast(data, periods) {
        const n = data.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = data.reduce((sum, y) => sum + y, 0);
        const sumXY = data.reduce((sum, y, x) => sum + x * y, 0);
        const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return intercept + slope * (n + periods - 1);
    }

    /**
     * Calculate forecast confidence
     */
    calculateForecastConfidence(data) {
        if (data.length < 2) return 0;

        const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
        const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance);

        // Coefficient of variation as confidence measure
        return stdDev / mean;
    }

    /**
     * Generate cost reports
     */
    async generateCostReports() {
        // This would generate and store cost reports
        // For now, just log summary
        const totalSpending = Array.from(this.spendingTrends.values())
            .reduce((sum, trend) => sum + trend.totalCost, 0);

        const optimizationSavings = Array.from(this.costOptimization.values())
            .reduce((sum, opt) => sum + (opt.totalSavings || opt.potentialSavings || 0), 0);

        logger.info('Cost analysis summary', {
            totalSpending: totalSpending.toFixed(2),
            potentialSavings: optimizationSavings.toFixed(2),
            savingsPercent: totalSpending > 0 ? ((optimizationSavings / totalSpending) * 100).toFixed(1) + '%' : '0%'
        });
    }

    /**
     * Get cost analytics
     */
    async getAnalytics(filters = {}) {
        const {
            userId,
            planId,
            provider,
            startDate,
            endDate
        } = filters;

        const result = {
            summary: this.getCostSummary(filters),
            trends: this.getCostTrends(filters),
            optimization: this.getOptimizationRecommendations(filters),
            forecast: this.spendingForecast,
            budgets: this.getBudgetStatus(filters)
        };

        return result;
    }

    /**
     * Get cost summary
     */
    getCostSummary(filters) {
        const start = filters.startDate ? new Date(filters.startDate) :
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = filters.endDate ? new Date(filters.endDate) : new Date();

        let totalCost = 0;
        let totalTokens = 0;
        let requestCount = 0;
        const providerBreakdown = new Map();
        const userBreakdown = new Map();

        for (const [userId, records] of this.costRecords) {
            if (filters.userId && userId !== filters.userId) continue;

            const filtered = records.filter(r => {
                if (r.timestamp < start || r.timestamp > end) return false;
                if (filters.provider && r.provider !== filters.provider) return false;
                if (filters.planId && r.planId !== filters.planId) return false;
                return true;
            });

            const userCost = filtered.reduce((sum, r) => sum + r.cost, 0);
            const userTokens = filtered.reduce((sum, r) => sum + r.tokens, 0);

            if (userCost > 0) {
                totalCost += userCost;
                totalTokens += userTokens;
                requestCount += filtered.length;

                userBreakdown.set(userId, {
                    cost: userCost,
                    tokens: userTokens,
                    requests: filtered.length
                });

                // Provider breakdown
                for (const record of filtered) {
                    if (!providerBreakdown.has(record.provider)) {
                        providerBreakdown.set(record.provider, { cost: 0, tokens: 0, requests: 0 });
                    }
                    const pData = providerBreakdown.get(record.provider);
                    pData.cost += record.cost;
                    pData.tokens += record.tokens;
                    pData.requests++;
                }
            }
        }

        return {
            period: { start, end },
            totalCost,
            totalTokens,
            requestCount,
            averageCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
            averageCostPerRequest: requestCount > 0 ? totalCost / requestCount : 0,
            providerBreakdown: Object.fromEntries(providerBreakdown),
            userBreakdown: Object.fromEntries(userBreakdown)
        };
    }

    /**
     * Get cost trends
     */
    getCostTrends(filters) {
        const trends = Array.from(this.spendingTrends.values())
            .filter(trend => {
                if (filters.startDate && trend.timestamp < new Date(filters.startDate)) return false;
                if (filters.endDate && trend.timestamp > new Date(filters.endDate)) return false;
                return true;
            })
            .sort((a, b) => a.timestamp - b.timestamp)
            .map(trend => ({
                timestamp: trend.timestamp,
                totalCost: trend.totalCost,
                totalTokens: trend.totalTokens,
                providers: Object.fromEntries(trend.providers)
            }));

        return trends;
    }

    /**
     * Get optimization recommendations
     */
    getOptimizationRecommendations(filters) {
        const recommendations = [];

        for (const [key, optimization] of this.costOptimization) {
            if (filters.provider && optimization.provider !== filters.provider) continue;

            recommendations.push({
                id: key,
                ...optimization,
                impact: optimization.totalSavings || optimization.potentialSavings,
                priority: this.calculateOptimizationPriority(optimization)
            });
        }

        return recommendations.sort((a, b) => b.impact - a.impact);
    }

    /**
     * Calculate optimization priority
     */
    calculateOptimizationPriority(optimization) {
        const savings = optimization.totalSavings || optimization.potentialSavings;
        const currentCost = optimization.currentAvgCost || optimization.currentCost;

        // Priority based on savings percentage
        const savingsPercent = currentCost > 0 ? savings / (currentCost * optimization.affectedTokens || 1) : 0;

        if (savingsPercent > 0.5) return 'critical';
        if (savingsPercent > 0.2) return 'high';
        if (savingsPercent > 0.1) return 'medium';
        return 'low';
    }

    /**
     * Get budget status
     */
    getBudgetStatus(filters) {
        const status = {};

        for (const [identifier, budget] of this.budgets) {
            if (filters.userId && identifier !== filters.userId) continue;
            if (filters.planId && identifier !== filters.planId) continue;

            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const currentSpending = identifier.includes('plan') ?
                this.calculatePlanSpending(identifier, monthStart, now) :
                this.calculateSpending(identifier, monthStart, now);

            status[identifier] = {
                budget: budget.monthlyLimit,
                currentSpending: currentSpending.totalCost,
                usagePercent: currentSpending.totalCost / budget.monthlyLimit,
                alertsTriggered: budget.alertsTriggered.length,
                lastAlert: budget.alertsTriggered.length > 0 ?
                    new Date(budget.alertsTriggered[budget.alertsTriggered.length - 1].timestamp) : null
            };
        }

        return status;
    }

    /**
     * Clean up old data
     */
    async cleanup(maxAge = this.options.retentionPeriod) {
        const cutoff = Date.now() - maxAge;
        let cleanedRecords = 0;
        let cleanedTrends = 0;

        // Clean cost records
        for (const [userId, records] of this.costRecords) {
            const filtered = records.filter(record => record.timestamp.getTime() > cutoff);
            cleanedRecords += records.length - filtered.length;
            if (filtered.length === 0) {
                this.costRecords.delete(userId);
            } else {
                this.costRecords.set(userId, filtered);
            }
        }

        // Clean spending trends
        for (const [timestamp, trend] of this.spendingTrends) {
            if (timestamp < cutoff) {
                this.spendingTrends.delete(timestamp);
                cleanedTrends++;
            }
        }

        logger.info(`CostAnalyzer cleanup: removed ${cleanedRecords} records and ${cleanedTrends} trend entries`);
        return { cleanedRecords, cleanedTrends };
    }

    /**
     * Shutdown the cost analyzer
     */
    async shutdown() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
            this.analysisTimer = null;
        }
        logger.info('CostAnalyzer shutdown complete');
    }
}

module.exports = CostAnalyzer;