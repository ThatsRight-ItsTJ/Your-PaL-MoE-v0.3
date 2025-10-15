/**
 * Unit Tests for Intelligent Router
 * Tests the core functionality of the Intelligent Router component
 */

const sinon = require('sinon');

// Mock assertions since chai is not available
const expect = (actual) => ({
    to: {
        be: {
            true: () => assert(actual === true, `Expected ${actual} to be true`),
            false: () => assert(actual === false, `Expected ${actual} to be false`)
        },
        equal: (expected) => assert(actual === expected, `Expected ${actual} to equal ${expected}`),
        have: {
            property: (prop, value) => {
                assert(actual.hasOwnProperty(prop), `Expected to have property ${prop}`);
                if (value !== undefined) {
                    assert(actual[prop] === value, `Expected property ${prop} to be ${value}, got ${actual[prop]}`);
                }
                return {
                    that: {
                        is: {
                            empty: () => assert(actual.length === 0, `Expected to be empty, got length ${actual.length}`)
                        }
                    }
                };
            }
        }
    },
    an: (type) => ({
        that: {
            is: {
                empty: () => assert(actual.length === 0, `Expected ${type} to be empty, got length ${actual.length}`)
            }
        }
    })
});

const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const IntelligentRouter = require('../../router/intelligent-router');
const ModelTracker = require('../../tracker/model-tracker');

