/**
 * Polling Scheduler
 * Manages scheduled polling of provider APIs with configurable intervals
 * Supports concurrent execution, error handling, and adaptive scheduling
 */

const logger = require('../utils/logger');

class PollingScheduler {
    constructor(modelTracker) {
        this.modelTracker = modelTracker;
        this.schedules = new Map(); // providerName -> scheduleConfig
        this.activeJobs = new Map(); // providerName -> timeoutId
        this.jobHistory = new Map(); // providerName -> history[]

        // Scheduler state
        this.isRunning = false;
        this.globalConfig = {
            maxConcurrentJobs: 5,
            defaultInterval: 5 * 60 * 1000, // 5 minutes
            retryDelay: 30 * 1000, // 30 seconds
            maxRetries: 3,
            backoffMultiplier: 2,
            jitterRange: 0.1 // 10% jitter
        };

        // Statistics
        this.stats = {
            totalJobsScheduled: 0,
            totalJobsExecuted: 0,
            totalJobsFailed: 0,
            totalRetries: 0,
            averageExecutionTime: 0,
            lastGlobalUpdate: null
        };

        logger.info('PollingScheduler initialized');
    }

    /**
     * Start the scheduler
     */
    async start() {
        if (this.isRunning) {
            logger.warn('Scheduler is already running');
            return;
        }

        try {
            logger.info('Starting Polling Scheduler');

            // Load provider schedules
            await this.loadProviderSchedules();

            // Schedule initial jobs
            this.scheduleAllProviders();

            this.isRunning = true;
            logger.info('Polling Scheduler started successfully');

        } catch (error) {
            logger.error(`Failed to start scheduler: ${error.message}`);
            throw error;
        }
    }

    /**
     * Stop the scheduler
     */
    async stop() {
        if (!this.isRunning) {
            logger.warn('Scheduler is not running');
            return;
        }

        logger.info('Stopping Polling Scheduler');

        // Clear all active jobs
        for (const [providerName, timeoutId] of this.activeJobs) {
            clearTimeout(timeoutId);
            logger.debug(`Cleared job for provider: ${providerName}`);
        }

        this.activeJobs.clear();
        this.isRunning = false;
        logger.info('Polling Scheduler stopped');
    }

