/**
 * Format Strategy Implementations
 * Multiple parsing strategies for diverse API response formats
 */

const logger = require('../utils/logger');

class FormatStrategy {
    constructor(name, description) {
        this.name = name;
        this.description = description;
    }

    /**
     * Test if this strategy can handle the given response
     */
    canHandle(response, context = {}) {
        throw new Error('canHandle must be implemented by subclass');
    }

    /**
     * Parse the response using this strategy
     */
    parse(response, context = {}) {
        throw new Error('parse must be implemented by subclass');
    }

    /**
     * Extract models from response
     */
    extractModels(response, context = {}) {
        throw new Error('extractModels must be implemented by subclass');
    }
}

/**
 * OpenAI Format Strategy
 * Handles OpenAI-compatible API responses
 */
class OpenAIFormatStrategy extends FormatStrategy {
    constructor() {
        super('openai', 'OpenAI-compatible API response format');
    }

    canHandle(response, context = {}) {
        // Check for OpenAI-style response structure
        if (response && typeof response === 'object') {
            // Check for choices array (completions)
            if (response.choices && Array.isArray(response.choices)) {
                return true;
            }
            // Check for data array (models list)
            if (response.data && Array.isArray(response.data)) {
                return true;
            }
            // Check for embeddings data
            if (response.data && Array.isArray(response.data) && response.data[0] && typeof response.data[0] === 'number') {
                return true;
            }
        }
        return false;
    }

    parse(response, context = {}) {
        try {
            if (response.choices && Array.isArray(response.choices)) {
                // Chat completion response
                return {
                    content: response.choices[0]?.message?.content || response.choices[0]?.text,
                    usage: response.usage,
                    model: response.model,
                    finish_reason: response.choices[0]?.finish_reason,
                    raw: response
                };
            }

            if (response.data && Array.isArray(response.data)) {
                // Models list or embeddings response
                if (response.data[0] && typeof response.data[0] === 'number') {
                    // Embeddings response
                    return {
                        embeddings: response.data,
                        usage: response.usage,
                        model: response.model,
                        raw: response
                    };
                } else {
                    // Models list
                    return {
                        models: response.data,
                        raw: response
                    };
                }
            }

            return { raw: response };
        } catch (error) {
            logger.error(`OpenAI format parsing error: ${error.message}`);
            return { raw: response, error: error.message };
        }
    }

    extractModels(response, context = {}) {
        try {
            if (response.data && Array.isArray(response.data)) {
                return response.data.map(model => ({
                    id: model.id,
                    name: model.id,
                    provider: context.provider || context.providerName || 'openai',
                    capabilities: this.inferCapabilities(model.id),
                    pricing: this.extractPricing(model),
                    metadata: {
                        owned_by: model.owned_by,
                        created: model.created,
                        object: model.object
                    }
                }));
            }
            return [];
        } catch (error) {
            logger.error(`OpenAI model extraction error: ${error.message}`);
            return [];
        }
    }

    inferCapabilities(modelId) {
        const capabilities = [];
        const id = modelId.toLowerCase();

        if (id.includes('gpt')) capabilities.push('text-generation', 'conversation');
        if (id.includes('embedding')) capabilities.push('embeddings');
        if (id.includes('dall-e') || id.includes('dalle')) capabilities.push('image-generation');
        if (id.includes('whisper')) capabilities.push('speech-to-text');
        if (id.includes('tts')) capabilities.push('text-to-speech');

        return capabilities;
    }

    extractPricing(model) {
        // OpenAI pricing is typically not included in model list responses
        // This would need to be handled separately or from configuration
        return null;
    }
}

/**
 * Array Format Strategy
 * Handles simple array-based model lists
 */
class ArrayFormatStrategy extends FormatStrategy {
    constructor() {
        super('array', 'Simple array-based model list format');
    }

    canHandle(response, context = {}) {
        return Array.isArray(response) && response.length > 0;
    }

    parse(response, context = {}) {
        try {
            return {
                models: response,
                raw: response
            };
        } catch (error) {
            logger.error(`Array format parsing error: ${error.message}`);
            return { raw: response, error: error.message };
        }
    }

