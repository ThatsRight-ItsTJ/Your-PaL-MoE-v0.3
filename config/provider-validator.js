const { validators } = require('../utils/security');

class ProviderValidator {
    static validate(providers) {
        const errors = [];
        const validProviders = [];

        for (const provider of providers) {
            const validationResult = this.validateProvider(provider);
            if (validationResult.isValid) {
                validProviders.push(provider);
            } else {
                errors.push({
                    provider: provider.name || 'unknown',
                    errors: validationResult.errors
                });
            }
        }

        return {
            isValid: errors.length === 0,
            validProviders,
            errors
        };
    }

    static validateProvider(provider) {
        const errors = [];

        // Check required fields
        if (!provider.name) {
            errors.push('Provider name is required');
        }

        if (!provider.baseUrl) {
            errors.push('Base URL is required');
        }

        if (!provider.apiKey && !provider.apiKeyEnvVar) {
            errors.push('API key or environment variable is required');
        }

        // Validate URL format
        if (provider.baseUrl) {
            try {
                new URL(provider.baseUrl);
            } catch (error) {
                errors.push('Invalid base URL format');
            }
        }

        // Validate rate limits
        if (provider.rateLimits) {
            for (const [key, value] of Object.entries(provider.rateLimits)) {
                if (typeof value !== 'number' || value < 0) {
                    errors.push(`Invalid rate limit for ${key}: must be a positive number`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

module.exports = ProviderValidator;