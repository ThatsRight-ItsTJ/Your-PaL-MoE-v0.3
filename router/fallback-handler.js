/**
 * Fallback Handler for Intelligent Router
 * Manages fallback logic when primary routing fails
 * Handles graceful degradation to alternative providers/models
 */

const logger = require('../utils/logger');

class FallbackHandler {
    constructor(decisionEngine, loadBalancer, cacheManager) {
        this.decisionEngine = decisionEngine;
        this.loadBalancer = loadBalancer;
        this.cacheManager = cacheManager;

        // Fallback strategies
        this.strategies = {
            EQUIVALENT_MODEL: 'equivalent_model',
            SIMILAR_PROVIDER: 'similar_provider',
            DOWNGRADE_MODEL: 'downgrade_model',
            PAID_FALLBACK: 'paid_fallback',
            QUEUE_REQUEST: 'queue_request'
        };

        // Fallback configuration
        this.config = {
            maxFallbackAttempts: 3,
            fallbackTimeout: 30000, // 30 seconds
            enablePaidFallback: true,
            allowModelDowngrade: true,
            queueOnFailure: true,
            retryDelay: 1000 // 1 second
        };

        // Statistics
        this.stats = {
            totalFallbacks: 0,
            successfulFallbacks: 0,
            failedFallbacks: 0,
            fallbackStrategies: new Map(),
            averageFallbackTime: 0
        };

        logger.info('FallbackHandler initialized');
    }

    /**
     * Handle routing failure with fallback logic
     */
    async handleFallback(originalRequest, failureReason, userContext = {}) {
        try {
            this.stats.totalFallbacks++;
            const startTime = Date.now();

            logger.warn('Initiating fallback', {
                requestId: originalRequest.id,
                reason: failureReason
            });

            // Try fallback strategies in order
            const fallbackStrategies = this.determineFallbackStrategies(failureReason, userContext);

            for (const strategy of fallbackStrategies) {
                try {
                    const result = await this.executeFallbackStrategy(
                        strategy,
                        originalRequest,
                        failureReason,
                        userContext
                    );

                    if (result.success) {
                        const duration = Date.now() - startTime;
                        this.stats.successfulFallbacks++;
                        this.updateStrategyStats(strategy, true, duration);

                        logger.info('Fallback successful', {
                            strategy,
                            requestId: originalRequest.id,
                            duration
                        });

                        return result;
                    }
                } catch (error) {
                    logger.warn('Fallback strategy failed', {
                        strategy,
                        error: error.message
                    });
                    this.updateStrategyStats(strategy, false);
                }
            }

            // All fallbacks failed
            this.stats.failedFallbacks++;
            const duration = Date.now() - startTime;

            logger.error('All fallback attempts failed', {
                requestId: originalRequest.id,
                attempts: fallbackStrategies.length,
                duration
            });

            return {
                success: false,
                error: 'All fallback strategies failed',
                attempts: fallbackStrategies.length,
                duration
            };

        } catch (error) {
            logger.error('Fallback handling failed', { error: error.message });
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Determine appropriate fallback strategies based on failure reason
     */
    determineFallbackStrategies(failureReason, userContext) {
        const strategies = [];

        switch (failureReason.type) {
            case 'provider_unhealthy':
                strategies.push(this.strategies.EQUIVALENT_MODEL);
                strategies.push(this.strategies.SIMILAR_PROVIDER);
                if (this.config.enablePaidFallback && userContext.plan === 'premium') {
                    strategies.push(this.strategies.PAID_FALLBACK);
                }
                break;

            case 'model_unavailable':
                strategies.push(this.strategies.EQUIVALENT_MODEL);
                strategies.push(this.strategies.SIMILAR_PROVIDER);
                if (this.config.allowModelDowngrade) {
                    strategies.push(this.strategies.DOWNGRADE_MODEL);
                }
                break;

            case 'rate_limit_exceeded':
                strategies.push(this.strategies.QUEUE_REQUEST);
                strategies.push(this.strategies.EQUIVALENT_MODEL);
                break;

            case 'capacity_exceeded':
                strategies.push(this.strategies.QUEUE_REQUEST);
                strategies.push(this.strategies.SIMILAR_PROVIDER);
                break;

            default:
                strategies.push(this.strategies.EQUIVALENT_MODEL);
                strategies.push(this.strategies.SIMILAR_PROVIDER);
                if (this.config.queueOnFailure) {
                    strategies.push(this.strategies.QUEUE_REQUEST);
                }
        }

        return strategies.slice(0, this.config.maxFallbackAttempts);
    }

    /**
     * Execute a specific fallback strategy
     */
    async executeFallbackStrategy(strategy, originalRequest, failureReason, userContext) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Fallback timeout')), this.config.fallbackTimeout);
        });

        const strategyPromise = this[strategy](originalRequest, failureReason, userContext);