    extractModels(response, context = {}) {
        try {
            if (!Array.isArray(response)) return [];

            return response.map(item => {
                if (typeof item === 'string') {
                    // Simple string array of model names
                    return {
                        id: item,
                        name: item,
                        provider: context.provider || context.providerName || 'unknown',
                        capabilities: this.inferCapabilitiesFromName(item),
                        pricing: null
                    };
                } else if (typeof item === 'object') {
                    // Object array with model details
                    return {
                        id: item.id || item.name || item.modelId,
                        name: item.name || item.id,
                        provider: context.provider || context.providerName || item.provider || 'unknown',
                        capabilities: this.inferCapabilitiesFromObject(item),
                        pricing: this.extractPricingFromObject(item),
                        metadata: item
                    };
                }
                return null;
            }).filter(Boolean);
        } catch (error) {
            logger.error(`Array model extraction error: ${error.message}`);
            return [];
        }
    }

    inferCapabilitiesFromName(name) {
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

        return capabilities;
    }

    inferCapabilitiesFromObject(item) {
        const capabilities = [];

        // Check various possible capability indicators
        if (item.capabilities && Array.isArray(item.capabilities)) {
            capabilities.push(...item.capabilities);
        }
        if (item.pipeline_tag) {
            switch (item.pipeline_tag) {
                case 'text-generation':
                    capabilities.push('text-generation', 'conversation');
                    break;
                case 'feature-extraction':
                    capabilities.push('embeddings');
                    break;
                case 'text-to-image':
                    capabilities.push('image-generation');
                    break;
            }
        }

        return [...new Set(capabilities)];
    }

    extractPricingFromObject(item) {
        // Look for pricing information in various formats
        if (item.pricing) return item.pricing;
        if (item.cost) return item.cost;
        if (item.price) return item.price;

        // Check for nested pricing structures
        const pricingKeys = ['pricing', 'cost', 'price', 'rates'];
        for (const key of pricingKeys) {
            if (item[key]) return item[key];
        }

        return null;
    }
}

/**
 * Catalog Format Strategy
 * Handles catalog-style responses with nested model information
 */
class CatalogFormatStrategy extends FormatStrategy {
    constructor() {
        super('catalog', 'Catalog-style response with nested model data');
    }

    canHandle(response, context = {}) {
        if (!response || typeof response !== 'object') return false;

        // Check for catalog-like structures
        return response.models || response.data || response.items ||
               (response.catalog && response.catalog.models) ||
               Object.keys(response).some(key => Array.isArray(response[key]) && response[key].length > 0);
    }

    parse(response, context = {}) {
        try {
            let models = [];

            // Extract models from various catalog structures
            if (response.models && Array.isArray(response.models)) {
                models = response.models;
            } else if (response.data && Array.isArray(response.data)) {
                models = response.data;
            } else if (response.items && Array.isArray(response.items)) {
                models = response.items;
            } else if (response.catalog && response.catalog.models) {
                models = response.catalog.models;
            } else {
                // Try to find arrays in the response
                for (const [key, value] of Object.entries(response)) {
                    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
                        models = value;
                        break;
                    }
                }
            }

            return {
                models: models,
                metadata: this.extractMetadata(response),
                raw: response
            };
        } catch (error) {
            logger.error(`Catalog format parsing error: ${error.message}`);
            return { raw: response, error: error.message };
        }
    }

    extractModels(response, context = {}) {
        try {
            const parsed = this.parse(response, context);
            if (!parsed.models || !Array.isArray(parsed.models)) return [];

            return parsed.models.map(model => ({
                id: model.id || model.name || model.modelId,
                name: model.name || model.id,
                provider: context.provider || context.providerName || model.provider || 'unknown',
                capabilities: this.extractCapabilities(model),
                pricing: this.extractPricing(model),
                metadata: model
            })).filter(model => model.id);
        } catch (error) {
            logger.error(`Catalog model extraction error: ${error.message}`);
            return [];
        }
    }

    extractMetadata(response) {
        const metadata = {};

        // Extract pagination info
        if (response.pagination) {
            metadata.pagination = response.pagination;
        }
        if (response.total) {
            metadata.total = response.total;
        }
        if (response.count) {
            metadata.count = response.count;
        }

        // Extract timestamps
        if (response.updated_at) {
            metadata.last_updated = response.updated_at;
        }
        if (response.generated_at) {
            metadata.generated_at = response.generated_at;
        }

        return metadata;
    }

    extractCapabilities(model) {
        const capabilities = [];

        // Check direct capabilities array
        if (model.capabilities && Array.isArray(model.capabilities)) {
            capabilities.push(...model.capabilities);
        }

        // Check tags
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

        // Infer from model name/type
        if (model.type || model.model_type) {
            const type = (model.type || model.model_type).toLowerCase();
            if (type.includes('text') || type.includes('language')) {
                capabilities.push('text-generation');
            }
            if (type.includes('vision')) {
                capabilities.push('vision');
            }
        }

        return [...new Set(capabilities)];
    }

    extractPricing(model) {
        // Look for pricing in various nested structures
        if (model.pricing) return model.pricing;
        if (model.cost) return model.cost;
        if (model.price) return model.price;

        // Check for nested pricing objects
        if (model.billing) return model.billing;
        if (model.rates) return model.rates;

        return null;
    }
}

