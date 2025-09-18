const fs = require('fs').promises;
const path = require('path');

/**
 * Health check service
 */
class HealthCheckService {
  constructor(options = {}) {
    this.checks = {
      // Default checks
      memory: this.checkMemory,
      disk: this.checkDisk,
      security: this.checkSecurity
    };
    
    this.options = {
      memoryThreshold: options.memoryThreshold || 0.9, // 90%
      diskThreshold: options.diskThreshold || 0.9, // 90%
      securityEnabled: options.securityEnabled !== false
    };
  }

  /**
   * Run all health checks
   */
  async runAllChecks() {
    const results = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {}
    };

    for (const [name, check] of Object.entries(this.checks)) {
      try {
        const result = await check.call(this);
        results.checks[name] = result;
        
        if (!result.healthy) {
          results.status = 'unhealthy';
        }
      } catch (error) {
        results.checks[name] = {
          healthy: false,
          message: `Health check failed: ${error.message}`,
          error: error.stack
        };
        results.status = 'unhealthy';
      }
    }

    return results;
  }

  /**
   * Check memory usage
   */
  async checkMemory() {
    const used = process.memoryUsage();
    const total = require('os').totalmem();
    const usage = used.heapUsed / total;
    
    return {
      healthy: usage < this.options.memoryThreshold,
      memory: {
        used: used.heapUsed,
        total: total,
        usage: usage
      },
      threshold: this.options.memoryThreshold,
      message: usage < this.options.memoryThreshold 
        ? 'Memory usage is within acceptable limits' 
        : `Memory usage (${(usage * 100).toFixed(2)}%) exceeds threshold (${(this.options.memoryThreshold * 100).toFixed(2)}%)`
    };
  }

  /**
   * Check disk space
   */
  async checkDisk() {
    const stats = await fs.statfs('.');
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = total - free;
    const usage = used / total;
    
    return {
      healthy: usage < this.options.diskThreshold,
      disk: {
        total: total,
        free: free,
        used: used,
        usage: usage
      },
      threshold: this.options.diskThreshold,
      message: usage < this.options.diskThreshold 
        ? 'Disk space is within acceptable limits' 
        : `Disk usage (${(usage * 100).toFixed(2)}%) exceeds threshold (${(this.options.diskThreshold * 100).toFixed(2)}%)`
    };
  }

  /**
   * Check security configuration
   */
  async checkSecurity() {
    if (!this.options.securityEnabled) {
      return {
        healthy: true,
        message: 'Security checks are disabled',
        enabled: false
      };
    }

    const checks = {
      configFiles: await this.checkConfigFiles(),
      securityHeaders: await this.checkSecurityHeaders(),
      authentication: await this.checkAuthentication()
    };

    const allHealthy = Object.values(checks).every(check => check.healthy);

    return {
      healthy: allHealthy,
      checks: checks,
      message: allHealthy ? 'All security checks passed' : 'Some security checks failed'
    };
  }

  /**
   * Check if required config files exist
   */
  async checkConfigFiles() {
    const requiredFiles = [
      './providers.json',
      './users.json',
      './security-config.json'
    ];

    const results = {};

    for (const file of requiredFiles) {
      try {
        await fs.access(file);
        results[file] = { exists: true, readable: true };
      } catch (error) {
        results[file] = { 
          exists: false, 
          readable: false, 
          error: error.message 
        };
      }
    }

    const allHealthy = Object.values(results).every(result => result.exists && result.readable);

    return {
      healthy: allHealthy,
      files: results,
      message: allHealthy ? 'All required configuration files exist and are readable' : 'Some configuration files are missing or not readable'
    };
  }

  /**
   * Check security headers configuration
   */
  async checkSecurityHeaders() {
    const requiredHeaders = [
      'Content-Security-Policy',
      'X-Content-Type-Options',
      'X-Frame-Options',
      'X-XSS-Protection'
    ];

    return {
      healthy: true, // This would be implemented based on your actual middleware
      headers: requiredHeaders,
      message: 'Security headers check placeholder'
    };
  }

  /**
   * Check authentication configuration
   */
  async checkAuthentication() {
    try {
      // Check if admin API key is set
      const adminApiKey = process.env.ADMIN_API_KEY;
      const hasAdminKey = adminApiKey && adminApiKey.length > 0;

      return {
        healthy: hasAdminKey,
        adminApiKey: hasAdminKey ? 'set' : 'not set',
        message: hasAdminKey ? 'Admin API key is configured' : 'Admin API key is not configured'
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        message: 'Authentication check failed'
      };
    }
  }
}

/**
 * Create and export health check service instance
 */
const healthCheckService = new HealthCheckService();

module.exports = {
  HealthCheckService,
  healthCheckService
};