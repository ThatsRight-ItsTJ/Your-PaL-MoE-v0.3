/**
 * Update Reporting
 * Handles update reporting and statistics generation
 */

const logger = require('../utils/logger');
const { metricsCollector } = require('../utils/monitoring');

class UpdateReporting {
    constructor(updateScheduler) {
        this.updateScheduler = updateScheduler;
        this.isInitialized = false;

        // Reporting configuration
        this.config = {
            reportInterval: 60 * 60 * 1000, // 1 hour
            retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
            enableEmailReports: false,
            enableFileReports: true,
            reportPath: './reports',
            includeMetrics: true,
            includeCharts: false,
            compressReports: true
        };

        // Report data
        this.reports = new Map();
        this.reportHistory = [];
        this.lastReportTime = null;

        // Statistics
        this.stats = {
            totalReports: 0,
            reportsGenerated: 0,
            reportsFailed: 0,
            averageReportTime: 0,
            totalReportSize: 0
        };

        logger.info('UpdateReporting initialized');
    }

    /**
     * Initialize the reporting system
     */
    async initialize(updateScheduler) {
        if (this.isInitialized) return;

        this.updateScheduler = updateScheduler || this.updateScheduler;

        // Ensure report directory exists
        await this.ensureReportDirectory();

        this.isInitialized = true;
        logger.info('UpdateReporting initialized successfully');
    }

    /**
     * Generate update report
     */
    async generateReport(options = {}) {
        const startTime = Date.now();
        const reportId = `report-${Date.now()}`;

        logger.info('Generating update report', { reportId, options });

        try {
            // Collect report data
            const reportData = await this.collectReportData(options);

            // Generate report content
            const report = this.formatReport(reportData, reportId, options);

            // Store report
            this.reports.set(reportId, {
                id: reportId,
                timestamp: new Date(),
                data: reportData,
                content: report,
                options
            });

            // Save report to file if enabled
            if (this.config.enableFileReports) {
                await this.saveReportToFile(report, reportId);
            }

            // Update statistics
            this.stats.totalReports++;
            this.stats.reportsGenerated++;
            this.lastReportTime = new Date();

            const duration = Date.now() - startTime;
            this.stats.averageReportTime = (this.stats.averageReportTime + duration) / 2;

            // Record metrics
            metricsCollector.recordRequest('report-generation', null, true, duration);

            // Record report history
            this.recordReportHistory({
                reportId,
                timestamp: new Date(),
                success: true,
                duration,
                size: report.length,
                options
            });

            logger.info('Update report generated successfully', {
                reportId,
                duration,
                size: report.length
            });

            return {
                reportId,
                report,
                data: reportData,
                duration
            };

        } catch (error) {
            logger.error(`Report generation failed: ${error.message}`, { reportId });
            this.stats.reportsFailed++;

            metricsCollector.recordRequest('report-generation', null, false, Date.now() - startTime);

            this.recordReportHistory({
                reportId,
                timestamp: new Date(),
                success: false,
                error: error.message,
                options
            });

            throw error;
        }
    }

    /**
     * Collect report data from all components
     */
    async collectReportData(options) {
        const data = {
            timestamp: new Date().toISOString(),
            period: options.period || 'last_24h',
            system: {},
            scheduler: {},
            catalog: {},
            health: {},
            config: {},
            cleanup: {},
            metrics: {}
        };

        try {
            // System information
            data.system = await this.collectSystemInfo();

            // Scheduler statistics
            if (this.updateScheduler) {
                data.scheduler = this.updateScheduler.getStats();
            }

            // Catalog updater stats
            if (this.updateScheduler.catalogUpdater) {
                data.catalog = this.updateScheduler.catalogUpdater.getStats();
            }

            // Health checker stats
            if (this.updateScheduler.healthChecker) {
                data.health = this.updateScheduler.healthChecker.getHealthStatus();
            }

            // Config sync stats
            if (this.updateScheduler.configSync) {
                data.config = this.updateScheduler.configSync.getStats();
            }

            // Cleanup manager stats
            if (this.updateScheduler.cleanupManager) {
                data.cleanup = this.updateScheduler.cleanupManager.getStats();
            }

            // Metrics data
            if (this.config.includeMetrics) {
                data.metrics = metricsCollector.getMetrics();
            }

        } catch (error) {
            logger.warn(`Failed to collect some report data: ${error.message}`);
        }

        return data;
    }

