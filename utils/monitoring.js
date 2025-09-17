const logger = require('./logger');
const { httpClient } = require('./performance');

/**
 * Monitoring and health check utilities
 */

/**
 * Metrics collector
 */
class MetricsCollector {
    constructor() {
        this.metrics = {
            requests: {
                total: 0,
                success: 0,
                errors: 0,
                byProvider: new Map(),
                byEndpoint: new Map()
            },
            performance: {
                responseTime: [],
                providerResponseTime: new Map()
            },
            system: {
                uptime: Date.now(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            }
        };
        
        // Update system metrics periodically
        setInterval(() => this.updateSystemMetrics(), 30000);
    }
    
    /**
     * Record request metrics
     */
    recordRequest(endpoint, provider = null, success = true, responseTime = 0) {
        this.metrics.requests.total++;
        
        if (success) {
            this.metrics.requests.success++;
        } else {
            this.metrics.requests.errors++;
        }
        
        // Track by endpoint
        if (!this.metrics.requests.byEndpoint.has(endpoint)) {
            this.metrics.requests.byEndpoint.set(endpoint, { total: 0, success: 0, errors: 0 });
        }
        const endpointStats = this.metrics.requests.byEndpoint.get(endpoint);
        endpointStats.total++;
        if (success) endpointStats.success++;
        else endpointStats.errors++;
        
        // Track by provider
        if (provider) {
            if (!this.metrics.requests.byProvider.has(provider)) {
                this.metrics.requests.byProvider.set(provider, { total: 0, success: 0, errors: 0 });
            }
            const providerStats = this.metrics.requests.byProvider.get(provider);
            providerStats.total++;
            if (success) providerStats.success++;
            else providerStats.errors++;
            
            // Track provider response time
            if (!this.metrics.performance.providerResponseTime.has(provider)) {
                this.metrics.performance.providerResponseTime.set(provider, []);
            }
            this.metrics.performance.providerResponseTime.get(provider).push(responseTime);
        }
        
        // Track overall response time
        this.metrics.performance.responseTime.push(responseTime);
        
        // Keep only last 1000 response times
        if (this.metrics.performance.responseTime.length > 1000) {
            this.metrics.performance.responseTime = this.metrics.performance.responseTime.slice(-1000);
        }
    }
    
    /**
     * Update system metrics
     */
    updateSystemMetrics() {
        this.metrics.system.memory = process.memoryUsage();
        this.metrics.system.cpu = process.cpuUsage();
    }
    
    /**
     * Get metrics summary
     */
    getMetrics() {
        const responseTime = this.metrics.performance.responseTime;
        const avgResponseTime = responseTime.length > 0 
            ? responseTime.reduce((a, b) => a + b, 0) / responseTime.length 
            : 0;
        
        return {
            requests: {
                ...this.metrics.requests,
                byProvider: Object.fromEntries(this.metrics.requests.byProvider),
                byEndpoint: Object.fromEntries(this.metrics.requests.byEndpoint),
                successRate: this.metrics.requests.total > 0 
                    ? this.metrics.requests.success / this.metrics.requests.total 
                    : 0
            },
            performance: {
                averageResponseTime: avgResponseTime,
                p95ResponseTime: this.calculatePercentile(responseTime, 0.95),
                p99ResponseTime: this.calculatePercentile(responseTime, 0.99)
            },
            system: {
                ...this.metrics.system,
                uptime: Date.now() - this.metrics.system.uptime
            }
        };
    }
    
    /**
     * Calculate percentile
     */
    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil(sorted.length * percentile) - 1;
        return sorted[index] || 0;
    }
    
    /**
     * Reset metrics
     */
    reset() {
        this.metrics.requests = {
            total: 0,
            success: 0,
            errors: 0,
            byProvider: new Map(),
            byEndpoint: new Map()
        };
        this.metrics.performance = {
            responseTime: [],
            providerResponseTime: new Map()
        };
    }
}

/**
 * Health check manager
 */
class HealthCheckManager {
    constructor(options = {}) {
        this.checks = new Map();
        this.interval = options.interval || 60000; // 1 minute
        this.timeout = options.timeout || 10000; // 10 seconds
        this.results = new Map();
        
        this.startHealthChecks();
    }
    
