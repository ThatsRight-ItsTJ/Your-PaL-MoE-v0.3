const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Centralized configuration management
 */
class ConfigManager {
    constructor() {
        this.config = {};
        this.watchers = new Map();
        this.loadConfig();
    }
    
    /**
     * Load configuration from multiple sources
     */
    loadConfig() {
        try {
            // Default configuration
            this.config = {
                server: {
                    port: process.env.PORT || 3000,
                    host: process.env.HOST || 'localhost',
                    cors: {
                        origin: process.env.CORS_ORIGIN || '*',
                        credentials: true
                    }
                },
                security: {
                    apiKeyHeader: 'x-api-key',
                    rateLimiting: {
                        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
                        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
                    }
                },
                providers: {
                    configPath: './providers.json',
                    cacheTimeout: parseInt(process.env.PROVIDER_CACHE_TIMEOUT) || 300000,
                    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000
                },
                logging: {
                    level: process.env.LOG_LEVEL || 'info',
                    format: process.env.LOG_FORMAT || 'json',
                    file: process.env.LOG_FILE || './logs/app.log'
                },
                performance: {
                    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT) || 30000,
                    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS) || 10,
                    cacheSize: parseInt(process.env.CACHE_SIZE) || 1000
                }
            };
            
            // Load from package.json
            this.loadPackageConfig();
            
            // Load from environment-specific config file
            this.loadEnvironmentConfig();
            
            // Override with environment variables
            this.loadEnvironmentVariables();
            
            logger.info('Configuration loaded successfully', { config: this.config });
        } catch (error) {
            logger.error('Failed to load configuration', { error: error.message });
            throw error;
        }
    }
    
    /**
     * Load configuration from package.json
     */
    loadPackageConfig() {
        try {
            const packagePath = path.join(process.cwd(), 'package.json');
            if (fs.existsSync(packagePath)) {
                const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
                if (packageJson.config) {
                    this.mergeConfig(packageJson.config);
                }
            }
        } catch (error) {
            logger.warn('Failed to load package.json config', { error: error.message });
        }
    }
    
    /**
     * Load environment-specific configuration
     */
    loadEnvironmentConfig() {
        const env = process.env.NODE_ENV || 'development';
        const configPath = path.join(process.cwd(), `config/${env}.json`);
        
        try {
            if (fs.existsSync(configPath)) {
                const envConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                this.mergeConfig(envConfig);
            }
        } catch (error) {
            logger.warn(`Failed to load ${env} config`, { error: error.message });
        }
    }
    
    /**
     * Load configuration from environment variables
     */
    loadEnvironmentVariables() {
        const envMappings = {
            'SERVER_PORT': 'server.port',
            'SERVER_HOST': 'server.host',
            'API_KEY_HEADER': 'security.apiKeyHeader',
            'LOG_LEVEL': 'logging.level',
            'REQUEST_TIMEOUT': 'performance.requestTimeout'
        };
        
        Object.entries(envMappings).forEach(([envVar, configPath]) => {
            const value = process.env[envVar];
            if (value !== undefined) {
                this.setNestedValue(configPath, value);
            }
        });
    }
    
    /**
     * Merge configuration objects
     */
    mergeConfig(newConfig) {
        this.config = this.deepMerge(this.config, newConfig);
    }
    
    /**
     * Deep merge two objects
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
    
    /**
     * Set nested configuration value
     */
    setNestedValue(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }
    
    /**
     * Get configuration value
     */
    get(path, defaultValue = undefined) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current[key] === undefined) {
                return defaultValue;
            }
            current = current[key];
        }
        
        return current;
    }
    
    /**
     * Watch for configuration changes
     */
    watch(path, callback) {
        if (!this.watchers.has(path)) {
            this.watchers.set(path, []);
        }
        this.watchers.get(path).push(callback);
    }
    
    /**
     * Notify watchers of configuration changes
     */
    notifyWatchers(path, newValue, oldValue) {
        const callbacks = this.watchers.get(path) || [];
        callbacks.forEach(callback => {
            try {
                callback(newValue, oldValue);
            } catch (error) {
                logger.error('Configuration watcher error', { error: error.message, path });
            }
        });
    }
}

// Singleton instance
const configManager = new ConfigManager();

module.exports = configManager;