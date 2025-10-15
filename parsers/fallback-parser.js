/**
 * Recursive Fallback Parser
 * Implements intelligent fallback mechanisms for unknown response formats
 */

const logger = require('../utils/logger');

class FallbackParser {
    constructor(strategies = []) {
        this.strategies = strategies;
        this.maxDepth = 5; // Maximum recursion depth
        this.attempts = new Map(); // Track parsing attempts to avoid loops
    }

    /**
     * Parse response with recursive fallback
     */
    parse(response, context = {}, depth = 0) {
        try {
            // Prevent infinite recursion
            if (depth >= this.maxDepth) {
                logger.warn(`Maximum fallback depth reached (${this.maxDepth})`);
                return this.createFallbackResult(response, 'max_depth_reached');
            }

            // Create attempt key to track parsing attempts
            const attemptKey = this.createAttemptKey(response, context);
            if (this.attempts.has(attemptKey)) {
                logger.warn(`Circular fallback detected for attempt: ${attemptKey}`);
                return this.createFallbackResult(response, 'circular_fallback');
            }

            this.attempts.set(attemptKey, true);

            // Try each strategy in order
            for (const strategy of this.strategies) {
                try {
                    if (strategy.canHandle(response, context)) {
                        logger.debug(`Using strategy: ${strategy.name} at depth ${depth}`);
                        const result = strategy.parse(response, context);

                        if (this.isValidResult(result)) {
                            this.attempts.delete(attemptKey);
                            return {
                                ...result,
                                strategy: strategy.name,
                                depth: depth,
                                fallback_used: depth > 0
                            };
                        }
                    }
                } catch (error) {
                    logger.debug(`Strategy ${strategy.name} failed: ${error.message}`);
                    continue;
                }
            }

            // If no strategy worked, try generic fallback approaches
            const fallbackResult = this.tryGenericFallbacks(response, context, depth);
            if (fallbackResult) {
                this.attempts.delete(attemptKey);
                return fallbackResult;
            }

            // Final fallback - return raw response with metadata
            this.attempts.delete(attemptKey);
            return this.createFallbackResult(response, 'no_strategy_matched');

        } catch (error) {
            logger.error(`Fallback parser error at depth ${depth}: ${error.message}`);
            return this.createFallbackResult(response, 'parser_error', error.message);
        }
    }

    /**
     * Extract models with recursive fallback
     */
    extractModels(response, context = {}, depth = 0) {
        try {
            // Prevent infinite recursion
            if (depth >= this.maxDepth) {
                logger.warn(`Maximum fallback depth reached for model extraction (${this.maxDepth})`);
                return [];
            }

            // Try each strategy's model extraction
            for (const strategy of this.strategies) {
                try {
                    if (strategy.canHandle(response, context)) {
                        const models = strategy.extractModels(response, context);

                        if (this.isValidModelList(models)) {
                            return models.map(model => ({
                                ...model,
                                extraction_strategy: strategy.name,
                                extraction_depth: depth,
                                fallback_used: depth > 0
                            }));
                        }
                    }
                } catch (error) {
                    logger.debug(`Model extraction strategy ${strategy.name} failed: ${error.message}`);
                    continue;
                }
            }

            // Try generic model extraction fallbacks
            const fallbackModels = this.tryGenericModelFallbacks(response, context, depth);
            if (fallbackModels && fallbackModels.length > 0) {
                return fallbackModels;
            }

            return [];
        } catch (error) {
            logger.error(`Model extraction fallback error at depth ${depth}: ${error.message}`);
            return [];
        }
    }

    /**
     * Try generic fallback approaches for parsing
     */
    tryGenericFallbacks(response, context, depth) {
        // Fallback 1: Try to treat as JSON string
        if (typeof response === 'string') {
            try {
                const parsed = JSON.parse(response);
                logger.debug('Successfully parsed string as JSON in fallback');
                return this.parse(parsed, context, depth + 1);
            } catch (e) {
                // Not valid JSON, continue
            }
        }

        // Fallback 2: Try to extract from nested structures
        if (typeof response === 'object' && response !== null) {
            const nestedKeys = ['data', 'result', 'response', 'models', 'items'];

            for (const key of nestedKeys) {
                if (response[key] !== undefined) {
                    logger.debug(`Trying nested key '${key}' in fallback`);
                    const nestedResult = this.parse(response[key], context, depth + 1);
                    if (this.isValidResult(nestedResult)) {
                        return {
                            ...nestedResult,
                            nested_extraction: key,
                            depth: depth
                        };
                    }
                }
            }
        }

        // Fallback 3: Try array extraction if response is array-like
        if (Array.isArray(response) || (typeof response === 'object' && response !== null)) {
            const arrayLike = this.extractArrayLike(response);
            if (arrayLike && arrayLike.length > 0) {
                logger.debug('Extracted array-like structure in fallback');
                return {
                    models: arrayLike,
                    raw: response,
                    strategy: 'generic_array_fallback',
                    depth: depth,
                    fallback_used: true
                };
            }
        }

        return null;
    }

    /**
     * Try generic model extraction fallbacks
     */
    tryGenericModelFallbacks(response, context, depth) {
        // Fallback 1: Look for common model list patterns
        if (typeof response === 'object' && response !== null) {
            const modelKeys = ['models', 'data', 'items', 'results'];

            for (const key of modelKeys) {
                if (Array.isArray(response[key])) {
                    logger.debug(`Found model array in key '${key}' during fallback`);
                    return this.normalizeGenericModels(response[key], context);
                }
            }
        }

        // Fallback 2: If response is an array, treat as models
        if (Array.isArray(response)) {
            logger.debug('Treating array response as models in fallback');
            return this.normalizeGenericModels(response, context);
        }

        // Fallback 3: Try to extract single model
        if (typeof response === 'object' && response !== null) {
            const singleModel = this.extractSingleModel(response, context);
            if (singleModel) {
                return [singleModel];
            }
        }

        return [];
    }

