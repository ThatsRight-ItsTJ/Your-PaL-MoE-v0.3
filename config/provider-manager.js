const fs = require('fs');
const path = require('path');
const { filterProviders, sortProviders } = require('../utils/providers');
const enhancedAuth = require('../enhanced-auth');
const securityMiddleware = require('../security-middleware');
const logger = require('../utils/logger');

class ProviderManager {
    constructor() {
        this.providers = [];
        this.normalizedProviders = [];
        this.healthStatus = new Map(); // Track provider health status
    }

    async loadProviders(configPath) {
        try {
            logger.info(`Loading providers from: ${configPath}`);
            const providerLoader = require('./provider-loader');
            this.providers = await providerLoader.loadProviders(configPath);
            logger.info(`Loaded ${this.providers.length} providers`);
        } catch (error) {
            logger.error(`Failed to load providers: ${error.message}`);
            throw error;
        }
    }

    normalizeProviders() {
        try {
            logger.info('Normalizing provider configurations');
            const providerNormalizer = require('./provider-normalizer');
            this.normalizedProviders = providerNormalizer.normalize(this.providers);

            // Initialize health status for each provider
            this.normalizedProviders.forEach(provider => {
                this.healthStatus.set(provider.name || provider.provider_name, {
                    status: 'unknown',
                    lastChecked: null,
                    consecutiveFailures: 0
                });
            });

            logger.info(`Normalized ${this.normalizedProviders.length} providers`);
        } catch (error) {
            logger.error(`Failed to normalize providers: ${error.message}`);
            throw error;
        }
    }

    validateConfigurations() {
        try {
            logger.info('Validating provider configurations');
            const providerValidator = require('./provider-validator');
            const result = providerValidator.validate(this.normalizedProviders);

            if (!result.isValid) {
                logger.warn(`Validation failed for ${result.errors.length} providers`);
                result.errors.forEach(error => {
                    logger.warn(`Provider ${error.provider}: ${error.errors.join(', ')}`);
                });
            } else {
                logger.info('All provider configurations validated successfully');
            }

            return result;
        } catch (error) {
            logger.error(`Failed to validate configurations: ${error.message}`);
            throw error;
        }
    }

    getFilteredProviders(filters) {
        try {
            return filterProviders(this.normalizedProviders, filters);
        } catch (error) {
            logger.error(`Failed to filter providers: ${error.message}`);
            return [];
        }
    }

    getSortedProviders(sortBy, order) {
        try {
            return sortProviders(this.normalizedProviders, sortBy, order);
        } catch (error) {
            logger.error(`Failed to sort providers: ${error.message}`);
            return this.normalizedProviders;
        }
    }

    updateProviderHealth(providerName, status, error = null) {
        const health = this.healthStatus.get(providerName) || {
            status: 'unknown',
            lastChecked: null,
            consecutiveFailures: 0
        };

        health.lastChecked = new Date();
        health.status = status;

        if (status === 'error') {
            health.consecutiveFailures++;
            health.lastError = error;
        } else if (status === 'healthy') {
            health.consecutiveFailures = 0;
            health.lastError = null;
        }

        this.healthStatus.set(providerName, health);
        logger.info(`Provider ${providerName} health updated: ${status}`);
    }

    getProviderHealth(providerName) {
        return this.healthStatus.get(providerName) || {
            status: 'unknown',
            lastChecked: null,
            consecutiveFailures: 0
        };
    }

    getHealthSummary() {
        const summary = {
            total: this.normalizedProviders.length,
            healthy: 0,
            unhealthy: 0,
            unknown: 0
        };

        for (const [name, health] of this.healthStatus) {
            if (health.status === 'healthy') summary.healthy++;
            else if (health.status === 'error') summary.unhealthy++;
            else summary.unknown++;
        }

        return summary;
    }

    static authenticateRequest(req, res, next) {
        return enhancedAuth.enhancedAuthenticateRequest(req, res, next);
    }

    static configureSecurityHeaders(app, securityConfig) {
        return securityMiddleware.configureSecurityHeaders(app, securityConfig);
    }

    // Support for multiple provider formats
    async loadProvidersFromMultipleSources(sources) {
        const allProviders = [];

        for (const source of sources) {
            try {
                if (source.type === 'csv') {
                    const providers = await this.loadProvidersFromCSV(source.path);
                    allProviders.push(...providers);
                } else if (source.type === 'json') {
                    const providers = await this.loadProvidersFromJSON(source.path);
                    allProviders.push(...providers);
                } else if (source.type === 'database') {
                    const providers = await this.loadProvidersFromDatabase(source.config);
                    allProviders.push(...providers);
                }
            } catch (error) {
                logger.error(`Failed to load from ${source.type} source: ${error.message}`);
            }
        }

        this.providers = allProviders;
        return allProviders;
    }

    async loadProvidersFromCSV(filePath) {
        const providerLoader = require('./provider-loader');
        return await providerLoader.loadProviders(filePath);
    }

    async loadProvidersFromJSON(filePath) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return Array.isArray(data) ? data : data.providers || [];
    }

    async loadProvidersFromDatabase(config) {
        // Placeholder for database integration
        // This would integrate with actual database schema
        logger.info('Database provider loading not yet implemented');
        return [];
    }
}

module.exports = ProviderManager;