    /**
     * Collect system information
     */
    async collectSystemInfo() {
        return {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            platform: process.platform,
            version: process.version,
            pid: process.pid
        };
    }

    /**
     * Format report content
     */
    formatReport(data, reportId, options) {
        const lines = [];

        // Header
        lines.push('='.repeat(80));
        lines.push('AUTOMATED UPDATE SCHEDULER REPORT');
        lines.push('='.repeat(80));
        lines.push(`Report ID: ${reportId}`);
        lines.push(`Generated: ${data.timestamp}`);
        lines.push(`Period: ${data.period}`);
        lines.push('');

        // System Information
        lines.push('SYSTEM INFORMATION');
        lines.push('-'.repeat(20));
        lines.push(`Uptime: ${this.formatDuration(data.system.uptime || 0)}`);
        lines.push(`Memory Usage: ${this.formatBytes(data.system.memory?.heapUsed || 0)} / ${this.formatBytes(data.system.memory?.heapTotal || 0)}`);
        lines.push(`Platform: ${data.system.platform} (${data.system.version})`);
        lines.push(`Process ID: ${data.system.pid}`);
        lines.push('');

        // Scheduler Statistics
        if (data.scheduler) {
            lines.push('SCHEDULER STATISTICS');
            lines.push('-'.repeat(20));
            lines.push(`Status: ${data.scheduler.isRunning ? 'Running' : 'Stopped'}`);
            lines.push(`Total Updates: ${data.scheduler.totalUpdates || 0}`);
            lines.push(`Successful Updates: ${data.scheduler.successfulUpdates || 0}`);
            lines.push(`Failed Updates: ${data.scheduler.failedUpdates || 0}`);
            lines.push(`Active Jobs: ${data.scheduler.activeJobs || 0}`);
            lines.push(`Average Update Time: ${this.formatDuration(data.scheduler.averageUpdateTime / 1000 || 0)}`);
            lines.push(`Last Global Update: ${data.scheduler.lastGlobalUpdate || 'Never'}`);
            lines.push('');
        }

        // Catalog Update Statistics
        if (data.catalog) {
            lines.push('CATALOG UPDATE STATISTICS');
            lines.push('-'.repeat(25));
            lines.push(`Total Updates: ${data.catalog.totalUpdates || 0}`);
            lines.push(`Successful Updates: ${data.catalog.successfulUpdates || 0}`);
            lines.push(`Failed Updates: ${data.catalog.failedUpdates || 0}`);
            lines.push(`Models Added: ${data.catalog.modelsAdded || 0}`);
            lines.push(`Models Updated: ${data.catalog.modelsUpdated || 0}`);
            lines.push(`Models Removed: ${data.catalog.modelsRemoved || 0}`);
            lines.push(`Average Update Time: ${this.formatDuration(data.catalog.averageUpdateTime / 1000 || 0)}`);
            lines.push(`Last Full Update: ${data.catalog.lastFullUpdate || 'Never'}`);
            lines.push('');
        }

        // Health Check Statistics
        if (data.health && data.health.summary) {
            lines.push('HEALTH CHECK STATISTICS');
            lines.push('-'.repeat(23));
            lines.push(`Total Providers: ${data.health.summary.totalProviders || 0}`);
            lines.push(`Healthy: ${data.health.summary.healthy || 0}`);
            lines.push(`Unhealthy: ${data.health.summary.unhealthy || 0}`);
            lines.push(`Unknown: ${data.health.summary.unknown || 0}`);
            lines.push(`Overall Status: ${data.health.summary.overallStatus || 'unknown'}`);
            lines.push(`Total Checks: ${data.health.stats?.totalChecks || 0}`);
            lines.push(`Average Response Time: ${this.formatDuration(data.health.stats?.averageResponseTime / 1000 || 0)}`);
            lines.push('');
        }

        // Configuration Sync Statistics
        if (data.config) {
            lines.push('CONFIGURATION SYNC STATISTICS');
            lines.push('-'.repeat(29));
            lines.push(`Total Syncs: ${data.config.totalSyncs || 0}`);
            lines.push(`Successful Syncs: ${data.config.successfulSyncs || 0}`);
            lines.push(`Failed Syncs: ${data.config.failedSyncs || 0}`);
            lines.push(`Files Synced: ${data.config.filesSynced || 0}`);
            lines.push(`Backups Created: ${data.config.backupsCreated || 0}`);
            lines.push(`Average Sync Time: ${this.formatDuration(data.config.averageSyncTime / 1000 || 0)}`);
            lines.push(`Last Sync: ${data.config.lastSyncTime || 'Never'}`);
            lines.push('');
        }

        // Cleanup Statistics
        if (data.cleanup) {
            lines.push('CLEANUP STATISTICS');
            lines.push('-'.repeat(18));
            lines.push(`Total Cleanups: ${data.cleanup.totalCleanups || 0}`);
            lines.push(`Successful Cleanups: ${data.cleanup.successfulCleanups || 0}`);
            lines.push(`Failed Cleanups: ${data.cleanup.failedCleanups || 0}`);
            lines.push(`Models Removed: ${data.cleanup.modelsRemoved || 0}`);
            lines.push(`Providers Removed: ${data.cleanup.providersRemoved || 0}`);
            lines.push(`Files Removed: ${data.cleanup.filesRemoved || 0}`);
            lines.push(`Cache Cleared: ${data.cleanup.cacheCleared || 0}`);
            lines.push(`Average Cleanup Time: ${this.formatDuration(data.cleanup.averageCleanupTime / 1000 || 0)}`);
            lines.push(`Last Cleanup: ${data.cleanup.lastCleanupTime || 'Never'}`);
            lines.push('');
        }

        // Performance Metrics
        if (data.metrics && options.includeMetrics !== false) {
            lines.push('PERFORMANCE METRICS');
            lines.push('-'.repeat(19));
            lines.push(`Total Requests: ${data.metrics.requests?.total || 0}`);
            lines.push(`Success Rate: ${((data.metrics.requests?.successRate || 0) * 100).toFixed(2)}%`);
            lines.push(`Average Response Time: ${this.formatDuration(data.metrics.performance?.averageResponseTime / 1000 || 0)}`);
            lines.push(`95th Percentile: ${this.formatDuration(data.metrics.performance?.p95ResponseTime / 1000 || 0)}`);
            lines.push(`99th Percentile: ${this.formatDuration(data.metrics.performance?.p99ResponseTime / 1000 || 0)}`);
            lines.push('');
        }

        // Recommendations
        const recommendations = this.generateRecommendations(data);
        if (recommendations.length > 0) {
            lines.push('RECOMMENDATIONS');
            lines.push('-'.repeat(15));
            recommendations.forEach(rec => {
                lines.push(`• ${rec}`);
            });
            lines.push('');
        }

        // Footer
        lines.push('='.repeat(80));
        lines.push('End of Report');
        lines.push('='.repeat(80));

        return lines.join('\n');
    }