        try {
            return await Promise.race([strategyPromise, timeoutPromise]);
        } catch (error) {
            throw new Error(`${strategy} failed: ${error.message}`);
        }
    }

    /**
     * Find equivalent model fallback
     */
    async equivalent_model(originalRequest, failureReason, userContext) {
        // Get the originally selected model
        const originalModel = failureReason.originalModel;

        if (!originalModel) {
            throw new Error('No original model specified for equivalent fallback');
        }

        // Find equivalent models
        const equivalents = await this.decisionEngine.findEquivalentModels(originalModel, userContext);

        if (equivalents.length === 0) {
            throw new Error('No equivalent models found');
        }

        // Try each equivalent model
        for (const equivalent of equivalents) {
            try {
                // Check if this provider is healthy
                const providerHealth = this.loadBalancer.providerManager.getProviderHealth(equivalent.provider);

                if (providerHealth.status === 'healthy' || providerHealth.status === 'degraded') {
                    // Balance load for this provider
                    const balanceResult = await this.loadBalancer.balanceRequest(
                        originalRequest,
                        [equivalent.provider]
                    );

                    if (balanceResult && !balanceResult.queued) {
                        return {
                            success: true,
                            strategy: this.strategies.EQUIVALENT_MODEL,
                            model: equivalent.model,
                            provider: equivalent.provider,
                            reasoning: `Equivalent model fallback: ${equivalent.similarity * 100}% similarity`
                        };
                    }
                }
            } catch (error) {
                logger.debug('Equivalent model attempt failed', {
                    model: equivalent.model.id,
                    error: error.message
                });
                continue;
            }
        }

        throw new Error('All equivalent models unavailable');
    }

    /**
     * Find similar provider fallback
     */
    async similar_provider(originalRequest, failureReason, userContext) {
        const failedProvider = failureReason.provider;

        // Find providers with similar models
        const similarProviders = await this.findSimilarProviders(failedProvider, originalRequest);

        if (similarProviders.length === 0) {
            throw new Error('No similar providers found');
        }

        // Try each similar provider
        for (const provider of similarProviders) {
            try {
                // Get a suitable model from this provider
                const model = await this.findBestModelForProvider(provider, originalRequest, userContext);

                if (model) {
                    // Balance load
                    const balanceResult = await this.loadBalancer.balanceRequest(
                        originalRequest,
                        [provider]
                    );

                    if (balanceResult && !balanceResult.queued) {
                        return {
                            success: true,
                            strategy: this.strategies.SIMILAR_PROVIDER,
                            model,
                            provider,
                            reasoning: `Similar provider fallback to ${provider}`
                        };
                    }
                }
            } catch (error) {
                logger.debug('Similar provider attempt failed', {
                    provider,
                    error: error.message
                });
                continue;
            }
        }

        throw new Error('All similar providers unavailable');
    }

    /**
     * Downgrade to simpler model
     */
    async downgrade_model(originalRequest, failureReason, userContext) {
        // Find simpler/cheaper models that can handle the request
        const downgradeModels = await this.findDowngradeModels(originalRequest, userContext);

        if (downgradeModels.length === 0) {
            throw new Error('No suitable downgrade models found');
        }

        // Try each downgrade model
        for (const modelInfo of downgradeModels) {
            try {
                const balanceResult = await this.loadBalancer.balanceRequest(
                    originalRequest,
                    [modelInfo.provider]
                );

                if (balanceResult && !balanceResult.queued) {
                    return {
                        success: true,
                        strategy: this.strategies.DOWNGRADE_MODEL,
                        model: modelInfo.model,
                        provider: modelInfo.provider,
                        reasoning: `Model downgrade to ${modelInfo.model.name}`
                    };
                }
            } catch (error) {
                logger.debug('Downgrade model attempt failed', {
                    model: modelInfo.model.id,
                    error: error.message
                });
                continue;
            }
        }

        throw new Error('All downgrade models unavailable');
    }

    /**
     * Fallback to paid model (premium users only)
     */
    async paid_fallback(originalRequest, failureReason, userContext) {
        if (userContext.plan !== 'premium') {
            throw new Error('Paid fallback not available for free users');
        }

        // Find paid models that can handle the request
        const paidModels = await this.findPaidModels(originalRequest, userContext);

        if (paidModels.length === 0) {
            throw new Error('No suitable paid models found');
        }

        // Try each paid model
        for (const modelInfo of paidModels) {
            try {
                const balanceResult = await this.loadBalancer.balanceRequest(
                    originalRequest,
                    [modelInfo.provider]
                );

                if (balanceResult && !balanceResult.queued) {
                    return {
                        success: true,
                        strategy: this.strategies.PAID_FALLBACK,
                        model: modelInfo.model,
                        provider: modelInfo.provider,
                        reasoning: `Paid model fallback to ${modelInfo.model.name}`
                    };
                }
            } catch (error) {
                logger.debug('Paid model attempt failed', {
                    model: modelInfo.model.id,
                    error: error.message
                });
                continue;
            }
        }

        throw new Error('All paid models unavailable');
    }

    /**
     * Queue request for later processing
     */
    async queue_request(originalRequest, failureReason, userContext) {
        // Use load balancer to queue the request
        const candidateProviders = await this.getCandidateProviders(originalRequest, userContext);

        const queueResult = await this.loadBalancer.balanceRequest(
            originalRequest,
            candidateProviders
        );

        if (queueResult && queueResult.queued) {
            return {
                success: true,
                strategy: this.strategies.QUEUE_REQUEST,
                queued: true,
                provider: queueResult.provider,
                estimatedWait: queueResult.estimatedWait,
                queueId: queueResult.queueId,
                reasoning: `Request queued for provider ${queueResult.provider}`
            };
        }

        throw new Error('Unable to queue request');
    }

    /**
     * Find providers similar to the failed one
     */
    async findSimilarProviders(failedProvider, request) {
        const allProviders = this.loadBalancer.providerManager.getFilteredProviders();
        const similar = [];

        for (const provider of allProviders) {
            const providerName = provider.name || provider.provider_name;

            if (providerName === failedProvider) continue;

            // Check if provider has models with similar capabilities
            const models = this.decisionEngine.modelTracker.getModelsByProvider(providerName);
            const hasSimilarModels = models.some(model =>
                this.decisionEngine.calculateCapabilityMatch(model, request) > 0.5
            );

            if (hasSimilarModels) {
                similar.push(providerName);
            }
        }

        return similar;
    }

    /**
     * Find best model for a specific provider
     */
    async findBestModelForProvider(providerName, request, userContext) {
        const models = this.decisionEngine.modelTracker.getModelsByProvider(providerName);

        let bestModel = null;
        let bestScore = 0;

        for (const model of models) {
            if (!this.decisionEngine.isModelAllowedForPlan(model, userContext.plan || 'free')) {
                continue;
            }

            const score = this.decisionEngine.calculateCapabilityMatch(model, request);
            if (score > bestScore) {
                bestScore = score;
                bestModel = model;
            }
        }

        return bestModel;
    }

    /**
     * Find downgrade models (simpler/cheaper alternatives)
     */
    async findDowngradeModels(request, userContext) {
        const allModels = this.decisionEngine.modelTracker.getAllModels();
        const downgrades = [];

        for (const model of allModels) {
            if (!this.decisionEngine.isModelAllowedForPlan(model, userContext.plan || 'free')) {
                continue;
            }

            // Check if model can handle the request (lower threshold for downgrades)
            const capabilityScore = this.decisionEngine.calculateCapabilityMatch(model, request);
            if (capabilityScore > 0.3) { // Lower threshold for downgrades
                downgrades.push({
                    model,
                    provider: model.provider,
                    score: capabilityScore
                });
            }
        }

        return downgrades.sort((a, b) => b.score - a.score);
    }

    /**
     * Find paid models for premium fallback
     */
    async findPaidModels(request, userContext) {
        const allModels = this.decisionEngine.modelTracker.getAllModels();
        const paidModels = [];

        for (const model of allModels) {
            // Look for premium/paid models
            if (model.premium_only || model.paid_model) {
                const capabilityScore = this.decisionEngine.calculateCapabilityMatch(model, request);
                if (capabilityScore > 0.7) {
                    paidModels.push({
                        model,
                        provider: model.provider,
                        score: capabilityScore
                    });
                }
            }
        }

        return paidModels.sort((a, b) => b.score - a.score);
    }

    /**
     * Get candidate providers for request
     */
    async getCandidateProviders(request, userContext) {
        const decision = await this.decisionEngine.makeRoutingDecision(request, userContext);

        if (decision.decision === 'route') {
            return [decision.provider];
        }

        // Fallback to all healthy providers
        return this.loadBalancer.providerManager.getFilteredProviders()
            .map(p => p.name || p.provider_name);
    }

    /**
     * Update strategy statistics
     */
    updateStrategyStats(strategy, success, duration = 0) {
        const stats = this.stats.fallbackStrategies.get(strategy) || {
            attempts: 0,
            successes: 0,
            failures: 0,
            totalDuration: 0
        };

        stats.attempts++;
        if (success) {
            stats.successes++;
            stats.totalDuration += duration;
        } else {
            stats.failures++;
        }

        this.stats.fallbackStrategies.set(strategy, stats);

        // Update average fallback time
        if (success && this.stats.successfulFallbacks > 0) {
            const totalDuration = Array.from(this.stats.fallbackStrategies.values())
                .reduce((sum, s) => sum + s.totalDuration, 0);
            this.stats.averageFallbackTime = totalDuration / this.stats.successfulFallbacks;
        }
    }

    /**
     * Get fallback handler statistics
     */
    getStats() {
        const strategyStats = {};
        for (const [strategy, stats] of this.stats.fallbackStrategies.entries()) {
            strategyStats[strategy] = {
                ...stats,
                successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
                averageDuration: stats.successes > 0 ? stats.totalDuration / stats.successes : 0
            };
        }

        return {
            ...this.stats,
            strategyStats,
            config: this.config
        };
    }

    /**
     * Configure fallback handler settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('FallbackHandler configuration updated', this.config);
    }

    /**
     * Reset fallback statistics
     */
    resetStats() {
        this.stats = {
            totalFallbacks: 0,
            successfulFallbacks: 0,
            failedFallbacks: 0,
            fallbackStrategies: new Map(),
            averageFallbackTime: 0
        };

        logger.info('FallbackHandler stats reset');
    }
}

module.exports = FallbackHandler;