/**
 * Analytics System Unit Tests
 * Tests for the Usage Analytics and Reporting System components
 */

const AnalyticsEngine = require('../../analytics/analytics-engine');
const TokenTracker = require('../../analytics/token-tracker');
const ProviderAnalytics = require('../../analytics/provider-analytics');
const CostAnalyzer = require('../../analytics/cost-analyzer');
const ForecastingEngine = require('../../analytics/forecasting');
const ReportGenerator = require('../../analytics/report-generator');
const DashboardDataAggregator = require('../../analytics/dashboard-data');

describe('Usage Analytics and Reporting System', () => {
    let analyticsEngine;
    let tokenTracker;
    let providerAnalytics;
    let costAnalyzer;
    let forecastingEngine;
    let reportGenerator;
    let dashboardData;

    beforeAll(async () => {
        // Initialize all components
        tokenTracker = new TokenTracker();
        providerAnalytics = new ProviderAnalytics();
        costAnalyzer = new CostAnalyzer();
        forecastingEngine = new ForecastingEngine();
        reportGenerator = new ReportGenerator();
        dashboardData = new DashboardDataAggregator();

        analyticsEngine = new AnalyticsEngine({
            enableRealTime: false // Disable for testing
        });

        // Initialize components
        await tokenTracker.initialize();
        await providerAnalytics.initialize();
        await costAnalyzer.initialize();
        await forecastingEngine.initialize();
        await reportGenerator.initialize();
        await dashboardData.initialize();
        await analyticsEngine.initialize();
    });

    afterAll(async () => {
        // Cleanup
        await analyticsEngine.shutdown();
        await tokenTracker.shutdown();
        await providerAnalytics.shutdown();
        await costAnalyzer.shutdown();
        await forecastingEngine.shutdown();
        await reportGenerator.shutdown();
        await dashboardData.shutdown();
    });

    describe('AnalyticsEngine', () => {
        test('should initialize successfully', () => {
            expect(analyticsEngine.isInitialized).toBe(true);
        });

        test('should record usage events', async () => {
            const event = {
                userId: 'user123',
                provider: 'openai',
                model: 'gpt-4',
                tokens: 150,
                promptTokens: 50,
                completionTokens: 100,
                cost: 0.03,
                success: true,
                responseTime: 1200
            };

            await analyticsEngine.recordUsage(event);
            expect(true).toBe(true); // Should not throw
        });

        test('should get usage analytics', async () => {
            const analytics = await analyticsEngine.getUsageAnalytics();
            expect(analytics).toHaveProperty('tokenUsage');
            expect(analytics).toHaveProperty('providerAnalytics');
            expect(analytics).toHaveProperty('costAnalytics');
            expect(analytics).toHaveProperty('forecasting');
        });

        test('should get dashboard data', async () => {
            const data = await analyticsEngine.getDashboardData('24h');
            expect(data).toHaveProperty('metadata');
            expect(data).toHaveProperty('summary');
            expect(data).toHaveProperty('charts');
        });

        test('should get system metrics', () => {
            const metrics = analyticsEngine.getSystemMetrics();
            expect(metrics).toHaveProperty('requests');
            expect(metrics).toHaveProperty('performance');
            expect(metrics).toHaveProperty('system');
        });
    });

    describe('TokenTracker', () => {
        test('should record token usage', async () => {
            const event = {
                userId: 'user456',
                planId: 'premium',
                provider: 'anthropic',
                model: 'claude-3-opus',
                tokens: 200,
                promptTokens: 80,
                completionTokens: 120,
                cost: 0.04,
                success: true,
                timestamp: new Date()
            };

            await tokenTracker.recordUsage(event);
            expect(true).toBe(true); // Should not throw
        });

        test('should get usage analytics', async () => {
            const analytics = await tokenTracker.getAnalytics();
            expect(analytics).toHaveProperty('summary');
            expect(analytics).toHaveProperty('trends');
            expect(analytics).toHaveProperty('topUsers');
            expect(analytics).toHaveProperty('topProviders');
            expect(analytics).toHaveProperty('efficiency');
        });

        test('should get summary stats', () => {
            const summary = tokenTracker.getSummaryStats();
            expect(summary).toHaveProperty('totalTokens');
            expect(summary).toHaveProperty('totalCost');
            expect(summary).toHaveProperty('requestCount');
            expect(summary).toHaveProperty('userCount');
        });

        test('should get usage trends', () => {
            const trends = tokenTracker.getUsageTrends();
            expect(Array.isArray(trends)).toBe(true);
        });

        test('should get top users', () => {
            const topUsers = tokenTracker.getTopUsers();
            expect(Array.isArray(topUsers)).toBe(true);
        });

        test('should get top providers', () => {
            const topProviders = tokenTracker.getTopProviders();
            expect(Array.isArray(topProviders)).toBe(true);
        });

        test('should get efficiency metrics', () => {
            const efficiency = tokenTracker.getEfficiencyMetrics();
            expect(efficiency).toHaveProperty('averageTokensPerRequest');
            expect(efficiency).toHaveProperty('costEfficiency');
        });
    });

    describe('ProviderAnalytics', () => {
        test('should record provider usage', async () => {
            const event = {
                provider: 'google',
                model: 'gemini-pro',
                success: true,
                responseTime: 800,
                errorType: null,
                errorMessage: null,
                tokens: 100,
                cost: 0.001,
                timestamp: new Date()
            };

            await providerAnalytics.recordUsage(event);
            expect(true).toBe(true); // Should not throw
        });

        test('should get provider analytics', async () => {
            const analytics = await providerAnalytics.getAnalytics();
            expect(analytics).toHaveProperty('summary');
            expect(analytics).toHaveProperty('performance');
            expect(analytics).toHaveProperty('reliability');
            expect(analytics).toHaveProperty('costAnalysis');
            expect(analytics).toHaveProperty('recommendations');
        });

        test('should calculate provider uptime', () => {
            const uptime = providerAnalytics.calculateUptime('openai');
            expect(typeof uptime).toBe('number');
            expect(uptime).toBeGreaterThanOrEqual(0);
            expect(uptime).toBeLessThanOrEqual(1);
        });

        test('should analyze failure patterns', () => {
            const analysis = providerAnalytics.analyzeFailurePatterns('openai');
            expect(analysis).toHaveProperty('patterns');
            expect(analysis).toHaveProperty('riskLevel');
        });

        test('should get error distribution', () => {
            const distribution = providerAnalytics.getErrorDistribution('openai');
            expect(distribution).toHaveProperty('errorTypes');
            expect(distribution).toHaveProperty('errorMessages');
        });

        test('should calculate cost efficiency', () => {
            const efficiency = providerAnalytics.calculateCostEfficiency('openai');
            expect(efficiency).toHaveProperty('costPerToken');
            expect(efficiency).toHaveProperty('efficiency');
        });

        test('should generate recommendations', () => {
            const metrics = {
                totalRequests: 100,
                successfulRequests: 95,
                totalTokens: 1000,
                totalCost: 10,
                averageResponseTime: 1000,
                successRate: 0.95
            };

            const recommendations = providerAnalytics.generateRecommendations('openai', metrics);
            expect(Array.isArray(recommendations)).toBe(true);
        });
    });

    describe('CostAnalyzer', () => {
        test('should record cost usage', async () => {
            const event = {
                userId: 'user789',
                planId: 'basic',
                provider: 'openai',
                model: 'gpt-3.5-turbo',
                tokens: 300,
                promptTokens: 100,
                completionTokens: 200,
                cost: 0.006,
                timestamp: new Date()
            };

            await costAnalyzer.recordUsage(event);
            expect(true).toBe(true); // Should not throw
        });

        test('should set budget', () => {
            costAnalyzer.setBudget('user123', { monthlyLimit: 50 });
            expect(true).toBe(true); // Should not throw
        });

        test('should get cost analytics', async () => {
            const analytics = await costAnalyzer.getAnalytics();
            expect(analytics).toHaveProperty('summary');
            expect(analytics).toHaveProperty('trends');
            expect(analytics).toHaveProperty('optimization');
            expect(analytics).toHaveProperty('forecast');
            expect(analytics).toHaveProperty('budgets');
        });

        test('should get cost summary', () => {
            const summary = costAnalyzer.getCostSummary();
            expect(summary).toHaveProperty('totalCost');
            expect(summary).toHaveProperty('totalTokens');
            expect(summary).toHaveProperty('requestCount');
            expect(summary).toHaveProperty('averageCostPerToken');
        });

        test('should get cost trends', () => {
            const trends = costAnalyzer.getCostTrends();
            expect(Array.isArray(trends)).toBe(true);
        });

        test('should get optimization recommendations', () => {
            const recommendations = costAnalyzer.getOptimizationRecommendations();
            expect(Array.isArray(recommendations)).toBe(true);
        });

        test('should calculate spending', () => {
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const endDate = new Date();
            const spending = costAnalyzer.calculateSpending('user123', startDate, endDate);
            expect(spending).toHaveProperty('totalCost');
            expect(spending).toHaveProperty('totalTokens');
            expect(spending).toHaveProperty('requestCount');
        });

        test('should calculate plan spending', () => {
            const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const endDate = new Date();
            const spending = costAnalyzer.calculatePlanSpending('premium', startDate, endDate);
            expect(spending).toHaveProperty('totalCost');
            expect(spending).toHaveProperty('totalTokens');
            expect(spending).toHaveProperty('requestCount');
        });
    });

    describe('ForecastingEngine', () => {
        test('should record forecast data', async () => {
            await forecastingEngine.recordData('token_usage', 1500, new Date());
            await forecastingEngine.recordData('cost_trend', 25.50, new Date());
            expect(true).toBe(true); // Should not throw
        });

        test('should generate forecasts', async () => {
            await forecastingEngine.generateForecasts();
            expect(true).toBe(true); // Should not throw
        });

        test('should get forecast', () => {
            const forecast = forecastingEngine.getForecast('token_usage');
            // May be null if insufficient data
            if (forecast) {
                expect(forecast).toHaveProperty('forecast');
                expect(forecast).toHaveProperty('confidenceIntervals');
                expect(forecast).toHaveProperty('analysis');
            }
        });

        test('should get forecasts for multiple metrics', async () => {
            const forecasts = await forecastingEngine.getForecasts();
            expect(typeof forecasts).toBe('object');
        });

        test('should analyze time series', () => {
            const data = [
                { timestamp: new Date(), value: 100 },
                { timestamp: new Date(Date.now() - 3600000), value: 110 },
                { timestamp: new Date(Date.now() - 7200000), value: 105 }
            ];

            const analysis = forecastingEngine.analyzeTimeSeries(data);
            expect(analysis).toHaveProperty('trend');
            expect(analysis).toHaveProperty('seasonality');
            expect(analysis).toHaveProperty('volatility');
            expect(analysis).toHaveProperty('model');
        });

        test('should detect trend', () => {
            const values = [100, 110, 120, 130, 140];
            const trend = forecastingEngine.detectTrend(values);
            expect(trend).toHaveProperty('slope');
            expect(trend).toHaveProperty('direction');
        });

        test('should calculate correlation', () => {
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
            const correlation = forecastingEngine.calculateCorrelation(values, 1);
            expect(typeof correlation).toBe('number');
            expect(correlation).toBeGreaterThan(0.9); // Should be highly correlated
        });

        test('should calculate volatility', () => {
            const values = [100, 105, 95, 110, 90];
            const volatility = forecastingEngine.calculateVolatility(values);
            expect(typeof volatility).toBe('number');
            expect(volatility).toBeGreaterThan(0);
        });

        test('should get forecast insights', () => {
            const insights = forecastingEngine.getInsights('token_usage');
            // May be null if no forecast available
            if (insights) {
                expect(insights).toHaveProperty('trend');
                expect(insights).toHaveProperty('seasonality');
                expect(insights).toHaveProperty('recommendations');
            }
        });
    });

    describe('ReportGenerator', () => {
        test('should generate usage summary report', async () => {
            const result = await reportGenerator.generateReport('usage_summary');
            expect(result).toHaveProperty('reportId');
            expect(result).toHaveProperty('metadata');
            expect(result).toHaveProperty('files');
        });

        test('should generate cost analysis report', async () => {
            const result = await reportGenerator.generateReport('cost_analysis');
            expect(result).toHaveProperty('reportId');
            expect(result).toHaveProperty('metadata');
            expect(result).toHaveProperty('files');
        });

        test('should generate hourly summary', async () => {
            const result = await reportGenerator.generateHourlySummary();
            expect(result).toHaveProperty('reportId');
            expect(result).toHaveProperty('metadata');
        });

        test('should generate daily summary', async () => {
            const result = await reportGenerator.generateDailySummary();
            expect(result).toHaveProperty('reportId');
            expect(result).toHaveProperty('metadata');
        });

        test('should generate weekly summary', async () => {
            const result = await reportGenerator.generateWeeklySummary();
            expect(result).toHaveProperty('reportId');
            expect(result).toHaveProperty('metadata');
        });

        test('should export data as JSON', async () => {
            const data = await reportGenerator.exportData('json');
            expect(typeof data).toBe('string');
            const parsed = JSON.parse(data);
            expect(typeof parsed).toBe('object');
        });

        test('should export data as CSV', async () => {
            const data = await reportGenerator.exportData('csv');
            expect(typeof data).toBe('string');
            expect(data.includes(',')).toBe(true);
        });

        test('should get report history', () => {
            const history = reportGenerator.getReportHistory();
            expect(Array.isArray(history)).toBe(true);
        });

        test('should generate unique report IDs', () => {
            const id1 = reportGenerator.generateReportId('test');
            const id2 = reportGenerator.generateReportId('test');
            expect(id1).not.toBe(id2);
            expect(id1.startsWith('test_')).toBe(true);
        });
    });

    describe('DashboardDataAggregator', () => {
        test('should get dashboard data', async () => {
            const data = await dashboardData.getDashboardData('24h');
            expect(data).toHaveProperty('metadata');
            expect(data).toHaveProperty('summary');
            expect(data).toHaveProperty('charts');
            expect(data).toHaveProperty('alerts');
            expect(data).toHaveProperty('recommendations');
            expect(data).toHaveProperty('realTime');
        });

        test('should cache dashboard data', async () => {
            const data1 = await dashboardData.getDashboardData('24h');
            const data2 = await dashboardData.getDashboardData('24h');
            expect(data1).toEqual(data2); // Should return cached data
        });

        test('should get real-time metrics', async () => {
            const metrics = await dashboardData.getRealTimeMetrics();
            expect(metrics).toHaveProperty('activeConnections');
            expect(metrics).toHaveProperty('requestsPerSecond');
            expect(metrics).toHaveProperty('currentLoad');
            expect(metrics).toHaveProperty('timestamp');
        });

        test('should get active alerts', async () => {
            const alerts = await dashboardData.getActiveAlerts();
            expect(Array.isArray(alerts)).toBe(true);
            if (alerts.length > 0) {
                expect(alerts[0]).toHaveProperty('id');
                expect(alerts[0]).toHaveProperty('level');
                expect(alerts[0]).toHaveProperty('message');
            }
        });

        test('should get top recommendations', async () => {
            const recommendations = await dashboardData.getTopRecommendations();
            expect(Array.isArray(recommendations)).toBe(true);
            if (recommendations.length > 0) {
                expect(recommendations[0]).toHaveProperty('id');
                expect(recommendations[0]).toHaveProperty('type');
                expect(recommendations[0]).toHaveProperty('priority');
                expect(recommendations[0]).toHaveProperty('message');
            }
        });

        test('should export dashboard data', async () => {
            const jsonData = await dashboardData.exportDashboardData('24h', 'json');
            expect(typeof jsonData).toBe('string');
            const parsed = JSON.parse(jsonData);
            expect(parsed).toHaveProperty('metadata');

            const csvData = await dashboardData.exportDashboardData('24h', 'csv');
            expect(typeof csvData).toBe('string');
            expect(csvData.includes(',')).toBe(true);
        });

        test('should get dashboard configuration', () => {
            const config = dashboardData.getDashboardConfig();
            expect(config).toHaveProperty('timeRanges');
            expect(config).toHaveProperty('refreshInterval');
            expect(config).toHaveProperty('charts');
            expect(Array.isArray(config.timeRanges)).toBe(true);
        });

        test('should handle real-time updates', () => {
            const updates = dashboardData.getRealTimeUpdates();
            expect(updates).toHaveProperty('onUpdate');
            expect(updates).toHaveProperty('offUpdate');
            expect(typeof updates.onUpdate).toBe('function');
            expect(typeof updates.offUpdate).toBe('function');
        });
    });

    describe('Integration Tests', () => {
        test('should handle end-to-end usage tracking', async () => {
            const event = {
                userId: 'integration_test_user',
                planId: 'integration_test_plan',
                provider: 'integration_test_provider',
                model: 'integration_test_model',
                tokens: 500,
                promptTokens: 200,
                completionTokens: 300,
                cost: 0.10,
                success: true,
                responseTime: 1500,
                timestamp: new Date()
            };

            // Record usage through analytics engine
            await analyticsEngine.recordUsage(event);

            // Verify data is available in components
            const usageAnalytics = await analyticsEngine.getUsageAnalytics();
            expect(usageAnalytics).toBeDefined();

            // Check dashboard data
            const dashboard = await analyticsEngine.getDashboardData('24h');
            expect(dashboard).toBeDefined();
            expect(dashboard.summary.totalRequests).toBeGreaterThanOrEqual(0);
        });

        test('should generate comprehensive reports', async () => {
            // Generate multiple types of reports
            const reports = await Promise.all([
                reportGenerator.generateReport('usage_summary'),
                reportGenerator.generateReport('cost_analysis'),
                reportGenerator.generateReport('performance_dashboard')
            ]);

            expect(reports).toHaveLength(3);
            reports.forEach(report => {
                expect(report).toHaveProperty('reportId');
                expect(report).toHaveProperty('metadata');
                expect(report.metadata.formats.length).toBeGreaterThan(0);
            });
        });

        test('should handle forecasting workflow', async () => {
            // Record some historical data
            const baseTime = Date.now();
            for (let i = 0; i < 10; i++) {
                await forecastingEngine.recordData(
                    'integration_forecast',
                    100 + i * 10,
                    new Date(baseTime - (9 - i) * 60 * 60 * 1000)
                );
            }

            // Generate forecast
            await forecastingEngine.generateForecasts();

            // Get forecast
            const forecast = forecastingEngine.getForecast('integration_forecast');
            if (forecast) {
                expect(forecast.forecast).toBeDefined();
                expect(forecast.confidenceIntervals).toBeDefined();
                expect(forecast.analysis).toBeDefined();
            }
        });

        test('should handle cost optimization workflow', async () => {
            // Set a budget
            costAnalyzer.setBudget('budget_test_user', { monthlyLimit: 100 });

            // Record some expensive usage
            await costAnalyzer.recordUsage({
                userId: 'budget_test_user',
                provider: 'expensive_provider',
                tokens: 1000,
                cost: 5.00,
                timestamp: new Date()
            });

            // Check budget status
            const budgets = costAnalyzer.getBudgetStatus();
            expect(budgets).toHaveProperty('budget_test_user');

            // Get optimization recommendations
            const recommendations = costAnalyzer.getOptimizationRecommendations();
            expect(Array.isArray(recommendations)).toBe(true);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid usage events gracefully', async () => {
            const invalidEvent = {
                // Missing required fields
                tokens: 'not_a_number',
                provider: null
            };

            await expect(analyticsEngine.recordUsage(invalidEvent)).resolves.not.toThrow();
        });

        test('should handle missing forecast data', () => {
            const forecast = forecastingEngine.getForecast('nonexistent_metric');
            expect(forecast).toBeNull();
        });

        test('should handle invalid report types', async () => {
            await expect(reportGenerator.generateReport('invalid_type')).rejects.toThrow();
        });

        test('should handle invalid export formats', async () => {
            await expect(dashboardData.exportDashboardData('24h', 'invalid')).rejects.toThrow();
        });
    });

    describe('Performance Tests', () => {
        test('should handle multiple concurrent usage records', async () => {
            const events = Array.from({ length: 100 }, (_, i) => ({
                userId: `perf_user_${i}`,
                provider: 'openai',
                model: 'gpt-4',
                tokens: Math.floor(Math.random() * 1000) + 100,
                cost: Math.random() * 0.1,
                success: Math.random() > 0.1,
                responseTime: Math.floor(Math.random() * 5000) + 500,
                timestamp: new Date()
            }));

            const startTime = Date.now();
            await Promise.all(events.map(event => analyticsEngine.recordUsage(event)));
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });

        test('should handle large datasets efficiently', async () => {
            // Generate large amount of historical data
            const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                userId: 'large_dataset_user',
                provider: 'test_provider',
                tokens: 100,
                cost: 0.01,
                timestamp: new Date(Date.now() - i * 60 * 1000) // One per minute
            }));

            const startTime = Date.now();
            await Promise.all(largeDataset.map(event => tokenTracker.recordUsage(event)));
            const duration = Date.now() - startTime;

            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds

            // Verify analytics still work
            const analytics = await tokenTracker.getAnalytics();
            expect(analytics.summary.totalTokens).toBeGreaterThan(0);
        });
    });
});