    /**
     * Extract array-like structures from complex objects
     */
    extractArrayLike(obj) {
        if (Array.isArray(obj)) return obj;

        // Try to find array properties
        for (const [key, value] of Object.entries(obj)) {
            if (Array.isArray(value) && value.length > 0) {
                return value;
            }
        }

        // Check if object values form an array-like structure
        const values = Object.values(obj);
        if (values.length > 0 && values.every(v => typeof v === 'object')) {
            return values;
        }

        return null;
    }

    /**
     * Normalize generic model objects
     */
    normalizeGenericModels(models, context) {
        if (!Array.isArray(models)) return [];

        return models.map((model, index) => {
            if (typeof model === 'string') {
                // Simple string model name
                return {
                    id: model,
                    name: model,
                    provider: context.provider || 'unknown',
                    capabilities: this.inferCapabilitiesFromName(model),
                    pricing: null,
                    metadata: { original_index: index }
                };
            } else if (typeof model === 'object' && model !== null) {
                // Complex model object
                return {
                    id: model.id || model.name || model.modelId || `model_${index}`,
                    name: model.name || model.id || `Model ${index}`,
                    provider: context.provider || model.provider || 'unknown',
                    capabilities: this.extractCapabilities(model),
                    pricing: this.extractPricing(model),
                    metadata: { ...model, original_index: index }
                };
            }

            return null;
        }).filter(Boolean);
    }

    /**
     * Extract single model from object
     */
    extractSingleModel(obj, context) {
        // Check if object looks like a model
        if (obj.id || obj.name || obj.modelId) {
            return {
                id: obj.id || obj.name || obj.modelId,
                name: obj.name || obj.id,
                provider: context.provider || obj.provider || 'unknown',
                capabilities: this.extractCapabilities(obj),
                pricing: this.extractPricing(obj),
                metadata: obj
            };
        }

        return null;
    }

    /**
     * Infer capabilities from model name
     */
    inferCapabilitiesFromName(name) {
        if (typeof name !== 'string') return [];

        const capabilities = [];
        const lowerName = name.toLowerCase();

        if (lowerName.includes('gpt') || lowerName.includes('llama') || lowerName.includes('mistral')) {
            capabilities.push('text-generation', 'conversation');
        }
        if (lowerName.includes('embed') || lowerName.includes('embedding')) {
            capabilities.push('embeddings');
        }
        if (lowerName.includes('dall') || lowerName.includes('stable-diffusion')) {
            capabilities.push('image-generation');
        }
        if (lowerName.includes('whisper')) {
            capabilities.push('speech-to-text');
        }
        if (lowerName.includes('tts')) {
            capabilities.push('text-to-speech');
        }

        return capabilities;
    }

    /**
     * Extract capabilities from model object
     */
    extractCapabilities(model) {
        const capabilities = [];

        if (model.capabilities && Array.isArray(model.capabilities)) {
            capabilities.push(...model.capabilities);
        }

        if (model.tags && Array.isArray(model.tags)) {
            model.tags.forEach(tag => {
                const tagLower = tag.toLowerCase();
                if (tagLower.includes('conversational') || tagLower.includes('chat')) {
                    capabilities.push('conversation');
                }
                if (tagLower.includes('embedding')) {
                    capabilities.push('embeddings');
                }
                if (tagLower.includes('image') || tagLower.includes('generation')) {
                    capabilities.push('image-generation');
                }
            });
        }

        return [...new Set(capabilities)];
    }

    /**
     * Extract pricing from model object
     */
    extractPricing(model) {
        const pricingKeys = ['pricing', 'cost', 'price', 'rates'];

        for (const key of pricingKeys) {
            if (model[key]) return model[key];
        }

        return null;
    }

    /**
     * Create a unique key for tracking parsing attempts
     */
    createAttemptKey(response, context) {
        const responseType = Array.isArray(response) ? 'array' : typeof response;
        const responseSize = typeof response === 'object' && response !== null ?
            JSON.stringify(response).length : String(response).length;
        const contextKey = context.provider || 'unknown';

        return `${responseType}_${responseSize}_${contextKey}`;
    }

    /**
     * Check if parsing result is valid
     */
    isValidResult(result) {
        return result && typeof result === 'object' &&
               (result.content || result.models || result.embeddings || result.raw);
    }

    /**
     * Check if model list is valid
     */
    isValidModelList(models) {
        return Array.isArray(models) && models.length > 0 &&
               models.every(model => model && (model.id || model.name));
    }

    /**
     * Create fallback result when all strategies fail
     */
    createFallbackResult(response, reason, error = null) {
        return {
            raw: response,
            strategy: 'fallback',
            fallback_reason: reason,
            error: error,
            fallback_used: true,
            depth: 0,
            metadata: {
                parsing_failed: true,
                failure_reason: reason,
                response_type: typeof response,
                response_keys: typeof response === 'object' && response !== null ?
                    Object.keys(response) : null,
                timestamp: new Date().toISOString()
            }
        };
    }

    /**
     * Reset attempt tracking (useful for testing)
     */
    reset() {
        this.attempts.clear();
    }

    /**
     * Get parsing statistics
     */
    getStats() {
        return {
            strategies_count: this.strategies.length,
            max_depth: this.maxDepth,
            current_attempts: this.attempts.size
        };
    }
}

module.exports = FallbackParser;