/**
 * Intelligent Router Decision Engine
 * Handles routing decision logic based on multiple criteria
 * Integrates with ModelTracker, ProviderManager, and CacheManager
 */

const logger = require('../utils/logger');

class DecisionEngine {
    constructor(modelTracker, providerManager, cacheManager) {
        this.modelTracker = modelTracker;
        this.providerManager = providerManager;
        this.cacheManager = cacheManager;

        // Decision weights and thresholds
        this.weights = {
            capability_match: 0.4,
            provider_health: 0.25,
            load_balance: 0.2,
            user_plan: 0.1,
            cache_hit: 0.05
        };

        this.thresholds = {
            min_capability_score: 0.7,
            max_load_factor: 0.8,
            health_score_min: 0.6,
            cache_freshness_hours: 24
        };

        // User plan configurations
        this.userPlans = {
            free: {
                max_requests_per_hour: 100,
                allowed_providers: ['free_tier_only'],
                premium_fallback: false
            },
            premium: {
                max_requests_per_hour: 1000,
                allowed_providers: ['all'],
                premium_fallback: true
            }
        };

        logger.info('DecisionEngine initialized');
    }

    /**
     * Make routing decision for a request
     */
    async makeRoutingDecision(request, userContext = {}) {
        try {
            logger.debug('Making routing decision', { request: request.id, user: userContext.userId });

            // Step 1: Check cache first
            const cacheResult = await this.checkCacheHit(request);
            if (cacheResult.hit) {
                return {
                    decision: 'cache_hit',
                    model: cacheResult.model,
                    provider: cacheResult.provider,
                    confidence: 1.0,
                    reasoning: 'Cache hit with fresh data'
                };
            }

            // Step 2: Find candidate models
            const candidates = await this.findCandidateModels(request, userContext);

            if (candidates.length === 0) {
                return {
                    decision: 'no_candidates',
                    error: 'No suitable models found for request',
                    confidence: 0.0
                };
            }

            // Step 3: Score and rank candidates
            const scoredCandidates = await this.scoreCandidates(candidates, request, userContext);

            // Step 4: Select best candidate
            const bestCandidate = this.selectBestCandidate(scoredCandidates);

            return {
                decision: 'route',
                model: bestCandidate.model,
                provider: bestCandidate.provider,
                confidence: bestCandidate.score,
                reasoning: bestCandidate.reasoning,
                alternatives: scoredCandidates.slice(1, 4) // Top 3 alternatives
            };

        } catch (error) {
            logger.error('Routing decision failed', { error: error.message, request: request.id });
            return {
                decision: 'error',
                error: error.message,
                confidence: 0.0
            };
        }
    }

    /**
     * Check for cache hit before routing
     */
    async checkCacheHit(request) {
        try {
            const cacheKey = this.generateCacheKey(request);
            const cached = await this.cacheManager.get(cacheKey);

            if (cached && this.isCacheFresh(cached)) {
                return {
                    hit: true,
                    model: cached.model,
                    provider: cached.provider
                };
            }

            return { hit: false };
        } catch (error) {
            logger.warn('Cache check failed', { error: error.message });
            return { hit: false };
        }
    }

    /**
     * Find candidate models that match request requirements
     */
    async findCandidateModels(request, userContext) {
        const candidates = [];
        const userPlan = this.getUserPlan(userContext);

        // Get all available models
        const allModels = this.modelTracker.getAllModels();

        for (const model of allModels) {
            // Check user plan restrictions
            if (!this.isModelAllowedForPlan(model, userPlan)) {
                continue;
            }

            // Check capability matching
            const capabilityScore = this.calculateCapabilityMatch(model, request);
            if (capabilityScore < this.thresholds.min_capability_score) {
                continue;
            }

            // Check provider health
            const providerHealth = this.providerManager.getProviderHealth(model.provider);
            if (providerHealth.status === 'error') {
                continue;
            }

            candidates.push({
                model,
                provider: model.provider,
                capabilityScore,
                providerHealth
            });
        }

        return candidates;
    }

    /**
     * Score and rank candidate models
     */
    async scoreCandidates(candidates, request, userContext) {
        const scored = [];

        for (const candidate of candidates) {
            const scores = {
                capability: candidate.capabilityScore,
                health: this.calculateHealthScore(candidate.providerHealth),
                load: await this.calculateLoadScore(candidate.provider),
                plan: this.calculatePlanScore(candidate.model, userContext),
                cache: 0.5 // Neutral cache score for non-cached
            };

            const totalScore = this.calculateTotalScore(scores);

            scored.push({
                ...candidate,
                scores,
                totalScore,
                reasoning: this.generateReasoning(scores)
            });
        }

        // Sort by total score descending
        return scored.sort((a, b) => b.totalScore - a.totalScore);
    }

    /**
     * Select the best candidate based on scoring
     */
    selectBestCandidate(scoredCandidates) {
        if (scoredCandidates.length === 0) {
            throw new Error('No candidates available');
        }

        const best = scoredCandidates[0];

        return {
            model: best.model,
            provider: best.provider,
            score: best.totalScore,
            reasoning: best.reasoning
        };
    }