    /**
     * Load schedules for all providers
     */
    async loadProviderSchedules() {
        try {
            const providers = this.modelTracker.providerManager.getFilteredProviders();

            for (const provider of providers) {
                const providerName = provider.name || provider.provider_name;
                const scheduleConfig = this.createScheduleConfig(provider);
                this.schedules.set(providerName, scheduleConfig);
            }

            logger.info(`Loaded schedules for ${providers.length} providers`);
        } catch (error) {
            logger.error(`Failed to load provider schedules: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create schedule configuration for a provider
     */
    createScheduleConfig(provider) {
        const providerName = provider.name || provider.provider_name;

        // Base configuration
        const config = {
            provider: providerName,
            interval: this.globalConfig.defaultInterval,
            enabled: true,
            priority: provider.priority || 99,
            retryCount: 0,
            lastExecution: null,
            nextExecution: null,
            consecutiveFailures: 0,
            backoffDelay: this.globalConfig.retryDelay,
            customConfig: {}
        };

        // Apply provider-specific overrides
        if (provider.polling_config) {
            config.interval = provider.polling_config.interval || config.interval;
            config.enabled = provider.polling_config.enabled !== false;
            config.priority = provider.polling_config.priority || config.priority;
            config.customConfig = provider.polling_config.custom || {};
        }

        // Calculate next execution time
        config.nextExecution = new Date(Date.now() + config.interval);

        return config;
    }

    /**
     * Schedule polling for all enabled providers
     */
    scheduleAllProviders() {
        const enabledSchedules = Array.from(this.schedules.values())
            .filter(schedule => schedule.enabled)
            .sort((a, b) => a.priority - b.priority); // Higher priority first

        logger.info(`Scheduling ${enabledSchedules.length} providers`);

        for (const schedule of enabledSchedules) {
            this.scheduleProvider(schedule.provider);
        }
    }

    /**
     * Schedule polling for a specific provider
     */
    scheduleProvider(providerName) {
        const schedule = this.schedules.get(providerName);
        if (!schedule || !schedule.enabled) {
            return;
        }

        // Clear existing job if any
        const existingJob = this.activeJobs.get(providerName);
        if (existingJob) {
            clearTimeout(existingJob);
        }

        // Calculate delay with jitter
        const baseDelay = schedule.interval;
        const jitter = baseDelay * this.globalConfig.jitterRange * (Math.random() - 0.5) * 2;
        const delay = Math.max(1000, baseDelay + jitter); // Minimum 1 second

        // Schedule the job
        const timeoutId = setTimeout(() => {
            this.executeProviderJob(providerName);
        }, delay);

        this.activeJobs.set(providerName, timeoutId);
        schedule.nextExecution = new Date(Date.now() + delay);

        logger.debug(`Scheduled ${providerName} for execution in ${Math.round(delay/1000)}s`);
    }

    /**
     * Execute polling job for a provider
     */
    async executeProviderJob(providerName) {
        const schedule = this.schedules.get(providerName);
        if (!schedule) return;

        const startTime = Date.now();
        this.stats.totalJobsExecuted++;

        try {
            logger.debug(`Executing polling job for ${providerName}`);

            // Update schedule state
            schedule.lastExecution = new Date();

            // Execute the update
            const result = await this.modelTracker.updateProviderCatalog(
                this.modelTracker.providerManager.getFilteredProviders({ name: providerName })[0]
            );

            // Record success
            schedule.consecutiveFailures = 0;
            schedule.retryCount = 0;
            schedule.backoffDelay = this.globalConfig.retryDelay;

            // Record job history
            this.recordJobHistory(providerName, {
                timestamp: new Date(),
                success: true,
                duration: Date.now() - startTime,
                result: result
            });

            logger.info(`Polling job completed for ${providerName} (${result.duration}ms)`);

        } catch (error) {
            logger.error(`Polling job failed for ${providerName}: ${error.message}`);
            this.stats.totalJobsFailed++;

            // Handle failure and retry logic
            await this.handleJobFailure(providerName, error);

        } finally {
            // Reschedule the job if scheduler is still running
            if (this.isRunning) {
                this.scheduleProvider(providerName);
            }
        }
    }

    /**
     * Handle job failure with retry logic
     */
    async handleJobFailure(providerName, error) {
        const schedule = this.schedules.get(providerName);
        if (!schedule) return;

        schedule.consecutiveFailures++;

        // Record failure in history
        this.recordJobHistory(providerName, {
            timestamp: new Date(),
            success: false,
            error: error.message,
            consecutiveFailures: schedule.consecutiveFailures
        });

        // Check if we should retry
        if (schedule.retryCount < this.globalConfig.maxRetries) {
            schedule.retryCount++;

            // Calculate backoff delay
            const backoffDelay = schedule.backoffDelay * Math.pow(this.globalConfig.backoffMultiplier, schedule.retryCount - 1);

            logger.info(`Retrying ${providerName} in ${Math.round(backoffDelay/1000)}s (attempt ${schedule.retryCount}/${this.globalConfig.maxRetries})`);

            // Schedule retry
            setTimeout(() => {
                if (this.isRunning) {
                    this.executeProviderJob(providerName);
                }
            }, backoffDelay);

            this.stats.totalRetries++;
        } else {
            logger.warn(`Max retries exceeded for ${providerName}, giving up`);
            schedule.retryCount = 0;
            schedule.backoffDelay = this.globalConfig.retryDelay;
        }
    }

    /**
     * Record job execution history
     */
    recordJobHistory(providerName, record) {
        if (!this.jobHistory.has(providerName)) {
            this.jobHistory.set(providerName, []);
        }

        const history = this.jobHistory.get(providerName);
        history.push(record);

        // Keep only last 100 records
        if (history.length > 100) {
            history.shift();
        }
    }

    /**
     * Update schedule configuration for a provider
     */
    updateProviderSchedule(providerName, updates) {
        const schedule = this.schedules.get(providerName);
        if (!schedule) {
            throw new Error(`Schedule not found for provider: ${providerName}`);
        }

        // Update configuration
        Object.assign(schedule, updates);

        // Reschedule if running
        if (this.isRunning) {
            this.scheduleProvider(providerName);
        }

        logger.info(`Updated schedule for ${providerName}`);
    }

    /**
     * Enable/disable polling for a provider
     */
    setProviderEnabled(providerName, enabled) {
        const schedule = this.schedules.get(providerName);
        if (!schedule) {
            throw new Error(`Schedule not found for provider: ${providerName}`);
        }

        schedule.enabled = enabled;

        if (this.isRunning) {
            if (enabled) {
                this.scheduleProvider(providerName);
            } else {
                const jobId = this.activeJobs.get(providerName);
                if (jobId) {
                    clearTimeout(jobId);
                    this.activeJobs.delete(providerName);
                }
            }
        }

        logger.info(`${enabled ? 'Enabled' : 'Disabled'} polling for ${providerName}`);
    }

    /**
     * Get schedule status for all providers
     */
    getScheduleStatus() {
        const status = {};

        for (const [providerName, schedule] of this.schedules) {
            status[providerName] = {
                enabled: schedule.enabled,
                interval: schedule.interval,
                priority: schedule.priority,
                lastExecution: schedule.lastExecution,
                nextExecution: schedule.nextExecution,
                consecutiveFailures: schedule.consecutiveFailures,
                retryCount: schedule.retryCount
            };
        }

        return status;
    }

    /**
     * Get job history for a provider
     */
    getJobHistory(providerName, limit = 10) {
        const history = this.jobHistory.get(providerName) || [];
        return history.slice(-limit);
    }

    /**
     * Get scheduler statistics
     */
    getStats() {
        const activeJobs = this.activeJobs.size;
        const enabledSchedules = Array.from(this.schedules.values()).filter(s => s.enabled).length;

        return {
            ...this.stats,
            isRunning: this.isRunning,
            activeJobs,
            enabledSchedules,
            totalSchedules: this.schedules.size
        };
    }

    /**
     * Force immediate execution for a provider
     */
    async forceExecuteProvider(providerName) {
        const schedule = this.schedules.get(providerName);
        if (!schedule) {
            throw new Error(`Schedule not found for provider: ${providerName}`);
        }

        logger.info(`Force executing job for ${providerName}`);
        await this.executeProviderJob(providerName);
    }

    /**
     * Configure global scheduler settings
     */
    configure(newConfig) {
        this.globalConfig = { ...this.globalConfig, ...newConfig };
        logger.info('Scheduler configuration updated', this.globalConfig);

        // Reschedule all providers with new config
        if (this.isRunning) {
            this.scheduleAllProviders();
        }
    }

    /**
     * Reset scheduler state
     */
    reset() {
        this.stop();
        this.schedules.clear();
        this.activeJobs.clear();
        this.jobHistory.clear();
        this.stats = {
            totalJobsScheduled: 0,
            totalJobsExecuted: 0,
            totalJobsFailed: 0,
            totalRetries: 0,
            averageExecutionTime: 0,
            lastGlobalUpdate: null
        };
        logger.info('Scheduler state reset');
    }
}

module.exports = PollingScheduler;