    /**
     * Register health check
     */
    register(name, checkFunction, options = {}) {
        this.checks.set(name, {
            fn: checkFunction,
            timeout: options.timeout || this.timeout,
            critical: options.critical || false
        });
    }
    
    /**
     * Start periodic health checks
     */
    startHealthChecks() {
        setInterval(async () => {
            await this.runAllChecks();
        }, this.interval);
        
        // Run initial checks
        this.runAllChecks();
    }
    
    /**
     * Run all health checks
     */
    async runAllChecks() {
        const promises = Array.from(this.checks.entries()).map(([name, check]) => 
            this.runCheck(name, check)
        );
        
        await Promise.allSettled(promises);
    }
    
    /**
     * Run individual health check
     */
    async runCheck(name, check) {
        const startTime = Date.now();
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), check.timeout);
            
            const result = await Promise.race([
                check.fn(),
                new Promise((_, reject) => {
                    controller.signal.addEventListener('abort', () => 
                        reject(new Error('Health check timeout'))
                    );
                })
            ]);
            
            clearTimeout(timeoutId);
            
            this.results.set(name, {
                status: 'healthy',
                message: result?.message || 'OK',
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                critical: check.critical
            });
            
        } catch (error) {
            this.results.set(name, {
                status: 'unhealthy',
                message: error.message,
                responseTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
                critical: check.critical
            });
            
            logger.error(`Health check failed: ${name}`, { error: error.message });
        }
    }
    
    /**
     * Get health status
     */
    getHealth() {
        const results = Object.fromEntries(this.results);
        const overall = this.calculateOverallHealth(results);
        
        return {
            status: overall,
            timestamp: new Date().toISOString(),
            checks: results
        };
    }
    
    /**
     * Calculate overall health status
     */
    calculateOverallHealth(results) {
        const checks = Object.values(results);
        
        if (checks.length === 0) {
            return 'unknown';
        }
        
        const criticalUnhealthy = checks.some(check => 
            check.critical && check.status === 'unhealthy'
        );
        
        if (criticalUnhealthy) {
            return 'unhealthy';
        }
        
        const anyUnhealthy = checks.some(check => check.status === 'unhealthy');
        
        return anyUnhealthy ? 'degraded' : 'healthy';
    }
}

/**
 * Provider health checks
 */
async function checkProviderHealth(provider) {
    try {
        const response = await httpClient.request(provider.healthEndpoint || `${provider.baseURL}/health`, {
            method: 'GET',
            timeout: 5000
        });
        
        return {
            message: `Provider ${provider.name} is healthy`,
            data: response
        };
    } catch (error) {
        throw new Error(`Provider ${provider.name} health check failed: ${error.message}`);
    }
}

/**
 * Database health check
 */
async function checkDatabaseHealth() {
    try {
        // Simple database ping - adapt based on your database
        const startTime = Date.now();
        // await db.ping(); // Replace with actual database ping
        const responseTime = Date.now() - startTime;
        
        return {
            message: `Database is healthy (${responseTime}ms)`,
            responseTime
        };
    } catch (error) {
        throw new Error(`Database health check failed: ${error.message}`);
    }
}

/**
 * Memory health check
 */
async function checkMemoryHealth() {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal;
    const usedMemory = usage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
    
    if (memoryUsagePercent > 90) {
        throw new Error(`High memory usage: ${memoryUsagePercent.toFixed(2)}%`);
    }
    
    return {
        message: `Memory usage: ${memoryUsagePercent.toFixed(2)}%`,
        usage: usage
    };
}

// Create singleton instances
const metricsCollector = new MetricsCollector();
const healthCheckManager = new HealthCheckManager();

// Register default health checks
healthCheckManager.register('memory', checkMemoryHealth, { critical: true });
healthCheckManager.register('database', checkDatabaseHealth, { critical: true });

module.exports = {
    MetricsCollector,
    HealthCheckManager,
    metricsCollector,
    healthCheckManager,
    checkProviderHealth,
    checkDatabaseHealth,
    checkMemoryHealth
};