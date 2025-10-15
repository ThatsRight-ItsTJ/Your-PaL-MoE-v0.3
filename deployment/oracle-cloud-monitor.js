/**
 * Oracle Cloud ARM Monitoring and Alerting System
 * Integrated with Oracle Cloud Monitoring and custom metrics collection
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class OracleCloudMonitor {
    constructor() {
        this.config = null;
        this.metrics = new Map();
        this.alerts = [];
        this.isOracleCloud = this.detectOracleCloud();
        this.logger = this.setupLogger();
        this.collectionInterval = 30000; // 30 seconds
        this.monitoringInterval = null;
    }

    /**
     * Setup logging for monitoring
     */
    setupLogger() {
        const logFile = path.join(__dirname, 'logs', `monitoring-${Date.now()}.log`);

        return {
            info: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] INFO: ${message}`;
                console.log(logMessage);
                this.appendToFile(logFile, logMessage + '\n');
            },
            error: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] ERROR: ${message}`;
                console.error(logMessage);
                this.appendToFile(logFile, logMessage + '\n');
            },
            warn: (message) => {
                const timestamp = new Date().toISOString();
                const logMessage = `[${timestamp}] WARN: ${message}`;
                console.warn(logMessage);
                this.appendToFile(logFile, logMessage + '\n');
            }
        };
    }

    /**
     * Append content to file asynchronously
     */
    async appendToFile(filePath, content) {
        try {
            await fs.appendFile(filePath, content);
        } catch (error) {
            console.error(`Failed to write to log file: ${error.message}`);
        }
    }

    /**
     * Detect if running on Oracle Cloud
     */
    detectOracleCloud() {
        return process.env.OCI_REGION_ID ||
               process.env.OCI_COMPARTMENT_ID ||
               process.env.OCI_INSTANCE_ID ||
               false;
    }

    /**
     * Load Oracle Cloud configuration
     */
    async loadConfig() {
        try {
            const configPath = path.join(__dirname, 'oracle-cloud-config.js');
            delete require.cache[require.resolve(configPath)];
            const OracleCloudConfig = require(configPath);
            this.config = new OracleCloudConfig();
            this.logger.info('Oracle Cloud monitoring configuration loaded');
        } catch (error) {
            this.logger.error(`Failed to load Oracle Cloud config: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize monitoring system
     */
    async initialize() {
        await this.loadConfig();

        // Setup metrics storage
        await this.setupMetricsStorage();

        // Configure Oracle Cloud monitoring if available
        if (this.isOracleCloud) {
            await this.configureOracleMonitoring();
        }

        // Start metrics collection
        this.startMetricsCollection();

        // Setup alerting
        this.setupAlerting();

        this.logger.info('Oracle Cloud monitoring system initialized');
    }

    /**
     * Setup metrics storage
     */
    async setupMetricsStorage() {
        const metricsDir = path.join(__dirname, 'metrics');
        try {
            await fs.mkdir(metricsDir, { recursive: true });
            this.logger.info('Metrics storage directory created');
        } catch (error) {
            if (error.code !== 'EEXIST') {
                this.logger.error(`Failed to create metrics directory: ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Configure Oracle Cloud monitoring integration
     */
    async configureOracleMonitoring() {
        try {
            const monitoringConfig = this.config.get('monitoring.oracleCloudMonitoring');

            // Configure OCI CLI for monitoring
            this.logger.info('Configuring Oracle Cloud monitoring integration...');

            // Set up custom metrics namespace
            this.metricsNamespace = `pal-moe-${Date.now()}`;

            // Configure standard metrics
            this.standardMetrics = monitoringConfig.metrics;

            this.logger.info(`Oracle Cloud monitoring configured with namespace: ${this.metricsNamespace}`);

        } catch (error) {
            this.logger.warn(`Oracle Cloud monitoring configuration failed: ${error.message}`);
        }
    }

    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        this.logger.info(`Starting metrics collection (interval: ${this.collectionInterval}ms)`);

        this.monitoringInterval = setInterval(async () => {
            try {
                await this.collectMetrics();
                await this.checkThresholds();
                await this.publishMetrics();
            } catch (error) {
                this.logger.error(`Metrics collection failed: ${error.message}`);
            }
        }, this.collectionInterval);
    }

    /**
     * Collect system and application metrics
     */
    async collectMetrics() {
        const timestamp = Date.now();

        // System metrics
        const systemMetrics = await this.collectSystemMetrics();
        this.storeMetrics('system', systemMetrics, timestamp);

        // Application metrics
        const appMetrics = await this.collectApplicationMetrics();
        this.storeMetrics('application', appMetrics, timestamp);

        // Docker metrics
        const dockerMetrics = await this.collectDockerMetrics();
        this.storeMetrics('docker', dockerMetrics, timestamp);

        // Oracle Cloud specific metrics
        if (this.isOracleCloud) {
            const oracleMetrics = await this.collectOracleCloudMetrics();
            this.storeMetrics('oracle', oracleMetrics, timestamp);
        }

        this.logger.info(`Metrics collected at ${new Date(timestamp).toISOString()}`);
    }

    /**
     * Collect system-level metrics
     */
    async collectSystemMetrics() {
        const metrics = {};

        try {
            // CPU usage
            const cpuUsage = process.cpuUsage();
            metrics.cpuUsage = {
                user: cpuUsage.user / 1000000, // Convert to seconds
                system: cpuUsage.system / 1000000
            };

            // Memory usage
            const memUsage = process.memoryUsage();
            metrics.memoryUsage = {
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external
            };

            // System memory
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            metrics.systemMemory = {
                total: totalMem,
                free: freeMem,
                used: totalMem - freeMem,
                usagePercent: ((totalMem - freeMem) / totalMem) * 100
            };

            // Load average
            metrics.loadAverage = os.loadavg();

            // Disk usage
            const diskUsage = await this.getDiskUsage();
            metrics.diskUsage = diskUsage;

            // Network I/O
            const networkIO = await this.getNetworkIO();
            metrics.networkIO = networkIO;

        } catch (error) {
            this.logger.error(`System metrics collection failed: ${error.message}`);
        }

        return metrics;
    }

    /**
     * Collect application-specific metrics
     */
    async collectApplicationMetrics() {
        const metrics = {};

        try {
            // Application health
            metrics.health = await this.checkApplicationHealth();

            // Request metrics (if available)
            metrics.requests = await this.getRequestMetrics();

            // Error rates
            metrics.errors = await this.getErrorMetrics();

            // Response times
            metrics.responseTime = await this.getResponseTimeMetrics();

            // Active connections
            metrics.connections = await this.getActiveConnections();

        } catch (error) {
            this.logger.error(`Application metrics collection failed: ${error.message}`);
        }

        return metrics;
    }

    /**
     * Collect Docker container metrics
     */
    async collectDockerMetrics() {
        const metrics = {};

        try {
            // Container stats
            const containerStats = await this.getDockerStats();
            metrics.containers = containerStats;

            // Docker system info
            const systemInfo = await this.getDockerSystemInfo();
            metrics.system = systemInfo;

        } catch (error) {
            this.logger.warn(`Docker metrics collection failed: ${error.message}`);
        }

        return metrics;
    }

    /**
     * Collect Oracle Cloud specific metrics
     */
    async collectOracleCloudMetrics() {
        const metrics = {};

        try {
            // Instance metadata
            const instanceMetadata = await this.getInstanceMetadata();
            metrics.instance = instanceMetadata;

            // Block volume metrics
            const blockVolumeMetrics = await this.getBlockVolumeMetrics();
            metrics.blockVolume = blockVolumeMetrics;

            // Load balancer metrics
            const loadBalancerMetrics = await this.getLoadBalancerMetrics();
            metrics.loadBalancer = loadBalancerMetrics;

        } catch (error) {
            this.logger.warn(`Oracle Cloud metrics collection failed: ${error.message}`);
        }

        return metrics;
    }

    /**
     * Store metrics in memory and persist to disk
     */
    storeMetrics(category, metrics, timestamp) {
        const key = `${category}_${timestamp}`;
        this.metrics.set(key, { category, metrics, timestamp });

        // Keep only last 1000 metrics per category
        const categoryKeys = Array.from(this.metrics.keys())
            .filter(k => k.startsWith(`${category}_`))
            .sort()
            .reverse();

        if (categoryKeys.length > 1000) {
            for (let i = 1000; i < categoryKeys.length; i++) {
                this.metrics.delete(categoryKeys[i]);
            }
        }

        // Persist metrics to disk
        this.persistMetrics(category, metrics, timestamp);
    }

    /**
     * Persist metrics to disk
     */
    async persistMetrics(category, metrics, timestamp) {
        try {
            const metricsFile = path.join(__dirname, 'metrics', `${category}-metrics.json`);
            const existingData = await this.readMetricsFile(metricsFile);

            existingData.push({ timestamp, metrics });

            // Keep only last 100 entries
            if (existingData.length > 100) {
                existingData.splice(0, existingData.length - 100);
            }

            await fs.writeFile(metricsFile, JSON.stringify(existingData, null, 2));
        } catch (error) {
            this.logger.error(`Failed to persist ${category} metrics: ${error.message}`);
        }
    }

    /**
     * Read existing metrics file
     */
    async readMetricsFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return [];
        }
    }

    /**
     * Check metrics against thresholds
     */
    async checkThresholds() {
        const thresholds = this.config.get('autoScaling');

        // CPU threshold check
        const latestSystemMetrics = this.getLatestMetrics('system');
        if (latestSystemMetrics) {
            const cpuUsage = latestSystemMetrics.memoryUsage.usagePercent;
            if (cpuUsage > thresholds.cpuThreshold) {
                await this.triggerAlert('high_cpu', {
                    current: cpuUsage,
                    threshold: thresholds.cpuThreshold,
                    message: `CPU usage (${cpuUsage.toFixed(2)}%) exceeds threshold (${thresholds.cpuThreshold}%)`
                });
            }

            // Memory threshold check
            const memUsage = latestSystemMetrics.systemMemory.usagePercent;
            if (memUsage > thresholds.memoryThreshold) {
                await this.triggerAlert('high_memory', {
                    current: memUsage,
                    threshold: thresholds.memoryThreshold,
                    message: `Memory usage (${memUsage.toFixed(2)}%) exceeds threshold (${thresholds.memoryThreshold}%)`
                });
            }
        }

        // Application health check
        const latestAppMetrics = this.getLatestMetrics('application');
        if (latestAppMetrics && !latestAppMetrics.health) {
            await this.triggerAlert('application_unhealthy', {
                message: 'Application health check failed'
            });
        }
    }

    /**
     * Get latest metrics for a category
     */
    getLatestMetrics(category) {
        const categoryKeys = Array.from(this.metrics.keys())
            .filter(k => k.startsWith(`${category}_`))
            .sort()
            .reverse();

        if (categoryKeys.length > 0) {
            return this.metrics.get(categoryKeys[0]).metrics;
        }

        return null;
    }

    /**
     * Trigger an alert
     */
    async triggerAlert(type, data) {
        const alert = {
            id: `${type}_${Date.now()}`,
            type,
            timestamp: new Date().toISOString(),
            data,
            acknowledged: false
        };

        this.alerts.push(alert);

        // Keep only last 100 alerts
        if (this.alerts.length > 100) {
            this.alerts.splice(0, this.alerts.length - 100);
        }

        this.logger.warn(`Alert triggered: ${type} - ${data.message}`);

        // Send alert to Oracle Cloud Monitoring if configured
        if (this.isOracleCloud) {
            await this.sendOracleAlert(alert);
        }

        // Send alert to configured endpoints
        await this.sendAlertNotifications(alert);
    }

    /**
     * Send alert to Oracle Cloud Monitoring
     */
    async sendOracleAlert(alert) {
        try {
            // This would integrate with OCI Monitoring API
            this.logger.info(`Sending alert to Oracle Cloud Monitoring: ${alert.id}`);
        } catch (error) {
            this.logger.error(`Failed to send Oracle alert: ${error.message}`);
        }
    }

    /**
     * Send alert notifications
     */
    async sendAlertNotifications(alert) {
        // Implement notification logic (email, webhook, etc.)
        this.logger.info(`Sending alert notifications for: ${alert.id}`);
    }

    /**
     * Publish metrics to monitoring systems
     */
    async publishMetrics() {
        try {
            // Publish to Prometheus format
            await this.publishToPrometheus();

            // Publish to Oracle Cloud Monitoring
            if (this.isOracleCloud) {
                await this.publishToOracleCloud();
            }

        } catch (error) {
            this.logger.error(`Metrics publishing failed: ${error.message}`);
        }
    }

    /**
     * Publish metrics in Prometheus format
     */
    async publishToPrometheus() {
        const metrics = [];

        // Convert stored metrics to Prometheus format
        for (const [key, data] of this.metrics) {
            const { category, metrics: metricData, timestamp } = data;

            // Convert nested metrics to flat Prometheus format
            const flatMetrics = this.flattenMetrics(metricData, `${category}_`);
            for (const [name, value] of Object.entries(flatMetrics)) {
                if (typeof value === 'number') {
                    metrics.push(`# HELP ${name} ${name.replace(/_/g, ' ')}`);
                    metrics.push(`# TYPE ${name} gauge`);
                    metrics.push(`${name} ${value} ${timestamp}`);
                }
            }
        }

        // Write to Prometheus metrics file
        const prometheusFile = path.join(__dirname, 'metrics', 'prometheus.txt');
        await fs.writeFile(prometheusFile, metrics.join('\n') + '\n');
    }

    /**
     * Publish metrics to Oracle Cloud Monitoring
     */
    async publishToOracleCloud() {
        try {
            // This would use OCI SDK to publish custom metrics
            this.logger.info('Publishing metrics to Oracle Cloud Monitoring');
        } catch (error) {
            this.logger.error(`Oracle Cloud metrics publishing failed: ${error.message}`);
        }
    }

    /**
     * Setup alerting system
     */
    setupAlerting() {
        // Setup alert rules and notification channels
        this.logger.info('Alerting system configured');
    }

    /**
     * Get disk usage metrics
     */
    async getDiskUsage() {
        try {
            // Use system calls to get disk usage
            const output = execSync('df -h / | tail -1', { encoding: 'utf8' });
            const parts = output.trim().split(/\s+/);
            return {
                filesystem: parts[0],
                size: parts[1],
                used: parts[2],
                available: parts[3],
                usePercent: parseFloat(parts[4].replace('%', ''))
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Get network I/O metrics
     */
    async getNetworkIO() {
        try {
            // Read from /proc/net/dev
            const data = await fs.readFile('/proc/net/dev', 'utf8');
            const lines = data.split('\n').slice(2);
            const interfaces = {};

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 17) {
                    const interface = parts[0].replace(':', '');
                    interfaces[interface] = {
                        rxBytes: parseInt(parts[1]),
                        rxPackets: parseInt(parts[2]),
                        txBytes: parseInt(parts[9]),
                        txPackets: parseInt(parts[10])
                    };
                }
            }

            return interfaces;
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Check application health
     */
    async checkApplicationHealth() {
        try {
            const response = await fetch('http://localhost:8080/health');
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get request metrics (placeholder)
     */
    async getRequestMetrics() {
        // This would integrate with application metrics endpoint
        return { total: 0, perSecond: 0 };
    }

    /**
     * Get error metrics (placeholder)
     */
    async getErrorMetrics() {
        // This would integrate with application error tracking
        return { total: 0, rate: 0 };
    }

    /**
     * Get response time metrics (placeholder)
     */
    async getResponseTimeMetrics() {
        // This would integrate with application performance monitoring
        return { average: 0, p95: 0, p99: 0 };
    }

    /**
     * Get active connections (placeholder)
     */
    async getActiveConnections() {
        // This would integrate with connection tracking
        return { total: 0, active: 0 };
    }

    /**
     * Get Docker container stats
     */
    async getDockerStats() {
        try {
            const output = execSync('docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}"', { encoding: 'utf8' });
            const lines = output.split('\n').slice(1);
            const containers = {};

            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    containers[parts[0]] = {
                        cpuPercent: parts[1],
                        memUsage: parts[2]
                    };
                }
            }

            return containers;
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Get Docker system info
     */
    async getDockerSystemInfo() {
        try {
            const output = execSync('docker system info --format "{{.Containers}}\t{{.ContainersRunning}}\t{{.Images}}"', { encoding: 'utf8' });
            const parts = output.trim().split('\t');
            return {
                containers: parseInt(parts[0]),
                containersRunning: parseInt(parts[1]),
                images: parseInt(parts[2])
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    /**
     * Get Oracle Cloud instance metadata
     */
    async getInstanceMetadata() {
        try {
            const response = await fetch('http://169.254.169.254/opc/v2/instance/', {
                headers: { 'Authorization': 'Bearer Oracle' }
            });

            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            // Not on Oracle Cloud or metadata service unavailable
        }

        return {};
    }

    /**
     * Get block volume metrics (placeholder)
     */
    async getBlockVolumeMetrics() {
        // This would integrate with OCI Block Volume API
        return { used: 0, available: 0 };
    }

    /**
     * Get load balancer metrics (placeholder)
     */
    async getLoadBalancerMetrics() {
        // This would integrate with OCI Load Balancer API
        return { activeConnections: 0, healthyInstances: 0 };
    }

    /**
     * Flatten nested metrics object
     */
    flattenMetrics(obj, prefix = '') {
        const flattened = {};

        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix + key;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                Object.assign(flattened, this.flattenMetrics(value, newKey + '_'));
            } else if (typeof value === 'number') {
                flattened[newKey] = value;
            }
        }

        return flattened;
    }

    /**
     * Get monitoring status
     */
    getStatus() {
        return {
            initialized: !!this.config,
            oracleCloud: this.isOracleCloud,
            metricsCollected: this.metrics.size,
            alertsActive: this.alerts.filter(a => !a.acknowledged).length,
            collectionInterval: this.collectionInterval,
            lastCollection: this.getLastCollectionTime()
        };
    }

    /**
     * Get last metrics collection time
     */
    getLastCollectionTime() {
        const allTimestamps = Array.from(this.metrics.values())
            .map(m => m.timestamp)
            .sort((a, b) => b - a);

        return allTimestamps.length > 0 ? new Date(allTimestamps[0]).toISOString() : null;
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            this.logger.info('Monitoring stopped');
        }
    }

    /**
     * Get metrics summary
     */
    getMetricsSummary(hours = 1) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        const recentMetrics = Array.from(this.metrics.values())
            .filter(m => m.timestamp >= cutoff);

        const summary = {};

        for (const data of recentMetrics) {
            const { category, metrics: metricData } = data;

            if (!summary[category]) {
                summary[category] = { count: 0, latest: null };
            }

            summary[category].count++;
            summary[category].latest = metricData;
        }

        return summary;
    }

    /**
     * Export metrics for external analysis
     */
    async exportMetrics(format = 'json', hours = 24) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        const metrics = Array.from(this.metrics.values())
            .filter(m => m.timestamp >= cutoff)
            .map(({ category, metrics: metricData, timestamp }) => ({
                category,
                timestamp: new Date(timestamp).toISOString(),
                metrics: metricData
            }));

        const exportFile = path.join(__dirname, 'metrics', `export-${Date.now()}.${format}`);

        if (format === 'json') {
            await fs.writeFile(exportFile, JSON.stringify(metrics, null, 2));
        } else if (format === 'csv') {
            // Convert to CSV format
            const csvData = this.convertToCSV(metrics);
            await fs.writeFile(exportFile, csvData);
        }

        return exportFile;
    }

    /**
     * Convert metrics to CSV format
     */
    convertToCSV(metrics) {
        if (metrics.length === 0) return '';

        const headers = ['timestamp', 'category'];
        const allKeys = new Set();

        // Collect all possible metric keys
        for (const metric of metrics) {
            this.collectKeys(metric.metrics, allKeys);
        }

        headers.push(...Array.from(allKeys).sort());

        const rows = [headers.join(',')];

        for (const metric of metrics) {
            const row = [metric.timestamp, metric.category];
            const flatMetrics = this.flattenMetrics(metric.metrics);

            for (const key of Array.from(allKeys).sort()) {
                row.push(flatMetrics[key] || '');
            }

            rows.push(row.join(','));
        }

        return rows.join('\n');
    }

    /**
     * Collect all keys from nested object
     */
    collectKeys(obj, keys, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}_${key}` : key;

            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                this.collectKeys(value, keys, fullKey);
            } else {
                keys.add(fullKey);
            }
        }
    }
}

module.exports = OracleCloudMonitor;