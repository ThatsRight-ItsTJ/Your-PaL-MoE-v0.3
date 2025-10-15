/**
 * Dynamic Model Parser
 * Main parser engine that automatically parses diverse API response formats
 * to identify free models using multiple strategies and fallback mechanisms
 */

const logger = require('../utils/logger');
const {
    OpenAIFormatStrategy,
    ArrayFormatStrategy,
    CatalogFormatStrategy,
    HuggingFaceFormatStrategy
} = require('./format-strategies');
const PricingDetector = require('./pricing-detector');
const FallbackParser = require('./fallback-parser');

class DynamicModelParser {
    constructor(providerManager = null) {
        this.providerManager = providerManager;
        this.pricingDetector = new PricingDetector();

        // Initialize parsing strategies in priority order
        this.strategies = [
            new OpenAIFormatStrategy(),
            new HuggingFaceFormatStrategy(),
            new CatalogFormatStrategy(),
            new ArrayFormatStrategy()
        ];

        // Initialize fallback parser
        this.fallbackParser = new FallbackParser(this.strategies);

        // Cache for parsed results
        this.parseCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes

        // Statistics tracking
        this.stats = {
            totalParses: 0,
            successfulParses: 0,
            fallbackParses: 0,
            failedParses: 0,
            cacheHits: 0,
            modelsExtracted: 0,
            freeModelsFound: 0
        };
    }

    /**
     * Parse API response and extract models
     */
    async parseResponse(response, providerName = null, context = {}) {
        try {
            this.stats.totalParses++;

            // Create cache key
            const cacheKey = this.createCacheKey(response, providerName, context);
            const cached = this.getCachedResult(cacheKey);
            if (cached) {
                this.stats.cacheHits++;
                return cached;
            }

            // Enhance context with provider information
            const enhancedContext = await this.enhanceContextWithProvider(providerName, context);

            // Try primary parsing strategies
            let result = this.tryStrategies(response, enhancedContext);

            // Use fallback parser if primary strategies fail
            if (!result || !this.isSuccessfulParse(result)) {
                logger.debug(`Primary parsing failed, trying fallback for provider: ${providerName}`);
                result = this.fallbackParser.parse(response, enhancedContext);
                if (result && result.fallback_used) {
                    this.stats.fallbackParses++;
                }
            }

            // Validate and enhance result
            if (result && this.isSuccessfulParse(result)) {
                result = await this.enhanceResult(result, enhancedContext);
                this.stats.successfulParses++;
            } else {
                this.stats.failedParses++;
                result = this.createErrorResult(response, 'parsing_failed', enhancedContext);
            }

            // Cache successful results
            if (result && !result.error) {
                this.setCachedResult(cacheKey, result);
            }

            return result;
        } catch (error) {
            logger.error(`Dynamic parser error: ${error.message}`);
            this.stats.failedParses++;
            return this.createErrorResult(response, 'parser_exception', context, error.message);
        }
    }

    /**
     * Extract models from parsed response
     */
    async extractModels(response, providerName = null, context = {}) {
        try {
            const parseResult = await this.parseResponse(response, providerName, context);

            if (!parseResult || parseResult.error) {
                return [];
            }

            // Extract models using strategies
            let models = [];

            if (parseResult.models) {
                models = parseResult.models;
            } else {
                // Try fallback model extraction
                models = this.fallbackParser.extractModels(response, context);
            }

            // Validate and enhance models
            const validModels = await this.validateAndEnhanceModels(models, context);

            // Detect free tier models
            const freeTierModels = this.detectFreeTierModels(validModels);

            this.stats.modelsExtracted += validModels.length;
            this.stats.freeModelsFound += freeTierModels.length;

            return {
                all: validModels,
                free: freeTierModels,
                total: validModels.length,
                freeCount: freeTierModels.length,
                parseResult: parseResult
            };
        } catch (error) {
            logger.error(`Model extraction error: ${error.message}`);
            return {
                all: [],
                free: [],
                total: 0,
                freeCount: 0,
                error: error.message
            };
        }
    }

