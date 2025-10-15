/**
 * Pricing Detector
 * Analyzes pricing information to detect free tier models and cost structures
 */

const logger = require('../utils/logger');

class PricingDetector {
    constructor() {
        this.freeTierIndicators = [
            'free',
            'trial',
            'demo',
            'preview',
            'beta',
            'community',
            'open-source',
            'academic'
        ];

        this.costThresholds = {
            textGeneration: {
                free: 0.0001, // $0.0001 per token or similar
                low: 0.001,
                medium: 0.01,
                high: 0.1
            },
            imageGeneration: {
                free: 0.01, // $0.01 per image
                low: 0.1,
                medium: 1.0,
                high: 10.0
            },
            embeddings: {
                free: 0.00001,
                low: 0.0001,
                medium: 0.001,
                high: 0.01
            }
        };
    }

    /**
     * Detect if a model is free tier based on pricing analysis
     */
    isFreeTier(model, pricing = null) {
        try {
            // If explicit pricing is provided, analyze it
            if (pricing) {
                return this.analyzePricingStructure(pricing);
            }

            // Check model metadata for free tier indicators
            if (model.metadata) {
                return this.checkMetadataForFreeTier(model.metadata);
            }

            // Check model name/tags for free indicators
            if (model.name) {
                return this.checkNameForFreeTier(model.name);
            }

            if (model.tags && Array.isArray(model.tags)) {
                return this.checkTagsForFreeTier(model.tags);
            }

            // Default to not free if no pricing information
            return false;
        } catch (error) {
            logger.error(`Free tier detection error for model ${model.id}: ${error.message}`);
            return false;
        }
    }