    /**
     * Generate recommendations based on report data
     */
    generateRecommendations(data) {
        const recommendations = [];

        // Check scheduler health
        if (data.scheduler) {
            const failureRate = data.scheduler.totalUpdates > 0 ?
                data.scheduler.failedUpdates / data.scheduler.totalUpdates : 0;

            if (failureRate > 0.1) {
                recommendations.push('High update failure rate detected. Review error logs and consider adjusting retry policies.');
            }

            if (!data.scheduler.isRunning) {
                recommendations.push('Update scheduler is not running. Start the scheduler to ensure system freshness.');
            }
        }

        // Check health status
        if (data.health && data.health.summary) {
            if (data.health.summary.unhealthy > 0) {
                recommendations.push(`${data.health.summary.unhealthy} providers are unhealthy. Investigate and resolve connectivity issues.`);
            }
        }

        // Check cleanup status
        if (data.cleanup) {
            const timeSinceLastCleanup = data.cleanup.lastCleanupTime ?
                Date.now() - new Date(data.cleanup.lastCleanupTime).getTime() : Infinity;

            if (timeSinceLastCleanup > 48 * 60 * 60 * 1000) { // 48 hours
                recommendations.push('Cleanup has not run recently. Consider running cleanup to free up resources.');
            }
        }

        // Check performance
        if (data.metrics && data.metrics.performance) {
            if (data.metrics.performance.averageResponseTime > 5000) { // 5 seconds
                recommendations.push('Average response time is high. Consider optimizing performance or scaling resources.');
            }
        }

        return recommendations;
    }

