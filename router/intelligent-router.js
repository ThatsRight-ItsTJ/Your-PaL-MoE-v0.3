/**
 * Intelligent Router
 * Main routing engine for the Automatic Free Model Tracking System
 * Orchestrates decision making, caching, load balancing, and fallback handling
 */

const logger = require('../utils/logger');
const DecisionEngine = require('./decision-engine');
const CacheManager = require('./cache-manager');
const LoadBalancer = require('./load-balancer');
const FallbackHandler = require('./fallback-handler');

class IntelligentRouter {
    constructor(modelTracker, providerManager) {
        this.modelTracker = modelTracker;
        this.providerManager = providerManager;

        // Initialize components
        this.cacheManager = new CacheManager();
        this.decisionEngine = new DecisionEngine(
            modelTracker,
            providerManager,
            this.cacheManager
        );
        this.loadBalancer = new LoadBalancer(providerManager);
        this.fallbackHandler = new FallbackHandler(
            this.decisionEngine,
            this.loadBalancer,
            this.cacheManager
        );

        // Router configuration
        this.config = {
            enableCaching: true,
            enableLoadBalancing: true,
            enableFallback: true,
            maxRetries: 3,
            requestTimeout: 30000,
            userPlanEnforcement: true
        };

        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulRoutes: 0,
            failedRoutes: 0,
            cacheHits: 0,
            fallbackUsed: 0,
            averageResponseTime: 0,
            requestsByPlan: new Map()
        };

        // Active requests tracking
        this.activeRequests = new Map();

