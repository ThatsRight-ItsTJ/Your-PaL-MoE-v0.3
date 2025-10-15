/**
 * Oracle Cloud ARM Auto-Scaling Configuration
 * Manages automatic scaling based on CPU, memory, and custom metrics
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class OracleCloudScaler {
    constructor() {
        this.config = null;
        this.currentInstances = 1;
        this.scalingHistory = [];
        this.isOracleCloud = this.detectOracleCloud();
        this.logger = this.setupLogger();
        this.scalingCooldown = 0;
        this.lastScaleTime = 0;
        this.monitoringInterval = null;
    }

    /**
     * Setup logging for scaling operations
     */
    setupLogger() {
        const logFile = path.join(__dirname, 'logs', `scaling-${Date.now()}.log`);

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
            this.logger.info('Oracle Cloud scaling configuration loaded');
        } catch (error) {
            this.logger.error(`Failed to load Oracle Cloud config: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize auto-scaling system
     */
    async initialize() {
        await this.loadConfig();

        // Setup scaling policies
        await this.setupScalingPolicies();

        // Start monitoring for scaling decisions
        this.startScalingMonitor();

        // Load current instance count
        await this.updateCurrentInstances();

        this.logger.info(`Auto-scaling initialized with ${this.currentInstances} instances`);
    }

    /**
     * Setup scaling policies based on configuration
     */
    async setupScalingPolicies() {
        const autoScalingConfig = this.config.get('autoScaling');

        this.policies = {
            cpu: {
                threshold: autoScalingConfig.cpuThreshold,
                scaleOutCooldown: autoScalingConfig.scaleOutCooldown,
                scaleInCooldown: autoScalingConfig.scaleInCooldown,
                enabled: true
            },
            memory: {
                threshold: autoScalingConfig.memoryThreshold,
                scaleOutCooldown: autoScalingConfig.scaleOutCooldown,
                scaleInCooldown: autoScalingConfig.scaleInCooldown,
                enabled: true
            },
            custom: {
                requestRate: { threshold: 1000, enabled: true }, // requests per second
                errorRate: { threshold: 5, enabled: true }, // error percentage
                responseTime: { threshold: 2000, enabled: true } // milliseconds
            }
        };

        this.logger.info('Scaling policies configured');
    }

    /**
     * Start monitoring for scaling decisions
     */
    startScalingMonitor() {
        const monitoringInterval = 60000; // Check every minute

        this.monitoringInterval = setInterval(async () => {
            try {
                await this.evaluateScaling();
            } catch (error) {
                this.logger.error(`Scaling evaluation failed: ${error.message}`);
            }
        }, monitoringInterval);

        this.logger.info(`Scaling monitor started (interval: ${monitoringInterval}ms)`);
    }

    /**
     * Evaluate if scaling is needed
     */
    async evaluateScaling() {
        const now = Date.now();

        // Check cooldown period
        if (now - this.lastScaleTime < this.scalingCooldown) {
            return;
        }

        // Get current metrics
        const metrics = await this.getCurrentMetrics();

        if (!metrics) {
            this.logger.warn('Unable to retrieve metrics for scaling evaluation');
            return;
        }

        // Evaluate scaling policies
        const scaleDecision = this.evaluatePolicies(metrics);

        if (scaleDecision.action !== 'none') {
            await this.executeScaling(scaleDecision);
        }
    }

    /**
     * Get current system and application metrics
     */
    async getCurrentMetrics() {
        try {
            const metrics = {
                timestamp: Date.now(),
                system: {},
                application: {}
            };

            // System metrics
            metrics.system.cpu = await this.getCPUUsage();
            metrics.system.memory = await this.getMemoryUsage();
            metrics.system.load = os.loadavg();

            // Application metrics
            metrics.application = await this.getApplicationMetrics();

            return metrics;
        } catch (error) {
            this.logger.error(`Failed to get current metrics: ${error.message}`);
            return null;
        }
    }

    /**
     * Get CPU usage percentage
     */
    async getCPUUsage() {
        try {
            // Use system load average as proxy for CPU usage
            const loadAvg = os.loadavg()[0];
            const cpuCount = os.cpus().length;
            return Math.min((loadAvg / cpuCount) * 100, 100);
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get memory usage percentage
     */
    async getMemoryUsage() {
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            return ((totalMem - freeMem) / totalMem) * 100;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get application-specific metrics
     */
    async getApplicationMetrics() {
        const metrics = {
            requestRate: 0,
            errorRate: 0,
            responseTime: 0,
            activeConnections: 0
        };

        try {
            // Try to get metrics from application health endpoint
            const response = await fetch('http://localhost:9090/metrics');
            if (response.ok) {
                const data = await response.text();
                // Parse Prometheus metrics format
                metrics.requestRate = this.parseMetric(data, 'http_requests_total');
                metrics.errorRate = this.parseMetric(data, 'http_requests_errors_total');
                metrics.responseTime = this.parseMetric(data, 'http_request_duration_seconds');
                metrics.activeConnections = this.parseMetric(data, 'active_connections');
            }
        } catch (error) {
            this.logger.warn(`Failed to get application metrics: ${error.message}`);
        }

        return metrics;
    }

    /**
     * Parse metric value from Prometheus format
     */
    parseMetric(data, metricName) {
        const lines = data.split('\n');
        for (const line of lines) {
            if (line.startsWith(metricName)) {
                const parts = line.split(' ');
                if (parts.length >= 2) {
                    return parseFloat(parts[1]) || 0;
                }
            }
        }
        return 0;
    }

    /**
     * Evaluate scaling policies against current metrics
     */
    evaluatePolicies(metrics) {
        const decision = {
            action: 'none',
            reason: '',
            targetInstances: this.currentInstances
        };

        const autoScalingConfig = this.config.get('autoScaling');

        // CPU-based scaling
        if (this.policies.cpu.enabled && metrics.system.cpu > this.policies.cpu.threshold) {
            if (this.currentInstances < autoScalingConfig.maxInstances) {
                decision.action = 'scale_out';
                decision.reason = `CPU usage (${metrics.system.cpu.toFixed(1)}%) exceeds threshold (${this.policies.cpu.threshold}%)`;
                decision.targetInstances = Math.min(this.currentInstances + 1, autoScalingConfig.maxInstances);
                this.scalingCooldown = this.policies.cpu.scaleOutCooldown * 1000;
            }
        }

        // Memory-based scaling
        else if (this.policies.memory.enabled && metrics.system.memory > this.policies.memory.threshold) {
            if (this.currentInstances < autoScalingConfig.maxInstances) {
                decision.action = 'scale_out';
                decision.reason = `Memory usage (${metrics.system.memory.toFixed(1)}%) exceeds threshold (${this.policies.memory.threshold}%)`;
                decision.targetInstances = Math.min(this.currentInstances + 1, autoScalingConfig.maxInstances);
                this.scalingCooldown = this.policies.memory.scaleOutCooldown * 1000;
            }
        }

        // Scale in if resources are underutilized
        else if (metrics.system.cpu < this.policies.cpu.threshold * 0.5 &&
                 metrics.system.memory < this.policies.memory.threshold * 0.5) {
            if (this.currentInstances > autoScalingConfig.minInstances) {
                decision.action = 'scale_in';
                decision.reason = `Resources underutilized (CPU: ${metrics.system.cpu.toFixed(1)}%, Memory: ${metrics.system.memory.toFixed(1)}%)`;
                decision.targetInstances = Math.max(this.currentInstances - 1, autoScalingConfig.minInstances);
                this.scalingCooldown = this.policies.cpu.scaleInCooldown * 1000;
            }
        }

        // Custom metrics scaling
        if (decision.action === 'none') {
            // Request rate scaling
            if (this.policies.custom.requestRate.enabled &&
                metrics.application.requestRate > this.policies.custom.requestRate.threshold) {
                if (this.currentInstances < autoScalingConfig.maxInstances) {
                    decision.action = 'scale_out';
                    decision.reason = `High request rate (${metrics.application.requestRate} req/s)`;
                    decision.targetInstances = Math.min(this.currentInstances + 1, autoScalingConfig.maxInstances);
                    this.scalingCooldown = 300000; // 5 minutes
                }
            }

            // Error rate scaling (emergency scale out)
            if (this.policies.custom.errorRate.enabled &&
                metrics.application.errorRate > this.policies.custom.errorRate.threshold) {
                if (this.currentInstances < autoScalingConfig.maxInstances) {
                    decision.action = 'scale_out';
                    decision.reason = `High error rate (${metrics.application.errorRate}%)`;
                    decision.targetInstances = Math.min(this.currentInstances + 1, autoScalingConfig.maxInstances);
                    this.scalingCooldown = 120000; // 2 minutes
                }
            }
        }

        return decision;
    }

    /**
     * Execute scaling action
     */
    async executeScaling(decision) {
        this.logger.info(`Executing scaling: ${decision.action} to ${decision.targetInstances} instances`);
        this.logger.info(`Reason: ${decision.reason}`);

        try {
            if (this.isOracleCloud) {
                await this.scaleOracleCloudInstances(decision);
            } else {
                await this.scaleDockerContainers(decision);
            }

            // Update current instance count
            this.currentInstances = decision.targetInstances;
            this.lastScaleTime = Date.now();

            // Record scaling event
            this.recordScalingEvent(decision);

            this.logger.info(`Scaling completed successfully`);

        } catch (error) {
            this.logger.error(`Scaling execution failed: ${error.message}`);
        }
    }

    /**
     * Scale Oracle Cloud instances
     */
    async scaleOracleCloudInstances(decision) {
        try {
            const instanceConfig = this.config.get('instance');

            if (decision.action === 'scale_out') {
                // Launch new instance
                await this.launchOracleInstance(instanceConfig);
            } else if (decision.action === 'scale_in') {
                // Terminate instance
                await this.terminateOracleInstance();
            }

        } catch (error) {
            this.logger.error(`Oracle Cloud scaling failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Scale Docker containers
     */
    async scaleDockerContainers(decision) {
        try {
            const composeFile = path.join(__dirname, 'docker-compose.oracle.yml');
            const serviceName = 'pal-moe-app';

            if (decision.action === 'scale_out') {
                // Scale up service
                execSync(`docker-compose -f "${composeFile}" up -d --scale ${serviceName}=${decision.targetInstances}`, {
                    stdio: 'inherit'
                });
            } else if (decision.action === 'scale_in') {
                // Scale down service
                execSync(`docker-compose -f "${composeFile}" up -d --scale ${serviceName}=${decision.targetInstances}`, {
                    stdio: 'inherit'
                });
            }

        } catch (error) {
            this.logger.error(`Docker scaling failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Launch new Oracle Cloud instance
     */
    async launchOracleInstance(config) {
        // This would use OCI CLI or SDK to launch instance
        this.logger.info(`Launching new Oracle Cloud instance: ${config.type}`);

        // Placeholder for actual OCI commands
        const launchCommand = `
            oci compute instance launch \\
                --compartment-id ${process.env.OCI_COMPARTMENT_ID} \\
                --shape ${config.type} \\
                --image-id ${await this.getLatestUbuntuImage()} \\
                --subnet-id ${process.env.OCI_SUBNET_ID} \\
                --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \\
                --display-name pal-moe-instance-${Date.now()}
        `.trim();

        this.logger.info('Instance launch command prepared (would execute in production)');
    }

    /**
     * Terminate Oracle Cloud instance
     */
    async terminateOracleInstance() {
        // This would use OCI CLI to terminate oldest instance
        this.logger.info('Terminating Oracle Cloud instance');

        // Placeholder for actual OCI commands
        this.logger.info('Instance termination command prepared (would execute in production)');
    }

    /**
     * Get latest Ubuntu ARM image ID
     */
    async getLatestUbuntuImage() {
        // This would query OCI for latest Ubuntu ARM image
        return 'ocid1.image.oc1..ubuntu-20.04-arm64';
    }

    /**
     * Update current instance count
     */
    async updateCurrentInstances() {
        try {
            if (this.isOracleCloud) {
                // Query OCI for current instances
                this.currentInstances = await this.getOracleInstanceCount();
            } else {
                // Check Docker containers
                this.currentInstances = await this.getDockerInstanceCount();
            }
        } catch (error) {
            this.logger.warn(`Failed to update instance count: ${error.message}`);
            this.currentInstances = 1; // Default fallback
        }
    }

    /**
     * Get Oracle Cloud instance count
     */
    async getOracleInstanceCount() {
        try {
            // This would use OCI CLI to count instances
            return 1; // Placeholder
        } catch (error) {
            return 1;
        }
    }

    /**
     * Get Docker container count
     */
    async getDockerInstanceCount() {
        try {
            const output = execSync('docker ps --filter "name=pal-moe-app" --format "{{.Names}}"', {
                encoding: 'utf8'
            });
            const containers = output.trim().split('\n').filter(name => name);
            return containers.length;
        } catch (error) {
            return 1;
        }
    }

    /**
     * Record scaling event
     */
    recordScalingEvent(decision) {
        const event = {
            timestamp: new Date().toISOString(),
            action: decision.action,
            fromInstances: this.currentInstances,
            toInstances: decision.targetInstances,
            reason: decision.reason,
            cooldown: this.scalingCooldown
        };

        this.scalingHistory.push(event);

        // Keep only last 100 scaling events
        if (this.scalingHistory.length > 100) {
            this.scalingHistory.splice(0, this.scalingHistory.length - 100);
        }

        // Persist scaling history
        this.persistScalingHistory();
    }

    /**
     * Persist scaling history to disk
     */
    async persistScalingHistory() {
        try {
            const historyFile = path.join(__dirname, 'logs', 'scaling-history.json');
            await fs.writeFile(historyFile, JSON.stringify(this.scalingHistory, null, 2));
        } catch (error) {
            this.logger.error(`Failed to persist scaling history: ${error.message}`);
        }
    }

    /**
     * Get scaling status
     */
    getScalingStatus() {
        return {
            currentInstances: this.currentInstances,
            lastScaleTime: this.lastScaleTime ? new Date(this.lastScaleTime).toISOString() : null,
            scalingCooldown: this.scalingCooldown,
            isOracleCloud: this.isOracleCloud,
            policies: this.policies,
            recentEvents: this.scalingHistory.slice(-5)
        };
    }

    /**
     * Manual scaling (for testing or admin control)
     */
    async manualScale(targetInstances) {
        const autoScalingConfig = this.config.get('autoScaling');

        if (targetInstances < autoScalingConfig.minInstances ||
            targetInstances > autoScalingConfig.maxInstances) {
            throw new Error(`Target instances (${targetInstances}) out of range [${autoScalingConfig.minInstances}, ${autoScalingConfig.maxInstances}]`);
        }

        const decision = {
            action: targetInstances > this.currentInstances ? 'scale_out' : 'scale_in',
            reason: 'Manual scaling',
            targetInstances
        };

        await this.executeScaling(decision);
    }

    /**
     * Emergency scale out (immediate scaling without cooldown)
     */
    async emergencyScaleOut() {
        this.logger.warn('Emergency scale out triggered');

        const autoScalingConfig = this.config.get('autoScaling');
        const targetInstances = Math.min(this.currentInstances + 1, autoScalingConfig.maxInstances);

        const decision = {
            action: 'scale_out',
            reason: 'Emergency scaling',
            targetInstances
        };

        // Bypass cooldown for emergency
        this.scalingCooldown = 0;
        await this.executeScaling(decision);
    }

    /**
     * Stop auto-scaling
     */
    stop() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            this.logger.info('Auto-scaling stopped');
        }
    }

    /**
     * Get scaling metrics and recommendations
     */
    async getScalingMetrics() {
        const metrics = await this.getCurrentMetrics();
        const recommendations = [];

        if (metrics) {
            const autoScalingConfig = this.config.get('autoScaling');

            // CPU recommendation
            if (metrics.system.cpu > this.policies.cpu.threshold) {
                recommendations.push({
                    type: 'cpu',
                    action: 'scale_out',
                    current: metrics.system.cpu,
                    threshold: this.policies.cpu.threshold
                });
            }

            // Memory recommendation
            if (metrics.system.memory > this.policies.memory.threshold) {
                recommendations.push({
                    type: 'memory',
                    action: 'scale_out',
                    current: metrics.system.memory,
                    threshold: this.policies.memory.threshold
                });
            }

            // Underutilization recommendation
            if (metrics.system.cpu < this.policies.cpu.threshold * 0.3 &&
                this.currentInstances > autoScalingConfig.minInstances) {
                recommendations.push({
                    type: 'underutilized',
                    action: 'scale_in',
                    current: metrics.system.cpu,
                    threshold: this.policies.cpu.threshold * 0.3
                });
            }
        }

        return {
            currentMetrics: metrics,
            recommendations,
            status: this.getScalingStatus()
        };
    }
}

module.exports = OracleCloudScaler;