    /**
     * Try parsing strategies in order
     */
    tryStrategies(response, context) {
        for (const strategy of this.strategies) {
            try {
                if (strategy.canHandle(response, context)) {
                    logger.debug(`Attempting strategy: ${strategy.name}`);
                    const result = strategy.parse(response, context);

                    if (this.isSuccessfulParse(result)) {
                        return {
                            ...result,
                            strategy: strategy.name,
                            fallback_used: false
                        };
                    }
                }
            } catch (error) {
                logger.debug(`Strategy ${strategy.name} failed: ${error.message}`);
                continue;
            }
        }

        return null;
    }

    /**
     * Enhance context with provider configuration
     */
    async enhanceContextWithProvider(providerName, context) {
        const enhanced = { ...context };

        if (providerName && this.providerManager) {
            try {
                // Get provider configuration
                const providers = this.providerManager.getFilteredProviders({ name: providerName });
                if (providers && providers.length > 0) {
                    enhanced.provider = providers[0];
                    enhanced.providerName = providerName;
                }
            } catch (error) {
                logger.warn(`Failed to enhance context with provider ${providerName}: ${error.message}`);
            }
        }

        return enhanced;
    }

    /**
     * Enhance parsing result with additional metadata
     */
    async enhanceResult(result, context) {
        const enhanced = { ...result };

        // Add timestamp
        enhanced.parsed_at = new Date().toISOString();

        // Add provider information
        if (context.provider) {
            enhanced.provider_info = {
                name: context.provider.name || context.provider.provider_name,
                base_url: context.provider.base_url,
                priority: context.provider.priority
            };
        }

        // Add parsing metadata
        enhanced.metadata = {
            ...enhanced.metadata,
            parser_version: '1.0.0',
            strategies_attempted: this.strategies.length,
            fallback_used: enhanced.fallback_used || false
        };

        return enhanced;
    }

    /**
     * Validate and enhance extracted models
     */
    async validateAndEnhanceModels(models, context) {
        if (!Array.isArray(models)) return [];

        const validModels = [];

        for (const model of models) {
            try {
                // Basic validation
                if (!model || (!model.id && !model.name)) {
                    continue;
                }

                // Enhance model with additional information
                const enhancedModel = await this.enhanceModel(model, context);

                // Validate against schema if available
                if (this.isValidModel(enhancedModel)) {
                    validModels.push(enhancedModel);
                }
            } catch (error) {
                logger.warn(`Model validation failed: ${error.message}`, model);
                continue;
            }
        }

        return validModels;
    }

    /**
     * Enhance individual model with additional information
     */
    async enhanceModel(model, context) {
        const enhanced = { ...model };

        // Ensure ID is present
        if (!enhanced.id) {
            enhanced.id = enhanced.name || enhanced.modelId || `model_${Date.now()}`;
        }

        // Set provider if not present
        if (!enhanced.provider) {
            enhanced.provider = context.providerName || 'unknown';
        }

        // Add timestamps
        enhanced.discovered_at = new Date().toISOString();
        enhanced.last_updated = new Date().toISOString();

        // Add source information
        enhanced.source = {
            parser: 'dynamic-parser',
            strategy: context.strategy || 'unknown',
            provider_context: context.providerName || 'unknown'
        };

        // Infer capabilities if not present
        if (!enhanced.capabilities || enhanced.capabilities.length === 0) {
            enhanced.capabilities = this.inferCapabilities(enhanced);
        }

        return enhanced;
    }

    /**
     * Detect free tier models using pricing detector
     */
    detectFreeTierModels(models) {
        return models.filter(model => {
            const pricingAnalysis = this.pricingDetector.analyzeModelPricing(model);
            return pricingAnalysis.isFree;
        });
    }

