/**
 * Model Profile Schema
 * Data validation and normalization for model profiles
 * Standardizes model profiles across providers
 */

const Joi = require('joi');

/**
 * Schema for model profile validation
 */
const modelProfileSchema = Joi.object({
    id: Joi.string().required().description('Unique model identifier'),
    name: Joi.string().optional().description('Human-readable model name'),
    provider: Joi.string().required().description('Provider name'),
    
    // Model metadata
    description: Joi.string().optional().description('Model description'),
    version: Joi.string().optional().description('Model version'),
    created: Joi.date().optional().description('Model creation date'),
    updated: Joi.date().optional().description('Last update date'),
    
    // Capabilities
    capabilities: Joi.array().items(Joi.string()).default([]).description('Model capabilities'),
    pipeline_tag: Joi.string().optional().description('HuggingFace pipeline tag'),
    tags: Joi.array().items(Joi.string()).default([]).description('Model tags'),
    
    // Technical specifications
    parameters: Joi.object({
        size: Joi.string().optional().description('Model size (e.g., "7B", "13B")'),
        architecture: Joi.string().optional().description('Model architecture'),
        context_length: Joi.number().optional().description('Maximum context length'),
        max_tokens: Joi.number().optional().description('Maximum output tokens'),
        languages: Joi.array().items(Joi.string()).optional().description('Supported languages')
    }).optional(),
    
    // Performance metrics
    metrics: Joi.object({
        downloads: Joi.number().optional().description('Download count'),
        likes: Joi.number().optional().description('Like count'),
        rating: Joi.number().min(0).max(5).optional().description('Average rating'),
        benchmark_scores: Joi.object().optional().description('Benchmark performance scores')
    }).optional(),
    
    // API configuration
    api: Joi.object({
        endpoint: Joi.string().required().description('API endpoint path'),
        method: Joi.string().valid('GET', 'POST').default('POST').description('HTTP method'),
        headers: Joi.object().optional().description('Required headers'),
        parameters: Joi.object().optional().description('API parameters schema')
    }).required(),
    
    // Provider-specific data
    provider_data: Joi.object().optional().description('Provider-specific metadata'),
    
    // Timestamps
    indexed_at: Joi.date().default(() => new Date()).description('When this profile was indexed'),
    last_verified: Joi.date().optional().description('Last verification timestamp')
});

/**
 * Schema for provider configuration
 */
const providerConfigSchema = Joi.object({
    name: Joi.string().required().description('Provider name'),
    base_url: Joi.string().uri().required().description('Base API URL'),
    api_key: Joi.string().optional().allow(null).description('API key'),
    priority: Joi.number().default(99).description('Provider priority'),
    token_multiplier: Joi.number().default(1.0).description('Token cost multiplier'),
    
    // Rate limiting
    rate_limit: Joi.object({
        requests_per_minute: Joi.number().optional(),
        tokens_per_minute: Joi.number().optional(),
        concurrent_requests: Joi.number().optional()
    }).optional(),
    
    // Authentication
    auth: Joi.object({
        type: Joi.string().valid('bearer', 'api_key', 'none').default('bearer'),
        header_name: Joi.string().default('Authorization'),
        prefix: Joi.string().default('Bearer ')
    }).optional(),
    
    // Provider metadata
    metadata: Joi.object({
        description: Joi.string().optional(),
        website: Joi.string().uri().optional(),
        documentation: Joi.string().uri().optional(),
        status: Joi.string().valid('active', 'deprecated', 'experimental').default('active')
    }).optional()
});

/**
 * Model Profile Manager
 */
class ModelProfileManager {
    constructor() {
        this.profiles = new Map();
        this.providers = new Map();
    }

    /**
     * Validate and normalize a model profile
     */
    validateProfile(profile) {
        const { error, value } = modelProfileSchema.validate(profile, {
            allowUnknown: true,
            stripUnknown: false
        });

        if (error) {
            throw new Error(`Model profile validation failed: ${error.message}`);
        }

        return value;
    }

    /**
     * Validate provider configuration
     */
    validateProvider(provider) {
        const { error, value } = providerConfigSchema.validate(provider, {
            allowUnknown: true,
            stripUnknown: false
        });

        if (error) {
            throw new Error(`Provider configuration validation failed: ${error.message}`);
        }

        return value;
    }

    /**
     * Add a model profile
     */
    addProfile(profile) {
        const validatedProfile = this.validateProfile(profile);
        this.profiles.set(validatedProfile.id, validatedProfile);
        return validatedProfile;
    }

    /**
     * Get a model profile
     */
    getProfile(modelId) {
        return this.profiles.get(modelId);
    }

    /**
     * Get all profiles
     */
    getAllProfiles() {
        return Array.from(this.profiles.values());
    }

    /**
     * Search profiles by capability
     */
    getProfilesByCapability(capability) {
        return this.getAllProfiles().filter(profile => 
            profile.capabilities.includes(capability)
        );
    }

    /**
     * Search profiles by provider
     */
    getProfilesByProvider(providerName) {
        return this.getAllProfiles().filter(profile => 
            profile.provider.toLowerCase() === providerName.toLowerCase()
        );
    }

    /**
     * Update a model profile
     */
    updateProfile(modelId, updates) {
        const existingProfile = this.getProfile(modelId);
        if (!existingProfile) {
            throw new Error(`Model profile not found: ${modelId}`);
        }

        const updatedProfile = { ...existingProfile, ...updates };
        return this.addProfile(updatedProfile);
    }

    /**
     * Remove a model profile
     */
    removeProfile(modelId) {
        return this.profiles.delete(modelId);
    }

    /**
     * Export profiles to JSON
     */
    exportProfiles() {
        return {
            profiles: Object.fromEntries(this.profiles),
            exported_at: new Date().toISOString(),
            count: this.profiles.size
        };
    }

    /**
     * Import profiles from JSON
     */
    importProfiles(data) {
        if (!data.profiles) {
            throw new Error('Invalid profile data format');
        }

        let imported = 0;
        let errors = 0;

        for (const [id, profile] of Object.entries(data.profiles)) {
            try {
                this.addProfile(profile);
                imported++;
            } catch (error) {
                console.error(`Failed to import profile ${id}:`, error.message);
                errors++;
            }
        }

        return { imported, errors };
    }

    /**
     * Generate profile statistics
     */
    getStats() {
        const profiles = this.getAllProfiles();
        const providers = [...new Set(profiles.map(p => p.provider))];
        const capabilities = [...new Set(profiles.flatMap(p => p.capabilities))];

        const capabilityCount = {};
        capabilities.forEach(cap => {
            capabilityCount[cap] = profiles.filter(p => p.capabilities.includes(cap)).length;
        });

        const providerCount = {};
        providers.forEach(provider => {
            providerCount[provider] = profiles.filter(p => p.provider === provider).length;
        });

        return {
            total_profiles: profiles.length,
            providers: providers.length,
            capabilities: capabilities.length,
            capability_distribution: capabilityCount,
            provider_distribution: providerCount
        };
    }
}

module.exports = {
    modelProfileSchema,
    providerConfigSchema,
    ModelProfileManager
};