        logger.info('IntelligentRouter initialized');
    }

    /**
     * Route a request to the optimal model/provider
     */
    async routeRequest(request, userContext = {}) {
        const requestId = request.id || this.generateRequestId();
        const startTime = Date.now();

        try {
            this.stats.totalRequests++;
            this.updatePlanStats(userContext.plan || 'free');

            logger.info('Routing request', {
                requestId,
                userId: userContext.userId,
                capabilities: request.capabilities
            });

            // Track active request
            this.activeRequests.set(requestId, {
                request,
                userContext,
                startTime,
                status: 'routing'
            });

            // Step 1: Make routing decision
            const decision = await this.decisionEngine.makeRoutingDecision(request, userContext);

            if (decision.decision === 'cache_hit') {
                this.stats.cacheHits++;
                return await this.handleCacheHit(decision, requestId);
            }

            if (decision.decision === 'no_candidates') {
                return await this.handleNoCandidates(request, userContext, requestId);
            }

            // Step 2: Apply load balancing
            let routingResult;
            if (this.config.enableLoadBalancing) {
                routingResult = await this.loadBalancer.balanceRequest(
                    request,
                    [decision.provider]
                );
            } else {
                routingResult = {
                    provider: decision.provider,
                    queued: false,
                    estimatedWait: 0
                };
            }

            // Step 3: Handle routing result
            if (routingResult.queued) {
                return await this.handleQueuedRequest(routingResult, requestId);
            }

            // Step 4: Execute the request
            const executionResult = await this.executeRequest(
                request,
                decision.model,
                decision.provider,
                requestId
            );

            if (executionResult.success) {
                this.stats.successfulRoutes++;
                await this.cacheSuccessfulRouting(request, decision, userContext);

                const duration = Date.now() - startTime;
                this.updateAverageResponseTime(duration);

                return {
                    success: true,
                    requestId,
                    model: decision.model,
                    provider: decision.provider,
                    response: executionResult.response,
                    duration,
                    cached: false,
                    fallback: false
                };
            } else {
                // Handle execution failure with fallback
                return await this.handleExecutionFailure(
                    request,
                    userContext,
                    executionResult.error,
                    decision,
                    requestId,
                    startTime
                );
            }

        } catch (error) {
            this.stats.failedRoutes++;
            const duration = Date.now() - startTime;

            logger.error('Request routing failed', {
                requestId,
                error: error.message,
                duration
            });

            return {
                success: false,
                requestId,
                error: error.message,
                duration
            };
        } finally {
            // Clean up active request
            this.activeRequests.delete(requestId);
        }
    }

    /**
     * Handle cache hit scenario
     */
    async handleCacheHit(decision, requestId) {
        logger.debug('Cache hit for request', { requestId });

        return {
            success: true,
            requestId,
            model: decision.model,
            provider: decision.provider,
            cached: true,
            fallback: false,
            duration: 0 // Instant response
        };
    }

    /**
     * Handle no candidates available
     */
    async handleNoCandidates(request, userContext, requestId) {
        logger.warn('No routing candidates found', { requestId });

        if (this.config.enableFallback) {
            const fallbackResult = await this.fallbackHandler.handleFallback(
                request,
                { type: 'no_candidates' },
                userContext
            );

            if (fallbackResult.success) {
                this.stats.fallbackUsed++;
                return {
                    success: true,
                    requestId,
                    model: fallbackResult.model,
                    provider: fallbackResult.provider,
                    fallback: true,
                    strategy: fallbackResult.strategy,
                    reasoning: fallbackResult.reasoning
                };
            }
        }

        return {
            success: false,
            requestId,
            error: 'No suitable models available for request'
        };
    }

    /**
     * Handle queued request
     */
    async handleQueuedRequest(routingResult, requestId) {
        logger.info('Request queued for processing', {
            requestId,
            provider: routingResult.provider,
            estimatedWait: routingResult.estimatedWait
        });

        return {
            success: true,
            requestId,
            queued: true,
            provider: routingResult.provider,
            estimatedWait: routingResult.estimatedWait,
            queueId: routingResult.queueId
        };
    }

    /**
     * Execute request against selected model/provider
     */
    async executeRequest(request, model, provider, requestId) {
        try {
            logger.debug('Executing request', {
                requestId,
                model: model.id,
                provider
            });

            // This would integrate with actual provider APIs
            // For now, simulate execution
            const response = await this.simulateProviderCall(model, provider, request);

            return {
                success: true,
                response
            };

        } catch (error) {
            logger.error('Request execution failed', {
                requestId,
                model: model.id,
                provider,
                error: error.message
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Handle execution failure with fallback
     */
    async handleExecutionFailure(request, userContext, error, originalDecision, requestId, startTime) {
        logger.warn('Request execution failed, attempting fallback', {
            requestId,
            error,
            originalProvider: originalDecision.provider
        });

        if (this.config.enableFallback) {
            const fallbackResult = await this.fallbackHandler.handleFallback(
                request,
                {
                    type: 'execution_failed',
                    error,
                    provider: originalDecision.provider,
                    originalModel: originalDecision.model
                },
                userContext
            );

            if (fallbackResult.success) {
                this.stats.fallbackUsed++;

                // Execute fallback request
                const fallbackExecution = await this.executeRequest(
                    request,
                    fallbackResult.model,
                    fallbackResult.provider,
                    requestId
                );

                if (fallbackExecution.success) {
                    this.stats.successfulRoutes++;
                    const duration = Date.now() - startTime;
                    this.updateAverageResponseTime(duration);

                    return {
                        success: true,
                        requestId,
                        model: fallbackResult.model,
                        provider: fallbackResult.provider,
                        response: fallbackExecution.response,
                        duration,
                        cached: false,
                        fallback: true,
                        strategy: fallbackResult.strategy,
                        reasoning: fallbackResult.reasoning
                    };
                }
            }
        }

        this.stats.failedRoutes++;
        const duration = Date.now() - startTime;

        return {
            success: false,
            requestId,
            error: `Execution failed: ${error}`,
            duration
        };
    }

    /**
     * Cache successful routing decision
     */
    async cacheSuccessfulRouting(request, decision, userContext) {
        if (this.config.enableCaching && this.cacheManager.shouldCache(request)) {
            try {
                await this.cacheManager.cacheRoutingDecision(request, decision, userContext);
                logger.debug('Routing decision cached', { requestId: request.id });
            } catch (error) {
                logger.warn('Failed to cache routing decision', { error: error.message });
            }
        }
    }

    /**
     * Simulate provider API call (for demonstration)
     */
    async simulateProviderCall(model, provider, request) {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

        // Simulate occasional failures
        if (Math.random() < 0.1) { // 10% failure rate
            throw new Error('Simulated provider API failure');
        }

        return {
            model: model.id,
            provider,
            response: `Response from ${model.name} via ${provider}`,
            timestamp: new Date().toISOString(),
            tokens_used: Math.floor(Math.random() * 1000) + 100
        };
    }

    /**
     * Get routing recommendations without executing
     */
    async getRoutingRecommendations(request, userContext = {}, limit = 5) {
        try {
            const candidates = await this.decisionEngine.findCandidateModels(request, userContext);

            if (candidates.length === 0) {
                return {
                    recommendations: [],
                    reasoning: 'No suitable models found'
                };
            }

            const scoredCandidates = await this.decisionEngine.scoreCandidates(candidates, request, userContext);

            const recommendations = scoredCandidates.slice(0, limit).map(candidate => ({
                model: candidate.model,
                provider: candidate.provider,
                score: candidate.totalScore,
                reasoning: candidate.reasoning,
                health: candidate.providerHealth.status,
                load: this.loadBalancer.getProviderLoad(candidate.provider)
            }));

            return {
                recommendations,
                totalCandidates: candidates.length
            };

        } catch (error) {
            logger.error('Failed to get routing recommendations', { error: error.message });
            return {
                recommendations: [],
                error: error.message
            };
        }
    }

    /**
     * Check system health and capacity
     */
    async getSystemHealth() {
        const providerHealth = this.providerManager.getHealthSummary();
        const loadStats = this.loadBalancer.getStats();
        const cacheStats = this.cacheManager.getStats();

        const overallHealth = this.calculateOverallHealth(providerHealth, loadStats);

        return {
            overall: overallHealth,
            providers: providerHealth,
            load: {
                totalRequests: loadStats.totalRequests,
                balancedRequests: loadStats.balancedRequests,
                queuedRequests: loadStats.queuedRequests,
                rejectedRequests: loadStats.rejectedRequests
            },
            cache: {
                hitRate: cacheStats.hitRate,
                size: cacheStats.size,
                maxSize: cacheStats.maxSize
            },
            activeRequests: this.activeRequests.size
        };
    }

    /**
     * Calculate overall system health
     */
    calculateOverallHealth(providerHealth, loadStats) {
        const providerScore = providerHealth.healthy / (providerHealth.total || 1);
        const loadScore = 1 - (loadStats.rejectedRequests / (loadStats.totalRequests || 1));

        const overallScore = (providerScore + loadScore) / 2;

        if (overallScore >= 0.9) return 'excellent';
        if (overallScore >= 0.7) return 'good';
        if (overallScore >= 0.5) return 'fair';
        if (overallScore >= 0.3) return 'poor';
        return 'critical';
    }

    /**
     * Update plan-based statistics
     */
    updatePlanStats(plan) {
        const current = this.stats.requestsByPlan.get(plan) || 0;
        this.stats.requestsByPlan.set(plan, current + 1);
    }

    /**
     * Update average response time
     */
    updateAverageResponseTime(duration) {
        const totalRequests = this.stats.successfulRoutes;
        if (totalRequests === 1) {
            this.stats.averageResponseTime = duration;
        } else {
            this.stats.averageResponseTime =
                (this.stats.averageResponseTime * (totalRequests - 1) + duration) / totalRequests;
        }
    }

    /**
     * Generate unique request ID
     */
    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get router statistics
     */
    getStats() {
        const planStats = {};
        for (const [plan, count] of this.stats.requestsByPlan.entries()) {
            planStats[plan] = count;
        }

        return {
            ...this.stats,
            requestsByPlan: planStats,
            activeRequests: this.activeRequests.size,
            config: this.config,
            components: {
                decisionEngine: this.decisionEngine.getStats(),
                cacheManager: this.cacheManager.getStats(),
                loadBalancer: this.loadBalancer.getStats(),
                fallbackHandler: this.fallbackHandler.getStats()
            }
        };
    }

    /**
     * Configure router settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };

        // Propagate configuration to components
        if (newConfig.cacheConfig) {
            this.cacheManager.configure(newConfig.cacheConfig);
        }
        if (newConfig.loadBalancerConfig) {
            this.loadBalancer.configure(newConfig.loadBalancerConfig);
        }
        if (newConfig.fallbackConfig) {
            this.fallbackHandler.configure(newConfig.fallbackConfig);
        }
        if (newConfig.decisionEngineConfig) {
            this.decisionEngine.configure(newConfig.decisionEngineConfig);
        }

        logger.info('IntelligentRouter configuration updated', this.config);
    }

    /**
     * Reset router statistics
     */
    resetStats() {
        this.stats = {
            totalRequests: 0,
            successfulRoutes: 0,
            failedRoutes: 0,
            cacheHits: 0,
            fallbackUsed: 0,
            averageResponseTime: 0,
            requestsByPlan: new Map()
        };

        // Reset component stats
        this.cacheManager.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, evictions: 0, size: 0, lastCleanup: new Date() };
        this.loadBalancer.reset();
        this.fallbackHandler.resetStats();

        logger.info('IntelligentRouter stats reset');
    }

    /**
     * Gracefully shutdown router
     */
    async shutdown() {
        logger.info('Shutting down IntelligentRouter');

        // Complete active requests
        const shutdownTimeout = 30000; // 30 seconds
        const shutdownStart = Date.now();

        while (this.activeRequests.size > 0 && (Date.now() - shutdownStart) < shutdownTimeout) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        if (this.activeRequests.size > 0) {
            logger.warn('Forced shutdown with active requests', { count: this.activeRequests.size });
        }

        // Shutdown components
        this.cacheManager.destroy();
        this.loadBalancer.destroy();

        logger.info('IntelligentRouter shutdown complete');
    }
}

module.exports = IntelligentRouter;