    /**
     * Analyze pricing structure to determine if it's free
     */
    analyzePricingStructure(pricing) {
        try {
            // Handle different pricing formats
            if (typeof pricing === 'string') {
                return this.isFreeTierString(pricing);
            }

            if (typeof pricing === 'number') {
                return pricing === 0 || pricing < 0.000001; // Effectively free
            }

            if (typeof pricing === 'object') {
                return this.analyzePricingObject(pricing);
            }

            return false;
        } catch (error) {
            logger.error(`Pricing structure analysis error: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if pricing string indicates free tier
     */
    isFreeTierString(pricingStr) {
        const lowerPricing = pricingStr.toLowerCase();

        // Check for explicit free indicators
        if (this.freeTierIndicators.some(indicator => lowerPricing.includes(indicator))) {
            return true;
        }

        // Check for zero pricing
        if (lowerPricing.includes('$0') || lowerPricing.includes('0.00')) {
            return true;
        }

        // Check for "free" in various formats
        if (lowerPricing.includes('free') || lowerPricing.includes('gratis')) {
            return true;
        }

        return false;
    }

    /**
     * Analyze pricing object structure
     */
    analyzePricingObject(pricing) {
        // Check for explicit free tier flag
        if (pricing.free === true || pricing.is_free === true) {
            return true;
        }

        // Check tier information
        if (pricing.tier) {
            const tier = pricing.tier.toLowerCase();
            if (tier === 'free' || tier === 'community' || tier === 'open') {
                return true;
            }
        }

        // Check cost values
        if (this.hasZeroOrMinimalCosts(pricing)) {
            return true;
        }

        // Check for rate limits without costs
        if (pricing.rate_limit && !pricing.cost && !pricing.price) {
            return true;
        }

        return false;
    }

    /**
     * Check if pricing object has zero or minimal costs
     */
    hasZeroOrMinimalCosts(pricing) {
        const costFields = ['cost', 'price', 'input_cost', 'output_cost', 'per_token', 'per_request'];

        for (const field of costFields) {
            if (pricing[field] !== undefined) {
                const cost = pricing[field];
                if (typeof cost === 'number' && cost <= 0.000001) { // Effectively free
                    return true;
                }
                if (typeof cost === 'string' && this.isFreeTierString(cost)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Check model metadata for free tier indicators
     */
    checkMetadataForFreeTier(metadata) {
        // Check for free tier flags
        if (metadata.free === true || metadata.is_free === true) {
            return true;
        }

        // Check access type
        if (metadata.access === 'free' || metadata.access === 'public') {
            return true;
        }

        // Check license information
        if (metadata.license) {
            const license = metadata.license.toLowerCase();
            if (license.includes('mit') || license.includes('apache') || license.includes('bsd')) {
                return true; // Open source often implies free usage
            }
        }

        // Check for HuggingFace-specific free indicators
        if (metadata.private === false && metadata.gated === false) {
            return true; // Public HF models are typically free
        }

        return false;
    }

    /**
     * Check model name for free tier indicators
     */
    checkNameForFreeTier(name) {
        const lowerName = name.toLowerCase();

        return this.freeTierIndicators.some(indicator =>
            lowerName.includes(indicator)
        );
    }

    /**
     * Check model tags for free tier indicators
     */
    checkTagsForFreeTier(tags) {
        return tags.some(tag => {
            const lowerTag = tag.toLowerCase();
            return this.freeTierIndicators.some(indicator =>
                lowerTag.includes(indicator)
            );
        });
    }

    /**
     * Extract pricing information from various naming conventions
     */
    extractPricingFields(data, namingConventions = {}) {
        const pricing = {};

        // Default naming conventions
        const conventions = {
            cost: ['cost', 'price', 'pricing', 'rate'],
            inputCost: ['input_cost', 'input_price', 'prompt_cost'],
            outputCost: ['output_cost', 'output_price', 'completion_cost'],
            perToken: ['per_token', 'token_cost', 'cost_per_token'],
            perRequest: ['per_request', 'request_cost', 'cost_per_request'],
            perImage: ['per_image', 'image_cost', 'cost_per_image'],
            free: ['free', 'is_free', 'free_tier'],
            tier: ['tier', 'plan', 'subscription'],
            ...namingConventions
        };

        // Extract pricing fields using conventions
        for (const [field, possibleNames] of Object.entries(conventions)) {
            for (const name of possibleNames) {
                if (data[name] !== undefined) {
                    pricing[field] = data[name];
                    break;
                }
            }
        }

        // Handle nested pricing structures
        if (data.pricing && typeof data.pricing === 'object') {
            Object.assign(pricing, data.pricing);
        }

        if (data.costs && typeof data.costs === 'object') {
            Object.assign(pricing, data.costs);
        }

        return pricing;
    }

    /**
     * Classify cost level for a given capability
     */
    classifyCostLevel(cost, capability) {
        if (!cost || typeof cost !== 'number') {
            return 'unknown';
        }

        const thresholds = this.costThresholds[capability] || this.costThresholds.textGeneration;

        if (cost <= thresholds.free) return 'free';
        if (cost <= thresholds.low) return 'low';
        if (cost <= thresholds.medium) return 'medium';
        return 'high';
    }

    /**
     * Get comprehensive pricing analysis for a model
     */
    analyzeModelPricing(model, rawPricing = null) {
        try {
            const analysis = {
                isFree: false,
                costLevel: 'unknown',
                pricing: null,
                confidence: 0,
                indicators: []
            };

            // Extract pricing information
            let pricing = rawPricing;
            if (!pricing) {
                pricing = this.extractPricingFields(model);
                if (model.metadata) {
                    const metadataPricing = this.extractPricingFields(model.metadata);
                    pricing = { ...pricing, ...metadataPricing };
                }
            }

            analysis.pricing = pricing;

            // Determine if free tier
            analysis.isFree = this.isFreeTier(model, pricing);
            if (analysis.isFree) {
                analysis.indicators.push('free_tier_detected');
                analysis.confidence = 0.9;
            }

            // Classify cost level
            if (pricing && typeof pricing === 'object') {
                const primaryCost = pricing.cost || pricing.price || pricing.per_token || pricing.per_request;
                if (primaryCost && typeof primaryCost === 'number') {
                    analysis.costLevel = this.classifyCostLevel(primaryCost, model.capabilities?.[0] || 'textGeneration');
                }
            }

            // Check for additional indicators
            if (model.metadata?.private === false) {
                analysis.indicators.push('public_access');
                analysis.confidence = Math.max(analysis.confidence, 0.7);
            }

            if (model.provider === 'huggingface') {
                analysis.indicators.push('huggingface_model');
                if (!model.metadata?.gated) {
                    analysis.confidence = Math.max(analysis.confidence, 0.8);
                }
            }

            return analysis;
        } catch (error) {
            logger.error(`Model pricing analysis error for ${model.id}: ${error.message}`);
            return {
                isFree: false,
                costLevel: 'unknown',
                pricing: null,
                confidence: 0,
                indicators: ['error'],
                error: error.message
            };
        }
    }

    /**
     * Batch analyze multiple models for free tier detection
     */
    analyzeModelsBatch(models) {
        const results = {};

        models.forEach(model => {
            if (model.id) {
                results[model.id] = this.analyzeModelPricing(model);
            }
        });

        return results;
    }

    /**
     * Get free tier models from a list
     */
    getFreeTierModels(models) {
        return models.filter(model => this.isFreeTier(model));
    }

    /**
     * Get cost analysis summary
     */
    getCostAnalysisSummary(models) {
        const analysis = this.analyzeModelsBatch(models);

        const summary = {
            total: models.length,
            free: 0,
            low: 0,
            medium: 0,
            high: 0,
            unknown: 0,
            freeModels: [],
            costDistribution: {}
        };

        Object.entries(analysis).forEach(([modelId, modelAnalysis]) => {
            if (modelAnalysis.isFree) {
                summary.free++;
                summary.freeModels.push(modelId);
            }

            const costLevel = modelAnalysis.costLevel;
            summary[costLevel] = (summary[costLevel] || 0) + 1;

            if (!summary.costDistribution[costLevel]) {
                summary.costDistribution[costLevel] = [];
            }
            summary.costDistribution[costLevel].push(modelId);
        });

        return summary;
    }
}

module.exports = PricingDetector;