    /**
     * Find equivalent models for fallback
     */
    async findEquivalentModels(targetModel, userContext) {
        const equivalents = [];
        const targetCapabilities = targetModel.capabilities || [];

        const allModels = this.modelTracker.getAllModels();
        const userPlan = this.getUserPlan(userContext);

        for (const model of allModels) {
            if (model.id === targetModel.id) continue;

            // Check user plan
            if (!this.isModelAllowedForPlan(model, userPlan)) continue;

            // Calculate capability similarity
            const similarity = this.calculateCapabilitySimilarity(targetCapabilities, model.capabilities || []);
            if (similarity > 0.7) { // 70% similarity threshold
                equivalents.push({
                    model,
                    similarity,
                    provider: model.provider
                });
            }
        }

        return equivalents.sort((a, b) => b.similarity - a.similarity);
    }

    /**
     * Calculate capability match score
     */
    calculateCapabilityMatch(model, request) {
        const modelCapabilities = model.capabilities || [];
        const requiredCapabilities = request.capabilities || [];

        if (requiredCapabilities.length === 0) return 1.0; // No requirements = perfect match

        let matches = 0;
        for (const required of requiredCapabilities) {
            if (modelCapabilities.includes(required)) {
                matches++;
            }
        }

        return matches / requiredCapabilities.length;
    }

    /**
     * Calculate health score for provider
     */
    calculateHealthScore(providerHealth) {
        const status = providerHealth.status;

        switch (status) {
            case 'healthy': return 1.0;
            case 'degraded': return 0.7;
            case 'error': return 0.0;
            default: return 0.5; // unknown
        }
    }

    /**
     * Calculate load score for provider
     */
    async calculateLoadScore(providerName) {
        // This would integrate with load balancer
        // For now, return neutral score
        return 0.8;
    }

    /**
     * Calculate plan compatibility score
     */
    calculatePlanScore(model, userContext) {
        const userPlan = this.getUserPlan(userContext);

        // Premium models get higher score for premium users
        if (userPlan === 'premium' && this.isPremiumModel(model)) {
            return 1.0;
        }

        // Free models get higher score for free users
        if (userPlan === 'free' && this.isFreeModel(model)) {
            return 1.0;
        }

        return 0.5; // Neutral for mixed scenarios
    }

    /**
     * Calculate total weighted score
     */
    calculateTotalScore(scores) {
        return (
            scores.capability * this.weights.capability_match +
            scores.health * this.weights.provider_health +
            scores.load * this.weights.load_balance +
            scores.plan * this.weights.user_plan +
            scores.cache * this.weights.cache_hit
        );
    }

    /**
     * Generate reasoning for decision
     */
    generateReasoning(scores) {
        const reasons = [];

        if (scores.capability > 0.8) reasons.push('Excellent capability match');
        else if (scores.capability > 0.6) reasons.push('Good capability match');

        if (scores.health > 0.8) reasons.push('Provider healthy');
        else if (scores.health < 0.5) reasons.push('Provider degraded');

        if (scores.load > 0.7) reasons.push('Low provider load');
        else if (scores.load < 0.5) reasons.push('High provider load');

        return reasons.join(', ');
    }

    /**
     * Calculate capability similarity between models
     */
    calculateCapabilitySimilarity(capabilities1, capabilities2) {
        const set1 = new Set(capabilities1);
        const set2 = new Set(capabilities2);

        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
    }

    /**
     * Check if model is allowed for user plan
     */
    isModelAllowedForPlan(model, plan) {
        const planConfig = this.userPlans[plan];

        if (plan === 'free') {
            return this.isFreeModel(model);
        }

        return true; // Premium users can access all
    }

    /**
     * Check if model is free
     */
    isFreeModel(model) {
        // In real implementation, this would check pricing information
        // For now, assume models are free unless marked as premium
        return !model.premium_only;
    }

    /**
     * Check if model is premium
     */
    isPremiumModel(model) {
        return model.premium_only || false;
    }

    /**
     * Get user plan from context
     */
    getUserPlan(userContext) {
        return userContext.plan || 'free';
    }

    /**
     * Generate cache key for request
     */
    generateCacheKey(request) {
        const keyData = {
            capabilities: request.capabilities || [],
            model_preferences: request.modelPreferences || [],
            user_id: request.userId
        };

        return `route:${JSON.stringify(keyData)}`;
    }

    /**
     * Check if cached data is fresh
     */
    isCacheFresh(cached) {
        const cacheTime = new Date(cached.timestamp).getTime();
        const now = Date.now();
        const hoursDiff = (now - cacheTime) / (1000 * 60 * 60);

        return hoursDiff < this.thresholds.cache_freshness_hours;
    }

    /**
     * Update decision engine configuration
     */
    configure(newConfig) {
        if (newConfig.weights) {
            this.weights = { ...this.weights, ...newConfig.weights };
        }
        if (newConfig.thresholds) {
            this.thresholds = { ...this.thresholds, ...newConfig.thresholds };
        }
        if (newConfig.userPlans) {
            this.userPlans = { ...this.userPlans, ...newConfig.userPlans };
        }

        logger.info('DecisionEngine configuration updated');
    }

    /**
     * Get decision engine statistics
     */
    getStats() {
        return {
            weights: this.weights,
            thresholds: this.thresholds,
            userPlans: Object.keys(this.userPlans)
        };
    }
}

module.exports = DecisionEngine;