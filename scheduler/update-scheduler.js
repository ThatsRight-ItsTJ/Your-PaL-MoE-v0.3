/**
 * Automated Update Scheduler
 * Main scheduler engine for automated system updates
 * Coordinates model catalog updates, health checks, config sync, and cleanup
 */

const logger = require('../utils/logger');
const { metricsCollector } = require('../utils/monitoring');
const PollingScheduler = require('../tracker/scheduler');

class AutomatedUpdateScheduler {
    constructor(modelTracker) {
        this.modelTracker = modelTracker;
        this.pollingScheduler = new PollingScheduler(modelTracker);

        // Update components
        this.catalogUpdater = null;
        this.healthChecker = null;
        this.configSync = null;
        this.cleanupManager = null;
        this.reporting = null;

        // Scheduler state
        this.isRunning = false;
        this.updateJobs = new Map();
        this.updateHistory = new Map();

        // Configuration
        this.config = {
            updateInterval: 30 * 60 * 1000, // 30 minutes
            healthCheckInterval: 5 * 60 * 1000, // 5 minutes
            configSyncInterval: 60 * 60 * 1000, // 1 hour
            cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
            maxConcurrentUpdates: 3,
            retryAttempts: 3,
            retryDelay: 5 * 60 * 1000, // 5 minutes
            enableCatalogUpdates: true,
            enableHealthChecks: true,
            enableConfigSync: true,
            enableCleanup: true
        };

        // Statistics
        this.stats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            lastGlobalUpdate: null,
            averageUpdateTime: 0,
            updateHistory: []
        };