    /**
     * Infer capabilities from model information
     */
    inferCapabilities(model) {
        const capabilities = [];

        // From model name
        if (model.name) {
            const nameLower = model.name.toLowerCase();
            if (nameLower.includes('gpt') || nameLower.includes('llama') || nameLower.includes('mistral')) {
                capabilities.push('text-generation', 'conversation');
            }
            if (nameLower.includes('embed')) {
                capabilities.push('embeddings');
            }
            if (nameLower.includes('dall') || nameLower.includes('stable')) {
                capabilities.push('image-generation');
            }
        }

        // From existing capabilities
        if (model.capabilities && Array.isArray(model.capabilities)) {
            capabilities.push(...model.capabilities);
        }

        // From tags
        if (model.tags && Array.isArray(model.tags)) {
            model.tags.forEach(tag => {
                const tagLower = tag.toLowerCase();
                if (tagLower.includes('conversational')) capabilities.push('conversation');
                if (tagLower.includes('multilingual')) capabilities.push('multilingual');
            });
        }

        return [...new Set(capabilities)];
    }

    /**
     * Check if parsing result is successful
     */
    isSuccessfulParse(result) {
        return result &&
               typeof result === 'object' &&
               !result.error &&
               (result.content || result.models || result.embeddings || result.data);
    }

    /**
     * Validate model structure
     */
    isValidModel(model) {
        return model &&
               typeof model === 'object' &&
               (model.id || model.name) &&
               typeof (model.id || model.name) === 'string';
    }

    /**
     * Create cache key for response
     */
    createCacheKey(response, providerName, context) {
        const responseHash = typeof response === 'object' ?
            JSON.stringify(response).slice(0, 100) : String(response).slice(0, 100);
        const contextHash = JSON.stringify(context).slice(0, 50);

        return `${providerName || 'unknown'}_${responseHash}_${contextHash}`;
    }

    /**
     * Get cached result
     */
    getCachedResult(key) {
        const cached = this.parseCache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        // Remove expired cache entry
        if (cached) {
            this.parseCache.delete(key);
        }

        return null;
    }

    /**
     * Set cached result
     */
    setCachedResult(key, data) {
        this.parseCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    /**
     * Create error result
     */
    createErrorResult(response, errorType, context, details = null) {
        return {
            error: true,
            error_type: errorType,
            error_details: details,
            raw_response: response,
            context: context,
            timestamp: new Date().toISOString(),
            metadata: {
                parser_version: '1.0.0',
                strategies_available: this.strategies.length
            }
        };
    }

    /**
     * Get parsing statistics
     */
    getStats() {
        const cacheSize = this.parseCache.size;
        const successRate = this.stats.totalParses > 0 ?
            (this.stats.successfulParses / this.stats.totalParses * 100).toFixed(2) : 0;

        return {
            ...this.stats,
            cache_size: cacheSize,
            success_rate: `${successRate}%`,
            cache_hit_rate: this.stats.totalParses > 0 ?
                (this.stats.cacheHits / this.stats.totalParses * 100).toFixed(2) : 0
        };
    }

    /**
     * Clear parse cache
     */
    clearCache() {
        this.parseCache.clear();
        logger.info('Parse cache cleared');
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalParses: 0,
            successfulParses: 0,
            fallbackParses: 0,
            failedParses: 0,
            cacheHits: 0,
            modelsExtracted: 0,
            freeModelsFound: 0
        };
        logger.info('Parser statistics reset');
    }

    /**
     * Add custom parsing strategy
     */
    addStrategy(strategy, priority = 'low') {
        if (priority === 'high') {
            this.strategies.unshift(strategy);
        } else {
            this.strategies.push(strategy);
        }

        // Update fallback parser with new strategies
        this.fallbackParser = new FallbackParser(this.strategies);

        logger.info(`Added parsing strategy: ${strategy.name} with ${priority} priority`);
    }

    /**
     * Remove parsing strategy
     */
    removeStrategy(strategyName) {
        const initialLength = this.strategies.length;
        this.strategies = this.strategies.filter(s => s.name !== strategyName);

        if (this.strategies.length < initialLength) {
            // Update fallback parser
            this.fallbackParser = new FallbackParser(this.strategies);
            logger.info(`Removed parsing strategy: ${strategyName}`);
            return true;
        }

        return false;
    }
}

module.exports = DynamicModelParser;