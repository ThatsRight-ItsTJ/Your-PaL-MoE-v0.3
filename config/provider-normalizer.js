const url = require('url');

class ProviderNormalizer {
    static normalize(providers) {
        return providers.map(provider => {
            const normalizedProvider = { ...provider };

            // Normalize base URLs and model endpoints
            if (normalizedProvider.baseUrl) {
                normalizedProvider.baseUrl = this.normalizeUrl(normalizedProvider.baseUrl);
            }

            if (normalizedProvider.endpoints && Array.isArray(normalizedProvider.endpoints)) {
                normalizedProvider.endpoints = normalizedProvider.endpoints.map(endpoint => ({
                    ...endpoint,
                    url: this.normalizeUrl(endpoint.url)
                }));
            }

            // Parse rate limits
            if (normalizedProvider.rateLimits) {
                normalizedProvider.rateLimits = this.parseRateLimits(normalizedProvider.rateLimits);
            }

            // Extract environment variables for API keys
            if (normalizedProvider.apiKeyEnvVar) {
                normalizedProvider.apiKey = process.env[normalizedProvider.apiKeyEnvVar];
            }

            return normalizedProvider;
        });
    }

    static normalizeUrl(urlString) {
        try {
            const parsedUrl = new URL(urlString);
            return parsedUrl.toString();
        } catch (error) {
            console.error(`Invalid URL: ${urlString}`);
            return urlString;
        }
    }

    static parseRateLimits(rateLimits) {
        return Object.entries(rateLimits).reduce((acc, [key, value]) => {
            acc[key] = parseInt(value, 10);
            return acc;
        }, {});
    }
}

module.exports = ProviderNormalizer;