        logger.info('AutomatedUpdateScheduler initialized');
    }

    /**
     * Initialize update components
     */
    async initialize() {
        try {
            // Import components dynamically to avoid circular dependencies
            this.catalogUpdater = require('./catalog-updater');
            this.healthChecker = require('./health-checker');
            this.configSync = require('./config-sync');
            this.cleanupManager = require('./cleanup-manager');
            this.reporting = require('./reporting');

            // Initialize components
            await this.catalogUpdater.initialize(this.modelTracker);
            await this.healthChecker.initialize(this.modelTracker);
            await this.configSync.initialize(this.modelTracker);
            await this.cleanupManager.initialize(this.modelTracker);
            await this.reporting.initialize(this);

            logger.info('Update components initialized successfully');
        } catch (error) {
            logger.error(`Failed to initialize update components: ${error.message}`);
            throw error;
        }
    }

    /**
     * Start the automated update scheduler
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Automated Update Scheduler is already running');
            return;
        }

        try {
            logger.info('Starting Automated Update Scheduler');

            // Initialize components if not already done
            if (!this.catalogUpdater) {
                await this.initialize();
            }

            // Start polling scheduler for model updates
            await this.pollingScheduler.start();

            // Schedule update jobs
            this.scheduleUpdateJobs();

            this.isRunning = true;
            logger.info('Automated Update Scheduler started successfully');

        } catch (error) {
            logger.error(`Failed to start Automated Update Scheduler: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop the automated update scheduler
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Automated Update Scheduler is not running');
            return;
        }

        logger.info('Stopping Automated Update Scheduler');

        // Stop polling scheduler
        await this.pollingScheduler.stop();

        // Clear update jobs
        for (const [jobName, timeoutId] of this.updateJobs) {
            clearTimeout(timeoutId);
            logger.debug(`Cleared update job: ${jobName}`);
        }
        this.updateJobs.clear();

        this.isRunning = false;
        logger.info('Automated Update Scheduler stopped');
    }

    /**
     * Schedule periodic update jobs
     */
    scheduleUpdateJobs() {
        const jobs = [
            {
                name: 'health-check',
                interval: this.config.healthCheckInterval,
                enabled: this.config.enableHealthChecks,
                handler: () => this.performHealthChecks()
            },
            {
                name: 'config-sync',
                interval: this.config.configSyncInterval,
                enabled: this.config.enableConfigSync,
                handler: () => this.performConfigSync()
            },
            {
                name: 'cleanup',
                interval: this.config.cleanupInterval,
                enabled: this.config.enableCleanup,
                handler: () => this.performCleanup()
            }
        ];

        for (const job of jobs) {
            if (job.enabled) {
                this.scheduleJob(job.name, job.interval, job.handler);
            }
        }

        logger.info('Update jobs scheduled');
    }

    /**
     * Schedule a single update job
     */
    scheduleJob(jobName, interval, handler) {
        // Clear existing job if any
        const existingJob = this.updateJobs.get(jobName);
        if (existingJob) {
            clearTimeout(existingJob);
        }

        // Schedule new job
        const timeoutId = setTimeout(async () => {
            try {
                await handler();
            } catch (error) {
                logger.error(`Update job ${jobName} failed: ${error.message}`);
                this.recordUpdateFailure(jobName, error);
            } finally {
                // Reschedule if still running
                if (this.isRunning) {
                    this.scheduleJob(jobName, interval, handler);
                }
            }
        }, interval);

        this.updateJobs.set(jobName, timeoutId);
        logger.debug(`Scheduled ${jobName} job for execution in ${Math.round(interval/1000)}s`);
    }

    /**
     * Perform health checks
     */
    async performHealthChecks() {
        if (!this.healthChecker) return;

        const startTime = Date.now();
        logger.info('Starting health checks');

        try {
            const result = await this.healthChecker.performHealthChecks();
            const duration = Date.now() - startTime;

            this.recordUpdateSuccess('health-check', { duration, result });
            logger.info(`Health checks completed in ${duration}ms`);

        } catch (error) {
            logger.error(`Health checks failed: ${error.message}`);
            this.recordUpdateFailure('health-check', error);
        }
    }

    /**
     * Perform configuration synchronization
     */
    async performConfigSync() {
        if (!this.configSync) return;

        const startTime = Date.now();
        logger.info('Starting configuration synchronization');

        try {
            const result = await this.configSync.performSync();
            const duration = Date.now() - startTime;

            this.recordUpdateSuccess('config-sync', { duration, result });
            logger.info(`Configuration sync completed in ${duration}ms`);

        } catch (error) {
            logger.error(`Configuration sync failed: ${error.message}`);
            this.recordUpdateFailure('config-sync', error);
        }
    }

    /**
     * Perform cleanup operations
     */
    async performCleanup() {
        if (!this.cleanupManager) return;

        const startTime = Date.now();
        logger.info('Starting cleanup operations');

        try {
            const result = await this.cleanupManager.performCleanup();
            const duration = Date.now() - startTime;

            this.recordUpdateSuccess('cleanup', { duration, result });
            logger.info(`Cleanup completed in ${duration}ms`);

        } catch (error) {
            logger.error(`Cleanup failed: ${error.message}`);
            this.recordUpdateFailure('cleanup', error);
        }
    }

    /**
     * Force immediate execution of an update job
     */
    async forceUpdate(jobName) {
        const jobHandlers = {
            'health-check': () => this.performHealthChecks(),
            'config-sync': () => this.performConfigSync(),
            'cleanup': () => this.performCleanup()
        };

        const handler = jobHandlers[jobName];
        if (!handler) {
            throw new Error(`Unknown update job: ${jobName}`);
        }

        logger.info(`Force executing update job: ${jobName}`);
        await handler();
    }

    /**
     * Record successful update
     */
    recordUpdateSuccess(jobName, result) {
        this.stats.totalUpdates++;
        this.stats.successfulUpdates++;
        this.stats.lastGlobalUpdate = new Date();

        // Update average time
        const duration = result.duration || 0;
        this.stats.averageUpdateTime = (this.stats.averageUpdateTime + duration) / 2;

        // Record in history
        this.recordUpdateHistory(jobName, {
            timestamp: new Date(),
            success: true,
            duration,
            result
        });

        // Update metrics
        metricsCollector.recordRequest(`update-${jobName}`, null, true, duration);
    }

    /**
     * Record failed update
     */
    recordUpdateFailure(jobName, error) {
        this.stats.totalUpdates++;
        this.stats.failedUpdates++;

        // Record in history
        this.recordUpdateHistory(jobName, {
            timestamp: new Date(),
            success: false,
            error: error.message
        });

        // Update metrics
        metricsCollector.recordRequest(`update-${jobName}`, null, false, 0);
    }

    /**
     * Record update history
     */
    recordUpdateHistory(jobName, record) {
        if (!this.updateHistory.has(jobName)) {
            this.updateHistory.set(jobName, []);
        }

        const history = this.updateHistory.get(jobName);
        history.push(record);

        // Keep only last 100 records
        if (history.length > 100) {
            history.shift();
        }
    }

    /**
     * Get update status
     */
    getUpdateStatus() {
        const status = {};

        for (const [jobName, history] of this.updateHistory) {
            const lastUpdate = history[history.length - 1];
            status[jobName] = {
                lastExecution: lastUpdate?.timestamp || null,
                lastSuccess: history.filter(h => h.success).pop()?.timestamp || null,
                lastFailure: history.filter(h => !h.success).pop()?.timestamp || null,
                totalExecutions: history.length,
                successRate: history.length > 0 ? history.filter(h => h.success).length / history.length : 0
            };
        }

        return status;
    }

    /**
     * Get scheduler statistics
     */
    getStats() {
        return {
            ...this.stats,
            isRunning: this.isRunning,
            activeJobs: this.updateJobs.size,
            updateStatus: this.getUpdateStatus(),
            pollingStats: this.pollingScheduler.getStats()
        };
    }

    /**
     * Configure scheduler settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Update scheduler configuration updated', this.config);

        // Reschedule jobs if running
        if (this.isRunning) {
            // Clear existing jobs
            for (const [jobName, timeoutId] of this.updateJobs) {
                clearTimeout(timeoutId);
            }
            this.updateJobs.clear();

            // Reschedule with new config
            this.scheduleUpdateJobs();
        }
    }

    /**
     * Reset scheduler state
     */
    reset() {
        this.stop();
        this.updateJobs.clear();
        this.updateHistory.clear();
        this.stats = {
            totalUpdates: 0,
            successfulUpdates: 0,
            failedUpdates: 0,
            lastGlobalUpdate: null,
            averageUpdateTime: 0,
            updateHistory: []
        };
        logger.info('Update scheduler state reset');
    }
}

module.exports = AutomatedUpdateScheduler;