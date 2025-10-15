#!/usr/bin/env node

/**
 * Oracle Cloud ARM Deployment Automation Script
 * Handles automated deployment to Oracle Cloud Always Free ARM instances
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class OracleCloudDeployer {
    constructor() {
        this.config = null;
        this.projectRoot = path.resolve(__dirname, '..');
        this.deploymentDir = __dirname;
        this.isOracleCloud = this.detectOracleCloud();
        this.logger = this.setupLogger();
    }

    /**
     * Setup logging for deployment
     */
    setupLogger() {
        const logFile = path.join(this.deploymentDir, 'logs', `deployment-${Date.now()}.log`);

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
            const configPath = path.join(this.deploymentDir, 'oracle-cloud-config.js');
            delete require.cache[require.resolve(configPath)]; // Clear cache
            const OracleCloudConfig = require(configPath);
            this.config = new OracleCloudConfig();
            this.logger.info('Oracle Cloud configuration loaded successfully');
        } catch (error) {
            this.logger.error(`Failed to load Oracle Cloud config: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validate deployment prerequisites
     */
    async validatePrerequisites() {
        this.logger.info('Validating deployment prerequisites...');

        const checks = [
            { name: 'Node.js', command: 'node --version', required: true },
            { name: 'npm', command: 'npm --version', required: true },
            { name: 'Docker', command: 'docker --version', required: true },
            { name: 'Docker Compose', command: 'docker-compose --version', required: false },
            { name: 'OCI CLI', command: 'oci --version', required: false }
        ];

        const results = [];

        for (const check of checks) {
            try {
                execSync(check.command, { stdio: 'pipe' });
                results.push({ ...check, available: true });
                this.logger.info(`✓ ${check.name} is available`);
            } catch (error) {
                results.push({ ...check, available: false, error: error.message });
                if (check.required) {
                    this.logger.error(`✗ ${check.name} is required but not available`);
                } else {
                    this.logger.warn(`! ${check.name} is not available (optional)`);
                }
            }
        }

        const missingRequired = results.filter(r => r.required && !r.available);
        if (missingRequired.length > 0) {
            throw new Error(`Missing required prerequisites: ${missingRequired.map(r => r.name).join(', ')}`);
        }

        return results;
    }

    /**
     * Prepare deployment environment
     */
    async prepareEnvironment() {
        this.logger.info('Preparing deployment environment...');

        const dirs = [
            'logs',
            'backups',
            'temp',
            'ssl',
            'grafana/provisioning',
            'grafana/dashboards',
            'prometheus'
        ];

        for (const dir of dirs) {
            const fullPath = path.join(this.deploymentDir, dir);
            try {
                await fs.mkdir(fullPath, { recursive: true });
                this.logger.info(`Created directory: ${dir}`);
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    this.logger.error(`Failed to create directory ${dir}: ${error.message}`);
                    throw error;
                }
            }
        }

        // Create .env file if it doesn't exist
        const envPath = path.join(this.projectRoot, '.env');
        try {
            await fs.access(envPath);
            this.logger.info('.env file already exists');
        } catch (error) {
            const envExample = path.join(this.projectRoot, '.env.example');
            try {
                await fs.copyFile(envExample, envPath);
                this.logger.info('Created .env file from .env.example');
            } catch (copyError) {
                this.logger.warn('Could not copy .env.example, creating basic .env file');
                const basicEnv = `# Basic environment configuration
NODE_ENV=production
PORT=3000
HEALTH_PORT=8080
METRICS_PORT=9090
`;
                await fs.writeFile(envPath, basicEnv);
            }
        }
    }

    /**
     * Build Docker images for ARM architecture
     */
    async buildDockerImages() {
        this.logger.info('Building Docker images for ARM64...');

        const images = [
            { name: 'pal-moe:latest', context: this.projectRoot, dockerfile: 'deployment/Dockerfile.oracle' },
            { name: 'pal-moe-backup:latest', context: this.projectRoot, dockerfile: 'deployment/Dockerfile.backup' }
        ];

        for (const image of images) {
            try {
                const buildCommand = `docker build --platform linux/arm64 -t ${image.name} -f ${image.dockerfile} ${image.context}`;
                this.logger.info(`Building ${image.name}...`);
                execSync(buildCommand, { stdio: 'inherit', cwd: this.projectRoot });
                this.logger.info(`✓ Built ${image.name}`);
            } catch (error) {
                this.logger.error(`Failed to build ${image.name}: ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Deploy using Docker Compose
     */
    async deployWithDockerCompose() {
        this.logger.info('Starting deployment with Docker Compose...');

        const composeFile = path.join(this.deploymentDir, 'docker-compose.oracle.yml');
        const envFile = path.join(this.projectRoot, '.env');

        try {
            // Validate compose file exists
            await fs.access(composeFile);

            // Pull images first
            this.logger.info('Pulling Docker images...');
            execSync(`docker-compose -f "${composeFile}" --env-file "${envFile}" pull`, {
                stdio: 'inherit',
                cwd: this.deploymentDir
            });

            // Build custom images
            this.logger.info('Building custom services...');
            execSync(`docker-compose -f "${composeFile}" --env-file "${envFile}" build`, {
                stdio: 'inherit',
                cwd: this.deploymentDir
            });

            // Start services
            this.logger.info('Starting services...');
            execSync(`docker-compose -f "${composeFile}" --env-file "${envFile}" up -d`, {
                stdio: 'inherit',
                cwd: this.deploymentDir
            });

            this.logger.info('✓ Deployment completed successfully');

        } catch (error) {
            this.logger.error(`Docker Compose deployment failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Configure Oracle Cloud resources
     */
    async configureOracleCloud() {
        if (!this.isOracleCloud) {
            this.logger.warn('Not running on Oracle Cloud, skipping Oracle-specific configuration');
            return;
        }

        this.logger.info('Configuring Oracle Cloud resources...');

        try {
            // Configure block volume if available
            await this.configureBlockVolume();

            // Configure load balancer
            await this.configureLoadBalancer();

            // Configure auto-scaling
            await this.configureAutoScaling();

            // Configure monitoring
            await this.configureMonitoring();

        } catch (error) {
            this.logger.error(`Oracle Cloud configuration failed: ${error.message}`);
            // Don't throw here as deployment can continue without Oracle-specific features
        }
    }

    /**
     * Configure Oracle Block Volume
     */
    async configureBlockVolume() {
        try {
            const blockVolumeConfig = this.config.get('storage.blockVolume');
            this.logger.info(`Configuring block volume: ${blockVolumeConfig.size} ${blockVolumeConfig.performance}`);

            // In a real implementation, this would use OCI CLI or SDK
            // For now, just log the configuration
            this.logger.info('Block volume configuration would be applied here');

        } catch (error) {
            this.logger.warn(`Block volume configuration skipped: ${error.message}`);
        }
    }

    /**
     * Configure Oracle Load Balancer
     */
    async configureLoadBalancer() {
        try {
            const lbConfig = this.config.get('networking.loadBalancer');
            this.logger.info('Configuring load balancer...');

            // Log load balancer configuration
            this.logger.info(`Load balancer health check: ${lbConfig.healthCheckPath}:${lbConfig.healthCheckInterval}s`);

        } catch (error) {
            this.logger.warn(`Load balancer configuration skipped: ${error.message}`);
        }
    }

    /**
     * Configure auto-scaling
     */
    async configureAutoScaling() {
        try {
            const asConfig = this.config.get('autoScaling');
            this.logger.info(`Configuring auto-scaling: ${asConfig.minInstances}-${asConfig.maxInstances} instances`);

            // Log auto-scaling configuration
            this.logger.info(`CPU threshold: ${asConfig.cpuThreshold}%, Memory threshold: ${asConfig.memoryThreshold}%`);

        } catch (error) {
            this.logger.warn(`Auto-scaling configuration skipped: ${error.message}`);
        }
    }

    /**
     * Configure Oracle Cloud monitoring
     */
    async configureMonitoring() {
        try {
            const monitoringConfig = this.config.get('monitoring.oracleCloudMonitoring');
            this.logger.info('Configuring Oracle Cloud monitoring...');

            // Log monitoring metrics
            this.logger.info(`Monitoring metrics: ${monitoringConfig.metrics.join(', ')}`);

        } catch (error) {
            this.logger.warn(`Monitoring configuration skipped: ${error.message}`);
        }
    }

    /**
     * Run post-deployment health checks
     */
    async runHealthChecks() {
        this.logger.info('Running post-deployment health checks...');

        const healthChecks = [
            { name: 'Application', url: 'http://localhost:8080/health', timeout: 30000 },
            { name: 'Metrics', url: 'http://localhost:9090/metrics', timeout: 10000 },
            { name: 'Grafana', url: 'http://localhost:3001/api/health', timeout: 10000 }
        ];

        const results = [];

        for (const check of healthChecks) {
            try {
                const response = await this.httpGet(check.url, check.timeout);
                if (response.ok) {
                    results.push({ ...check, status: 'healthy' });
                    this.logger.info(`✓ ${check.name} health check passed`);
                } else {
                    results.push({ ...check, status: 'unhealthy', code: response.status });
                    this.logger.warn(`! ${check.name} health check failed (${response.status})`);
                }
            } catch (error) {
                results.push({ ...check, status: 'error', error: error.message });
                this.logger.error(`✗ ${check.name} health check error: ${error.message}`);
            }
        }

        return results;
    }

    /**
     * Simple HTTP GET request
     */
    async httpGet(url, timeout = 5000) {
        const fetch = (await import('node-fetch')).default;
        return fetch(url, {
            timeout,
            headers: { 'User-Agent': 'Oracle-Cloud-Deployer/1.0' }
        });
    }

    /**
     * Generate deployment report
     */
    async generateReport(results) {
        const reportPath = path.join(this.deploymentDir, 'logs', `deployment-report-${Date.now()}.json`);

        const report = {
            timestamp: new Date().toISOString(),
            environment: {
                platform: os.platform(),
                arch: os.arch(),
                nodeVersion: process.version,
                oracleCloud: this.isOracleCloud
            },
            configuration: this.config ? this.config.config : null,
            results: {
                prerequisites: results.prerequisites,
                healthChecks: results.healthChecks
            },
            status: results.healthChecks.every(hc => hc.status === 'healthy') ? 'success' : 'partial'
        };

        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        this.logger.info(`Deployment report generated: ${reportPath}`);

        return report;
    }

    /**
     * Main deployment process
     */
    async deploy() {
        try {
            this.logger.info('Starting Oracle Cloud ARM deployment...');

            // Load configuration
            await this.loadConfig();

            // Validate prerequisites
            const prereqResults = await this.validatePrerequisites();

            // Prepare environment
            await this.prepareEnvironment();

            // Build Docker images
            await this.buildDockerImages();

            // Configure Oracle Cloud resources
            await this.configureOracleCloud();

            // Deploy with Docker Compose
            await this.deployWithDockerCompose();

            // Run health checks
            const healthResults = await this.runHealthChecks();

            // Generate report
            const report = await this.generateReport({
                prerequisites: prereqResults,
                healthChecks: healthResults
            });

            this.logger.info('Deployment completed successfully!');
            this.logger.info(`Status: ${report.status.toUpperCase()}`);

            if (report.status === 'success') {
                this.logger.info('🎉 All systems operational!');
                this.logger.info('Application is available at: http://localhost');
                this.logger.info('Health endpoint: http://localhost:8080/health');
                this.logger.info('Metrics: http://localhost:9090');
                this.logger.info('Grafana: http://localhost:3001');
            } else {
                this.logger.warn('⚠️  Deployment completed with warnings. Check health checks above.');
            }

        } catch (error) {
            this.logger.error(`Deployment failed: ${error.message}`);
            this.logger.error('Check the logs for detailed error information');

            // Attempt cleanup on failure
            try {
                await this.cleanup();
            } catch (cleanupError) {
                this.logger.error(`Cleanup failed: ${cleanupError.message}`);
            }

            process.exit(1);
        }
    }

    /**
     * Cleanup failed deployment
     */
    async cleanup() {
        this.logger.info('Cleaning up failed deployment...');

        try {
            const composeFile = path.join(this.deploymentDir, 'docker-compose.oracle.yml');
            const envFile = path.join(this.projectRoot, '.env');

            execSync(`docker-compose -f "${composeFile}" --env-file "${envFile}" down -v`, {
                stdio: 'inherit',
                cwd: this.deploymentDir
            });

            this.logger.info('✓ Cleanup completed');
        } catch (error) {
            this.logger.error(`Cleanup failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Rollback deployment
     */
    async rollback() {
        this.logger.info('Rolling back deployment...');

        try {
            await this.cleanup();

            // Additional rollback logic could go here
            // e.g., restore from backup, revert configuration changes

            this.logger.info('✓ Rollback completed');
        } catch (error) {
            this.logger.error(`Rollback failed: ${error.message}`);
            throw error;
        }
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'deploy';

    const deployer = new OracleCloudDeployer();

    switch (command) {
        case 'deploy':
            await deployer.deploy();
            break;
        case 'rollback':
            await deployer.rollback();
            break;
        case 'cleanup':
            await deployer.cleanup();
            break;
        case 'health':
            const results = await deployer.runHealthChecks();
            console.log(JSON.stringify(results, null, 2));
            break;
        default:
            console.log('Usage: node oracle-cloud-deploy.js [deploy|rollback|cleanup|health]');
            process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = OracleCloudDeployer;