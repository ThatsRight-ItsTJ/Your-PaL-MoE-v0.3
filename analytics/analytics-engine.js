/**
 * Analytics Engine
 * Main orchestrator for usage analytics and reporting system
 * Coordinates all analytics components and provides unified interface
 */

const logger = require('../utils/logger');
const { metricsCollector } = require('../utils/monitoring');

class AnalyticsEngine {
    constructor(options = {}) {
        this.options = {
            enableRealTime: options.enableRealTime || true,
            reportingInterval: options.reportingInterval || 3600000, // 1 hour
            retentionPeriod: options.retentionPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
            ...options
        };

        this.components = new Map();
        this.isInitialized = false;
        this.reportingTimer = null;

        logger.info('AnalyticsEngine initialized', this.options);
    }

    /**
     * Initialize the analytics engine
     */
    async initialize() {
        try {
            logger.info('Initializing Analytics Engine...');

            // Initialize all analytics components
            await this.initializeComponents();

            // Start periodic reporting if enabled
            if (this.options.enableRealTime) {
                this.startPeriodicReporting();
            }

            this.isInitialized = true;
            logger.info('Analytics Engine initialized successfully');

        } catch (error) {
            logger.error('Failed to initialize Analytics Engine', { error: error.message });
            throw error;
        }
    }

    /**
     * Initialize all analytics components
     */
    async initializeComponents() {
        const components = [
            { name: 'tokenTracker', module: './token-tracker' },
            { name: 'providerAnalytics', module: './provider-analytics' },
            { name: 'costAnalyzer', module: './cost-analyzer' },
            { name: 'forecasting', module: './forecasting' },
            { name: 'reportGenerator', module: './report-generator' },
            { name: 'dashboardData', module: './dashboard-data' }
        ];

        for (const component of components) {
            try {
                const ComponentClass = require(component.module);
                const instance = new ComponentClass(this.options);

                if (typeof instance.initialize === 'function') {
                    await instance.initialize();
                }

                this.components.set(component.name, instance);
                logger.debug(`Initialized analytics component: ${component.name}`);

            } catch (error) {
                logger.error(`Failed to initialize component ${component.name}`, { error: error.message });
                throw error;
            }
        }
    }

    /**
     * Start periodic reporting
     */
    startPeriodicReporting() {
        this.reportingTimer = setInterval(async () => {
            try {
                await this.generatePeriodicReports();
            } catch (error) {
                logger.error('Error in periodic reporting', { error: error.message });
            }
        }, this.options.reportingInterval);

        logger.info(`Started periodic reporting every ${this.options.reportingInterval / 1000}s`);
    }

    /**
     * Stop periodic reporting
     */
    stopPeriodicReporting() {
        if (this.reportingTimer) {
            clearInterval(this.reportingTimer);
            this.reportingTimer = null;
            logger.info('Stopped periodic reporting');
        }
    }

    /**
     * Record usage event
     */
    async recordUsage(event) {
        if (!this.isInitialized) {
            logger.warn('Analytics Engine not initialized, skipping usage record');
            return;
        }

        try {
            const promises = [];

            // Record in token tracker
            if (this.components.has('tokenTracker')) {
                promises.push(this.components.get('tokenTracker').recordUsage(event));
            }

            // Record in provider analytics
            if (this.components.has('providerAnalytics')) {
                promises.push(this.components.get('providerAnalytics').recordUsage(event));
            }

            // Record in cost analyzer
            if (this.components.has('costAnalyzer')) {
                promises.push(this.components.get('costAnalyzer').recordUsage(event));
            }

            await Promise.allSettled(promises);

            // Update system metrics
            if (event.tokens && event.provider) {
                metricsCollector.recordRequest(
                    event.endpoint || 'api',
                    event.provider,
                    event.success !== false,
                    event.responseTime || 0
                );
            }

        } catch (error) {
            logger.error('Error recording usage', { error: error.message, event });
        }
    }

    /**
     * Generate periodic reports
     */
    async generatePeriodicReports() {
        if (!this.components.has('reportGenerator')) {
            return;
        }

        try {
            const reportGenerator = this.components.get('reportGenerator');
            const now = new Date();

            // Generate hourly summary
            await reportGenerator.generateHourlySummary(now);

            // Generate daily summary if it's midnight
            if (now.getHours() === 0) {
                await reportGenerator.generateDailySummary(now);
            }

            // Generate weekly summary if it's Sunday midnight
            if (now.getDay() === 0 && now.getHours() === 0) {
                await reportGenerator.generateWeeklySummary(now);
            }

            logger.debug('Generated periodic reports');

        } catch (error) {
            logger.error('Error generating periodic reports', { error: error.message });
        }
    }

    /**
     * Get analytics dashboard data
     */
    async getDashboardData(timeRange = '24h') {
        if (!this.components.has('dashboardData')) {
            throw new Error('Dashboard data component not available');
        }

        return await this.components.get('dashboardData').getDashboardData(timeRange);
    }

    /**
     * Generate custom report
     */
    async generateReport(type, options = {}) {
        if (!this.components.has('reportGenerator')) {
            throw new Error('Report generator component not available');
        }

        return await this.components.get('reportGenerator').generateReport(type, options);
    }

    /**
     * Get usage analytics
     */
    async getUsageAnalytics(filters = {}) {
        const results = {};

        // Get token usage analytics
        if (this.components.has('tokenTracker')) {
            results.tokenUsage = await this.components.get('tokenTracker').getAnalytics(filters);
        }

        // Get provider analytics
        if (this.components.has('providerAnalytics')) {
            results.providerAnalytics = await this.components.get('providerAnalytics').getAnalytics(filters);
        }

        // Get cost analytics
        if (this.components.has('costAnalyzer')) {
            results.costAnalytics = await this.components.get('costAnalyzer').getAnalytics(filters);
        }

        // Get forecasting data
        if (this.components.has('forecasting')) {
            results.forecasting = await this.components.get('forecasting').getForecasts(filters);
        }

        return results;
    }

    /**
     * Get system health and performance metrics
     */
    getSystemMetrics() {
        return metricsCollector.getMetrics();
    }

    /**
     * Clean up old data
     */
    async cleanup(maxAge = this.options.retentionPeriod) {
        const promises = [];

        for (const [name, component] of this.components) {
            if (typeof component.cleanup === 'function') {
                promises.push(
                    component.cleanup(maxAge).catch(error => {
                        logger.error(`Error cleaning up component ${name}`, { error: error.message });
                    })
                );
            }
        }

        await Promise.allSettled(promises);
        logger.info('Analytics cleanup completed');
    }

    /**
     * Export analytics data
     */
    async exportData(format = 'json', options = {}) {
        if (!this.components.has('reportGenerator')) {
            throw new Error('Report generator component not available');
        }

        return await this.components.get('reportGenerator').exportData(format, options);
    }

    /**
     * Shutdown the analytics engine
     */
    async shutdown() {
        logger.info('Shutting down Analytics Engine...');

        this.stopPeriodicReporting();

        const promises = [];
        for (const [name, component] of this.components) {
            if (typeof component.shutdown === 'function') {
                promises.push(
                    component.shutdown().catch(error => {
                        logger.error(`Error shutting down component ${name}`, { error: error.message });
                    })
                );
            }
        }

        await Promise.allSettled(promises);
        this.isInitialized = false;

        logger.info('Analytics Engine shutdown complete');
    }
}

module.exports = AnalyticsEngine;