    /**
     * Save report to file
     */
    async saveReportToFile(reportContent, reportId) {
        try {
            const fileName = `${reportId}.txt`;
            const filePath = path.join(this.config.reportPath, fileName);

            await fs.writeFile(filePath, reportContent, 'utf8');
            this.stats.totalReportSize += reportContent.length;

            logger.debug(`Report saved to file: ${filePath}`);

        } catch (error) {
            logger.warn(`Failed to save report to file: ${error.message}`);
        }
    }

    /**
     * Ensure report directory exists
     */
    async ensureReportDirectory() {
        try {
            await fs.mkdir(this.config.reportPath, { recursive: true });
        } catch (error) {
            logger.warn(`Failed to create report directory: ${error.message}`);
        }
    }

    /**
     * Format duration in human readable format
     */
    formatDuration(seconds) {
        if (seconds < 60) return `${seconds.toFixed(2)}s`;
        if (seconds < 3600) return `${(seconds / 60).toFixed(2)}m`;
        if (seconds < 86400) return `${(seconds / 3600).toFixed(2)}h`;
        return `${(seconds / 86400).toFixed(2)}d`;
    }

    /**
     * Format bytes in human readable format
     */
    formatBytes(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    }

    /**
     * Record report history
     */
    recordReportHistory(record) {
        this.reportHistory.push(record);

        // Keep only last 100 records
        if (this.reportHistory.length > 100) {
            this.reportHistory.shift();
        }

        // Clean up old reports
        this.cleanupOldReports();
    }

    /**
     * Clean up old reports
     */
    async cleanupOldReports() {
        try {
            const cutoffTime = Date.now() - this.config.retentionPeriod;
            const oldReports = this.reportHistory.filter(r => new Date(r.timestamp).getTime() < cutoffTime);

            for (const report of oldReports) {
                // Remove from memory
                this.reports.delete(report.reportId);

                // Remove file if it exists
                if (this.config.enableFileReports) {
                    const filePath = path.join(this.config.reportPath, `${report.reportId}.txt`);
                    try {
                        await fs.unlink(filePath);
                        logger.debug(`Cleaned up old report: ${report.reportId}`);
                    } catch (error) {
                        // File may not exist
                    }
                }
            }

            // Remove from history
            this.reportHistory = this.reportHistory.filter(r => new Date(r.timestamp).getTime() >= cutoffTime);

        } catch (error) {
            logger.warn(`Failed to cleanup old reports: ${error.message}`);
        }
    }

    /**
     * Get report by ID
     */
    getReport(reportId) {
        return this.reports.get(reportId);
    }

    /**
     * Get report history
     */
    getReportHistory(limit = 10) {
        return this.reportHistory.slice(-limit);
    }

    /**
     * Get reporting statistics
     */
    getStats() {
        return {
            ...this.stats,
            lastReportTime: this.lastReportTime,
            totalReportsStored: this.reports.size,
            reportHistory: this.getReportHistory(5)
        };
    }

    /**
     * Configure reporting settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('UpdateReporting configuration updated', this.config);
    }

    /**
     * Reset reporting state
     */
    reset() {
        this.reports.clear();
        this.reportHistory = [];
        this.lastReportTime = null;
        this.stats = {
            totalReports: 0,
            reportsGenerated: 0,
            reportsFailed: 0,
            averageReportTime: 0,
            totalReportSize: 0
        };
        logger.info('UpdateReporting state reset');
    }
}

module.exports = new UpdateReporting();