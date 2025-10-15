/**
 * Oracle Cloud ARM Configuration for Automatic Free Model Tracking System
 * Optimized for VM.Standard.A1.Flex with 4 OCPUs and 24GB RAM
 */

const path = require('path');
const os = require('os');

class OracleCloudConfig {
    constructor() {
        this.environment = process.env.NODE_ENV || 'production';
        this.isOracleCloud = this.detectOracleCloud();
        this.config = this.buildConfig();
    }

    /**
     * Detect if running on Oracle Cloud infrastructure
     */
    detectOracleCloud() {
        // Check for Oracle Cloud specific environment variables or metadata
        return process.env.OCI_REGION_ID ||
               process.env.OCI_COMPARTMENT_ID ||
               process.env.OCI_INSTANCE_ID ||
               this.checkOracleMetadata();
    }

    /**
     * Check Oracle Cloud metadata service
     */
    async checkOracleMetadata() {
        try {
            const response = await fetch('http://169.254.169.254/opc/v2/instance/', {
                headers: {
                    'Authorization': 'Bearer Oracle'
                },
                timeout: 5000
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    /**
     * Build Oracle Cloud optimized configuration
     */
    buildConfig() {
        const baseConfig = {
            // Oracle Cloud ARM instance specifications
            instance: {
                type: 'VM.Standard.A1.Flex',
                ocpus: 4,
                memory: '24GB',
                architecture: 'ARM64',
                region: process.env.OCI_REGION || 'us-ashburn-1'
            },

            // Performance optimizations for ARM architecture
            performance: {
                // Node.js optimizations for ARM
                node: {
                    maxOldSpaceSize: '18GB', // ~75% of 24GB RAM
                    maxSemiSpaceSize: '512MB',
                    optimizeForSize: false,
                    exposeGc: true
                },

                // Memory management for 24GB RAM
                memory: {
                    heapSize: '18GB',
                    cacheSize: '4GB',
                    bufferPoolSize: '2GB'
                },

                // CPU optimizations for 4 OCPUs
                cpu: {
                    workerThreads: 4,
                    clusterWorkers: 2,
                    maxConcurrentRequests: 1000
                }
            },

            // Oracle Cloud networking
            networking: {
                ports: {
                    http: 80,
                    https: 443,
                    health: 8080,
                    metrics: 9090
                },
                loadBalancer: {
                    enabled: true,
                    healthCheckPath: '/health',
                    healthCheckInterval: 30,
                    unhealthyThreshold: 3,
                    healthyThreshold: 2
                }
            },

            // Storage configuration
            storage: {
                // Oracle Cloud Block Volume
                blockVolume: {
                    size: '100GB',
                    performance: 'Balanced',
                    backupEnabled: true
                },

                // Object Storage for backups
                objectStorage: {
                    bucket: `pal-moe-backups-${Date.now()}`,
                    region: process.env.OCI_REGION || 'us-ashburn-1',
                    retentionDays: 30
                }
            },

            // Monitoring and logging
            monitoring: {
                oracleCloudMonitoring: {
                    enabled: true,
                    metrics: [
                        'CPUUtilization',
                        'MemoryUtilization',
                        'NetworkIn',
                        'NetworkOut',
                        'DiskReadOps',
                        'DiskWriteOps'
                    ]
                },
                customMetrics: {
                    requestCount: true,
                    errorRate: true,
                    responseTime: true,
                    activeConnections: true
                }
            },

            // Security configuration
            security: {
                oracleCloudSecurity: {
                    vaultEnabled: true,
                    secretsManagement: true,
                    identityProvider: 'oracle'
                },
                networkSecurity: {
                    securityLists: [
                        {
                            name: 'pal-moe-security-list',
                            ingressRules: [
                                { protocol: 'TCP', source: '0.0.0.0/0', destinationPortRange: { min: 80, max: 80 } },
                                { protocol: 'TCP', source: '0.0.0.0/0', destinationPortRange: { min: 443, max: 443 } },
                                { protocol: 'TCP', source: '10.0.0.0/16', destinationPortRange: { min: 8080, max: 8080 } }
                            ]
                        }
                    ]
                }
            },

            // Auto-scaling configuration
            autoScaling: {
                enabled: true,
                minInstances: 1,
                maxInstances: 3,
                cpuThreshold: 70,
                memoryThreshold: 80,
                scaleOutCooldown: 300,
                scaleInCooldown: 600
            },

            // Backup and disaster recovery
            backup: {
                automated: true,
                schedule: '0 2 * * *', // Daily at 2 AM
                retention: {
                    daily: 7,
                    weekly: 4,
                    monthly: 12
                },
                disasterRecovery: {
                    crossRegionReplication: true,
                    backupRegion: 'us-phoenix-1'
                }
            }
        };

        // Environment-specific overrides
        if (this.environment === 'production') {
            baseConfig.performance.node.maxOldSpaceSize = '20GB'; // Higher for production
            baseConfig.autoScaling.maxInstances = 5;
        }

        return baseConfig;
    }

    /**
     * Get configuration value by path
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let value = this.config;

        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return defaultValue;
            }
        }

        return value;
    }

    /**
     * Validate Oracle Cloud configuration
     */
    async validate() {
        const errors = [];

        // Check required environment variables
        const requiredEnvVars = [
            'OCI_REGION',
            'OCI_COMPARTMENT_ID',
            'OCI_TENANCY_ID'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                errors.push(`Missing required environment variable: ${envVar}`);
            }
        }

        // Validate instance specifications
        const instance = this.config.instance;
        if (instance.ocpus > 4 || instance.memory !== '24GB') {
            errors.push('Instance specifications do not match Always Free tier limits');
        }

        // Check Oracle Cloud connectivity
        if (this.isOracleCloud) {
            try {
                const metadataAvailable = await this.checkOracleMetadata();
                if (!metadataAvailable) {
                    errors.push('Unable to access Oracle Cloud metadata service');
                }
            } catch (error) {
                errors.push(`Oracle Cloud metadata check failed: ${error.message}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Get optimized environment variables for Oracle Cloud
     */
    getEnvironmentVariables() {
        return {
            // Node.js optimizations
            NODE_ENV: this.environment,
            NODE_OPTIONS: `--max-old-space-size=${this.config.performance.node.maxOldSpaceSize} --max-semi-space-size=${this.config.performance.node.maxSemiSpaceSize} --expose-gc`,

            // Oracle Cloud specific
            OCI_REGION: this.config.instance.region,
            ORACLE_CLOUD: 'true',

            // Performance tuning
            UV_THREADPOOL_SIZE: this.config.performance.cpu.workerThreads.toString(),
            CLUSTER_WORKERS: this.config.performance.cpu.clusterWorkers.toString(),

            // Memory settings
            CACHE_SIZE: this.config.performance.memory.cacheSize,
            BUFFER_POOL_SIZE: this.config.performance.memory.bufferPoolSize
        };
    }

    /**
     * Get Docker configuration for Oracle Cloud ARM
     */
    getDockerConfig() {
        return {
            image: 'node:18-alpine',
            platform: 'linux/arm64',
            build: {
                context: '.',
                dockerfile: 'Dockerfile.oracle'
            },
            environment: this.getEnvironmentVariables(),
            ports: [
                `${this.config.networking.ports.http}:3000`,
                `${this.config.networking.ports.health}:8080`,
                `${this.config.networking.ports.metrics}:9090`
            ],
            volumes: [
                './logs:/app/logs',
                './backups:/app/backups',
                './temp:/app/temp'
            ],
            restart: 'unless-stopped',
            healthcheck: {
                test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
                interval: '30s',
                timeout: '10s',
                retries: 3,
                start_period: '40s'
            }
        };
    }
}

module.exports = OracleCloudConfig;