/**
 * HuggingFace Format Strategy
 * Handles HuggingFace Hub API responses
 */
class HuggingFaceFormatStrategy extends FormatStrategy {
    constructor() {
        super('huggingface', 'HuggingFace Hub API response format');
    }

    canHandle(response, context = {}) {
        if (!response || typeof response !== 'object') return false;

        // Check for HF-specific patterns
        if (Array.isArray(response)) {
            return response.length > 0 && response[0] &&
                   (response[0].id || response[0].modelId || response[0].pipeline_tag);
        }

        // Check for single model response
        return response.id || response.modelId || response.pipeline_tag;
    }

    parse(response, context = {}) {
        try {
            if (Array.isArray(response)) {
                // Models list response
                return {
                    models: response.map(model => this.normalizeModel(model)),
                    raw: response
                };
            } else {
                // Single model response
                return {
                    model: this.normalizeModel(response),
                    raw: response
                };
            }
        } catch (error) {
            logger.error(`HuggingFace format parsing error: ${error.message}`);
            return { raw: response, error: error.message };
        }
    }

    extractModels(response, context = {}) {
        try {
            if (Array.isArray(response)) {
                return response.map(model => ({
                    id: model.id || model.modelId,
                    name: model.id || model.modelId,
                    provider: 'huggingface',
                    capabilities: this.extractCapabilities(model),
                    pricing: { tier: 'free' }, // HF models are generally free
                    metadata: {
                        pipeline_tag: model.pipeline_tag,
                        tags: model.tags,
                        downloads: model.downloads,
                        likes: model.likes,
                        private: model.private,
                        gated: model.gated
                    }
                }));
            } else if (response.id || response.modelId) {
                return [this.extractModelFromObject(response)];
            }

            return [];
        } catch (error) {
            logger.error(`HuggingFace model extraction error: ${error.message}`);
            return [];
        }
    }

    normalizeModel(model) {
        return {
            id: model.id || model.modelId,
            name: model.id || model.modelId,
            pipeline_tag: model.pipeline_tag,
            tags: model.tags || [],
            downloads: model.downloads || 0,
            likes: model.likes || 0,
            private: model.private || false,
            gated: model.gated || false,
            ...model
        };
    }

    extractCapabilities(model) {
        const capabilities = [];

        if (model.pipeline_tag) {
            switch (model.pipeline_tag) {
                case 'text-generation':
                    capabilities.push('text-generation', 'conversation');
                    break;
                case 'text2text-generation':
                    capabilities.push('text-generation', 'translation');
                    break;
                case 'feature-extraction':
                    capabilities.push('embeddings');
                    break;
                case 'text-to-image':
                    capabilities.push('image-generation');
                    break;
                case 'automatic-speech-recognition':
                    capabilities.push('speech-to-text');
                    break;
                case 'text-to-speech':
                    capabilities.push('text-to-speech');
                    break;
                case 'image-to-text':
                    capabilities.push('vision', 'image-understanding');
                    break;
            }
        }

        // Infer from tags
        if (model.tags && Array.isArray(model.tags)) {
            model.tags.forEach(tag => {
                const tagLower = tag.toLowerCase();
                if (tagLower.includes('conversational')) capabilities.push('conversation');
                if (tagLower.includes('multilingual')) capabilities.push('multilingual');
                if (tagLower.includes('code')) capabilities.push('code-generation');
            });
        }

        return [...new Set(capabilities)];
    }

    extractModelFromObject(model) {
        return {
            id: model.id || model.modelId,
            name: model.id || model.modelId,
            provider: 'huggingface',
            capabilities: this.extractCapabilities(model),
            pricing: { tier: 'free' },
            metadata: model
        };
    }
}

module.exports = {
    FormatStrategy,
    OpenAIFormatStrategy,
    ArrayFormatStrategy,
    CatalogFormatStrategy,
    HuggingFaceFormatStrategy
};