describe('Intelligent Router Component', () => {
    let mockProviderManager;
    let mockModelTracker;
    let router;

    const mockProviders = [
        {
            name: 'openai',
            base_url: 'https://api.openai.com',
            priority: 1
        },
        {
            name: 'huggingface',
            base_url: 'https://api-inference.huggingface.co',
            priority: 2
        }
    ];

    const mockModels = [
        {
            id: 'gpt-3.5-turbo',
            name: 'GPT-3.5 Turbo',
            provider: 'openai',
            capabilities: ['text', 'chat'],
            api: { endpoint: '/chat/completions', method: 'POST' }
        },
        {
            id: 'distilbert-base',
            name: 'DistilBERT Base',
            provider: 'huggingface',
            capabilities: ['embeddings'],
            api: { endpoint: '/models/distilbert-base', method: 'POST' }
        }
    ];

    beforeEach(() => {
        // Mock ProviderManager
        mockProviderManager = {
            loadProviders: sinon.stub().resolves(),
            normalizeProviders: sinon.stub(),
            validateConfigurations: sinon.stub().returns({ isValid: true, errors: [] }),
            getFilteredProviders: sinon.stub().returns(mockProviders),
            getProviderHealth: sinon.stub().returns({ status: 'healthy', lastChecked: new Date() }),
            getHealthSummary: sinon.stub().returns({
                total: 2,
                healthy: 2,
                unhealthy: 0,
                unknown: 0
            })
        };

        // Mock ModelTracker
        mockModelTracker = new ModelTracker(mockProviderManager);
        sinon.stub(mockModelTracker, 'getAllModels').returns(mockModels);
        sinon.stub(mockModelTracker, 'getModelsByProvider').returns(mockModels);

        // Create router instance
        router = new IntelligentRouter(mockModelTracker, mockProviderManager);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('Router Initialization', () => {
        it('should initialize correctly', () => {
            expect(router.modelTracker).to.equal(mockModelTracker);
            expect(router.providerManager).to.equal(mockProviderManager);
            expect(router.config.enableCaching).to.be.true;
            expect(router.config.enableLoadBalancing).to.be.true;
            expect(router.config.enableFallback).to.be.true;
        });

        it('should have all required components', () => {
            expect(router.decisionEngine).to.have.property('makeRoutingDecision');
            expect(router.cacheManager).to.have.property('get');
            expect(router.loadBalancer).to.have.property('balanceRequest');
            expect(router.fallbackHandler).to.have.property('handleFallback');
        });
    });

    describe('Request Routing', () => {
        it('should route request successfully', async () => {
            const request = {
                id: 'test-request',
                capabilities: ['text'],
                prompt: 'Hello world'
            };
            const userContext = { userId: 'user1', plan: 'free' };

            // Mock decision engine
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').resolves({
                decision: 'route',
                model: mockModels[0],
                provider: 'openai',
                confidence: 0.9,
                reasoning: 'Best match for capabilities'
            });

            // Mock load balancer
            sinon.stub(router.loadBalancer, 'balanceRequest').resolves({
                provider: 'openai',
                queued: false
            });

            // Mock execution
            sinon.stub(router, 'executeRequest').resolves({
                success: true,
                response: { result: 'Success' }
            });

            const result = await router.routeRequest(request, userContext);

            expect(result.success).to.be.true;
            expect(result.model.id).to.equal('gpt-3.5-turbo');
            expect(result.provider).to.equal('openai');
            expect(result.cached).to.be.false;
            expect(result.fallback).to.be.false;
        });

        it('should handle cache hits', async () => {
            const request = {
                id: 'cached-request',
                capabilities: ['text']
            };
            const userContext = { userId: 'user1', plan: 'free' };

            // Mock cache hit
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').resolves({
                decision: 'cache_hit',
                model: mockModels[0],
                provider: 'openai'
            });

            const result = await router.routeRequest(request, userContext);

            expect(result.success).to.be.true;
            expect(result.cached).to.be.true;
            expect(router.stats.cacheHits).to.equal(1);
        });

        it('should handle no candidates scenario', async () => {
            const request = {
                id: 'no-candidates',
                capabilities: ['nonexistent']
            };
            const userContext = { userId: 'user1', plan: 'free' };

            // Mock no candidates
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').resolves({
                decision: 'no_candidates',
                error: 'No suitable models found'
            });

            // Mock fallback
            sinon.stub(router.fallbackHandler, 'handleFallback').resolves({
                success: true,
                model: mockModels[1],
                provider: 'huggingface',
                strategy: 'equivalent_model'
            });

            const result = await router.routeRequest(request, userContext);

            expect(result.success).to.be.true;
            expect(result.fallback).to.be.true;
            expect(router.stats.fallbackUsed).to.equal(1);
        });

        it('should handle queued requests', async () => {
            const request = {
                id: 'queued-request',
                capabilities: ['text']
            };
            const userContext = { userId: 'user1', plan: 'free' };

            // Mock routing decision
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').resolves({
                decision: 'route',
                model: mockModels[0],
                provider: 'openai'
            });

            // Mock queued response
            sinon.stub(router.loadBalancer, 'balanceRequest').resolves({
                provider: 'openai',
                queued: true,
                estimatedWait: 5000,
                queueId: 'queue_123'
            });

            const result = await router.routeRequest(request, userContext);

            expect(result.success).to.be.true;
            expect(result.queued).to.be.true;
            expect(result.estimatedWait).to.equal(5000);
        });

        it('should handle execution failures with fallback', async () => {
            const request = {
                id: 'execution-failure',
                capabilities: ['text']
            };
            const userContext = { userId: 'user1', plan: 'free' };

            // Mock routing decision
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').resolves({
                decision: 'route',
                model: mockModels[0],
                provider: 'openai'
            });

            // Mock load balancer
            sinon.stub(router.loadBalancer, 'balanceRequest').resolves({
                provider: 'openai',
                queued: false
            });

            // Mock execution failure
            sinon.stub(router, 'executeRequest').resolves({
                success: false,
                error: 'API timeout'
            });

            // Mock successful fallback
            sinon.stub(router.fallbackHandler, 'handleFallback').resolves({
                success: true,
                model: mockModels[1],
                provider: 'huggingface',
                strategy: 'equivalent_model'
            });

            // Mock fallback execution
            sinon.stub(router, 'simulateProviderCall').resolves({
                model: 'distilbert-base',
                provider: 'huggingface',
                response: 'Fallback response'
            });

            const result = await router.routeRequest(request, userContext);

            expect(result.success).to.be.true;
            expect(result.fallback).to.be.true;
            expect(result.provider).to.equal('huggingface');
        });
    });

    describe('Routing Recommendations', () => {
        it('should provide routing recommendations', async () => {
            const request = {
                capabilities: ['text'],
                prompt: 'Test prompt'
            };
            const userContext = { plan: 'free' };

            // Mock candidate finding
            sinon.stub(router.decisionEngine, 'findCandidateModels').resolves([
                { model: mockModels[0], provider: 'openai', capabilityScore: 0.9, providerHealth: { status: 'healthy' } },
                { model: mockModels[1], provider: 'huggingface', capabilityScore: 0.7, providerHealth: { status: 'healthy' } }
            ]);

            // Mock scoring
            sinon.stub(router.decisionEngine, 'scoreCandidates').resolves([
                {
                    model: mockModels[0],
                    provider: 'openai',
                    totalScore: 0.85,
                    reasoning: 'Best match'
                },
                {
                    model: mockModels[1],
                    provider: 'huggingface',
                    totalScore: 0.75,
                    reasoning: 'Good alternative'
                }
            ]);

            const result = await router.getRoutingRecommendations(request, userContext);

            expect(result.recommendations).to.have.lengthOf(2);
            expect(result.recommendations[0].model.id).to.equal('gpt-3.5-turbo');
            expect(result.recommendations[0].score).to.equal(0.85);
            expect(result.totalCandidates).to.equal(2);
        });
    });

    describe('System Health Monitoring', () => {
        it('should report system health', async () => {
            const health = await router.getSystemHealth();

            expect(health).to.have.property('overall');
            expect(health).to.have.property('providers');
            expect(health).to.have.property('load');
            expect(health).to.have.property('cache');
            expect(health).to.have.property('activeRequests');
        });

        it('should calculate overall health correctly', () => {
            const providerHealth = { total: 2, healthy: 2, unhealthy: 0, unknown: 0 };
            const loadStats = { totalRequests: 10, balancedRequests: 9, rejectedRequests: 1 };

            const overall = router.calculateOverallHealth(providerHealth, loadStats);

            expect(['excellent', 'good', 'fair', 'poor', 'critical']).to.include(overall);
        });
    });

    describe('Statistics and Configuration', () => {
        it('should track request statistics', async () => {
            const request = {
                id: 'stats-test',
                capabilities: ['text']
            };
            const userContext = { userId: 'user1', plan: 'premium' };

            // Mock successful routing
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').resolves({
                decision: 'route',
                model: mockModels[0],
                provider: 'openai'
            });
            sinon.stub(router.loadBalancer, 'balanceRequest').resolves({
                provider: 'openai',
                queued: false
            });
            sinon.stub(router, 'executeRequest').resolves({
                success: true,
                response: {}
            });

            await router.routeRequest(request, userContext);

            const stats = router.getStats();
            expect(stats.totalRequests).to.equal(1);
            expect(stats.successfulRoutes).to.equal(1);
            expect(stats.requestsByPlan.premium).to.equal(1);
        });

        it('should allow configuration updates', () => {
            const newConfig = {
                enableCaching: false,
                maxRetries: 5
            };

            router.configure(newConfig);

            expect(router.config.enableCaching).to.be.false;
            expect(router.config.maxRetries).to.equal(5);
        });

        it('should reset statistics', () => {
            // Add some fake stats
            router.stats.totalRequests = 10;
            router.stats.successfulRoutes = 8;

            router.resetStats();

            expect(router.stats.totalRequests).to.equal(0);
            expect(router.stats.successfulRoutes).to.equal(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle routing decision failures', async () => {
            const request = {
                id: 'error-test',
                capabilities: ['text']
            };

            // Mock decision engine failure
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').rejects(new Error('Decision engine error'));

            const result = await router.routeRequest(request);

            expect(result.success).to.be.false;
            expect(result.error).to.include('Decision engine error');
            expect(router.stats.failedRoutes).to.equal(1);
        });

        it('should handle load balancing failures', async () => {
            const request = {
                id: 'lb-error',
                capabilities: ['text']
            };

            // Mock decision success but load balancing failure
            sinon.stub(router.decisionEngine, 'makeRoutingDecision').resolves({
                decision: 'route',
                model: mockModels[0],
                provider: 'openai'
            });
            sinon.stub(router.loadBalancer, 'balanceRequest').rejects(new Error('Load balancer error'));

            const result = await router.routeRequest(request);

            expect(result.success).to.be.false;
            expect(result.error).to.include('Load balancer error');
        });
    });

    describe('Component Integration', () => {
        it('should integrate all components correctly', () => {
            expect(router.decisionEngine.modelTracker).to.equal(mockModelTracker);
            expect(router.decisionEngine.providerManager).to.equal(mockProviderManager);
            expect(router.loadBalancer.providerManager).to.equal(mockProviderManager);
            expect(router.fallbackHandler.decisionEngine).to.equal(router.decisionEngine);
        });

        it('should propagate configuration to components', () => {
            const config = {
                decisionEngineConfig: { weights: { capability_match: 0.5 } },
                cacheConfig: { maxSize: 2000 },
                loadBalancerConfig: { maxConcurrentRequests: 20 },
                fallbackConfig: { maxFallbackAttempts: 5 }
            };

            // Mock component configure methods
            sinon.stub(router.decisionEngine, 'configure');
            sinon.stub(router.cacheManager, 'configure');
            sinon.stub(router.loadBalancer, 'configure');
            sinon.stub(router.fallbackHandler, 'configure');

            router.configure(config);

            expect(router.decisionEngine.configure.calledWith(config.decisionEngineConfig)).to.be.true;
            expect(router.cacheManager.configure.calledWith(config.cacheConfig)).to.be.true;
            expect(router.loadBalancer.configure.calledWith(config.loadBalancerConfig)).to.be.true;
            expect(router.fallbackHandler.configure.calledWith(config.fallbackConfig)).to.be.true;
        });
    });

    describe('Shutdown and Cleanup', () => {
        it('should shutdown gracefully', async () => {
            // Mock active requests
            router.activeRequests.set('test-request', {});

            // Mock component destroy methods
            sinon.stub(router.cacheManager, 'destroy');
            sinon.stub(router.loadBalancer, 'destroy');

            await router.shutdown();

            expect(router.cacheManager.destroy.calledOnce).to.be.true;
            expect(router.loadBalancer.destroy.calledOnce).to.be.true;
        });
    });
});