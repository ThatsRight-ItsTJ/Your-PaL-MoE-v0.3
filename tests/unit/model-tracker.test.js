/**
 * Unit Tests for Model Tracker
 * Tests the core functionality of the Free Model Tracker component
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
            lengthOf: (expected) => assert(actual.length === expected, `Expected length ${actual.length} to be ${expected}`),
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
const ModelTracker = require('../../tracker/model-tracker');
const PollingScheduler = require('../../tracker/scheduler');
const DeltaDetector = require('../../tracker/detector');
const RateLimiter = require('../../tracker/rate-limiter');
const HealthMonitor = require('../../tracker/health-monitor');

describe('Free Model Tracker Component', () => {
    let mockProviderManager;
    let modelTracker;
    let scheduler;
    let detector;
    let rateLimiter;
    let healthMonitor;

    const mockProviders = [
        {
            name: 'openai',
            base_url: 'https://api.openai.com',
            priority: 1,
            rate_limit: {
                requests_per_minute: 60,
                tokens_per_minute: 100000
            }
        },
        {
            name: 'huggingface',
            base_url: 'https://api-inference.huggingface.co',
            priority: 2,
            rate_limit: {
                requests_per_minute: 30,
                tokens_per_minute: 50000
            }
        }
    ];

    beforeEach(() => {
        // Mock ProviderManager
        mockProviderManager = {
            loadProviders: sinon.stub().resolves(),
            normalizeProviders: sinon.stub(),
            validateConfigurations: sinon.stub().returns({ isValid: true, errors: [] }),
            getFilteredProviders: sinon.stub().returns(mockProviders),
            updateProviderHealth: sinon.stub()
        };

        // Create instances
        modelTracker = new ModelTracker(mockProviderManager);
        scheduler = new PollingScheduler(modelTracker);
        detector = new DeltaDetector(modelTracker);
        rateLimiter = new RateLimiter(mockProviderManager);
        healthMonitor = new HealthMonitor(modelTracker, rateLimiter);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('ModelTracker Core Functionality', () => {
        it('should initialize correctly', async () => {
            await modelTracker.initialize();

            expect(mockProviderManager.loadProviders.calledOnce).to.be.true;
            expect(mockProviderManager.normalizeProviders.calledOnce).to.be.true;
            expect(mockProviderManager.validateConfigurations.calledOnce).to.be.true;
            expect(modelTracker.stats.providersTracked).to.equal(2);
        });

        it('should update catalog successfully', async () => {
            await modelTracker.initialize();

            // Mock the fetch method
            sinon.stub(modelTracker, 'fetchProviderModels').resolves({
                data: [
                    {
                        id: 'gpt-3.5-turbo',
                        name: 'GPT-3.5 Turbo',
                        api: { endpoint: '/chat/completions', method: 'POST' }
                    },
                    {
                        id: 'gpt-4',
                        name: 'GPT-4',
                        api: { endpoint: '/chat/completions', method: 'POST' }
                    }
                ]
            });

            const result = await modelTracker.updateCatalog();

            expect(result.success).to.be.true;
            expect(result.results).to.have.lengthOf(2);
            expect(modelTracker.stats.updatesPerformed).to.equal(1);
        });

        it('should handle provider update failures gracefully', async () => {
            await modelTracker.initialize();

            // Mock failure
            sinon.stub(modelTracker, 'fetchProviderModels').rejects(new Error('API Error'));

            const result = await modelTracker.updateCatalog();

            expect(result.success).to.be.false;
            expect(result.errors).to.have.lengthOf(2);
            expect(modelTracker.stats.errorsEncountered).to.equal(2);
        });

        it('should get all models', async () => {
            await modelTracker.initialize();

            // Add some test models
            modelTracker.modelCatalog.set('test-model-1', { id: 'test-model-1', name: 'Test Model 1' });
            modelTracker.modelCatalog.set('test-model-2', { id: 'test-model-2', name: 'Test Model 2' });

            const models = modelTracker.getAllModels();
            expect(models).to.have.lengthOf(2);
            expect(models[0].id).to.equal('test-model-1');
        });

        it('should get models by provider', async () => {
            await modelTracker.initialize();

            // Setup provider catalog
            modelTracker.providerCatalogs.set('openai', new Set(['gpt-3.5-turbo']));
            modelTracker.modelCatalog.set('gpt-3.5-turbo', { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' });

            const models = modelTracker.getModelsByProvider('openai');
            expect(models).to.have.lengthOf(1);
            expect(models[0].id).to.equal('gpt-3.5-turbo');
        });

        it('should return empty array for unknown provider', () => {
            const models = modelTracker.getModelsByProvider('unknown');
            expect(models).to.be.an('array').that.is.empty;
        });

        it('should get correct statistics', async () => {
            await modelTracker.initialize();

            // Add test data
            modelTracker.modelCatalog.set('test-model', { id: 'test-model', name: 'Test Model' });
            modelTracker.stats.updatesPerformed = 5;
            modelTracker.stats.errorsEncountered = 1;

            const stats = modelTracker.getStats();
            expect(stats.totalModels).to.equal(1);
            expect(stats.providersTracked).to.equal(2);
            expect(stats.updatesPerformed).to.equal(5);
            expect(stats.errorsEncountered).to.equal(1);
        });
    });

    describe('PollingScheduler Functionality', () => {
        beforeEach(async () => {
            await modelTracker.initialize();
        });

        it('should initialize scheduler correctly', async () => {
            await scheduler.loadProviderSchedules();

            expect(scheduler.schedules.size).to.equal(2);
            expect(scheduler.schedules.has('openai')).to.be.true;
            expect(scheduler.schedules.has('huggingface')).to.be.true;
        });

        it('should start and stop scheduler', async () => {
            await scheduler.start();
            expect(scheduler.isRunning).to.be.true;

            await scheduler.stop();
            expect(scheduler.isRunning).to.be.false;
        });

        it('should create correct schedule configuration', () => {
            const config = scheduler.createScheduleConfig(mockProviders[0]);

            expect(config.provider).to.equal('openai');
            expect(config.enabled).to.be.true;
            expect(config.priority).to.equal(1);
            expect(config.retryCount).to.equal(0);
        });

        it('should handle job execution', async () => {
            // Mock successful execution
            sinon.stub(modelTracker, 'updateProviderCatalog').resolves({
                provider: 'openai',
                modelsFound: 2,
                duration: 100
            });

            // Mock setTimeout to execute immediately
            const originalSetTimeout = global.setTimeout;
            global.setTimeout = (fn) => fn();

            await scheduler.executeProviderJob('openai');

            global.setTimeout = originalSetTimeout;

            expect(modelTracker.updateProviderCatalog.calledOnce).to.be.true;
            expect(scheduler.stats.totalJobsExecuted).to.equal(1);
        });

        it('should handle job failures with retry logic', async () => {
            // Mock failure
            sinon.stub(modelTracker, 'updateProviderCatalog').rejects(new Error('API Error'));

            await scheduler.executeProviderJob('openai');

            expect(scheduler.stats.totalJobsFailed).to.equal(1);
            expect(scheduler.schedules.get('openai').consecutiveFailures).to.equal(1);
        });

        it('should get correct scheduler statistics', async () => {
            await scheduler.loadProviderSchedules();

            const stats = scheduler.getStats();
            expect(stats.totalSchedules).to.equal(2);
            expect(stats.isRunning).to.be.false;
            expect(stats.activeJobs).to.equal(0);
        });
    });

    describe('DeltaDetector Functionality', () => {
        it('should detect initial changes', async () => {
            const models = [
                { id: 'model-1', name: 'Model 1' },
                { id: 'model-2', name: 'Model 2' }
            ];

            const changes = await detector.detectChanges('test-provider', models);

            expect(changes.hasChanges).to.be.true;
            expect(changes.isInitial).to.be.true;
            expect(changes.summary.added).to.equal(2);
            expect(changes.details.added).to.have.lengthOf(2);
        });

        it('should detect model additions', async () => {
            // Initial state
            await detector.detectChanges('test-provider', [
                { id: 'model-1', name: 'Model 1' }
            ]);

            // Add new model
            const changes = await detector.detectChanges('test-provider', [
                { id: 'model-1', name: 'Model 1' },
                { id: 'model-2', name: 'Model 2' }
            ]);

            expect(changes.hasChanges).to.be.true;
            expect(changes.summary.added).to.equal(1);
            expect(changes.summary.removed).to.equal(0);
            expect(changes.details.added[0].id).to.equal('model-2');
        });

        it('should detect model removals', async () => {
            // Initial state
            await detector.detectChanges('test-provider', [
                { id: 'model-1', name: 'Model 1' },
                { id: 'model-2', name: 'Model 2' }
            ]);

            // Remove model
            const changes = await detector.detectChanges('test-provider', [
                { id: 'model-1', name: 'Model 1' }
            ]);

            expect(changes.hasChanges).to.be.true;
            expect(changes.summary.removed).to.equal(1);
            expect(changes.details.removed[0].id).to.equal('model-2');
        });

        it('should detect model modifications', async () => {
            // Initial state
            await detector.detectChanges('test-provider', [
                { id: 'model-1', name: 'Model 1', capabilities: ['text'] }
            ]);

            // Modify model
            const changes = await detector.detectChanges('test-provider', [
                { id: 'model-1', name: 'Model 1 Updated', capabilities: ['text', 'vision'] }
            ]);

            expect(changes.hasChanges).to.be.true;
            expect(changes.summary.modified).to.equal(1);
            expect(changes.details.modified[0].modifications).to.have.lengthOf(2);
        });

        it('should return no changes for identical states', async () => {
            const models = [
                { id: 'model-1', name: 'Model 1', capabilities: ['text'] }
            ];

            await detector.detectChanges('test-provider', models);
            const changes = await detector.detectChanges('test-provider', models);

            expect(changes.hasChanges).to.be.false;
            expect(changes.summary.added).to.equal(0);
            expect(changes.summary.removed).to.equal(0);
            expect(changes.summary.modified).to.equal(0);
        });

        it('should get correct statistics', async () => {
            await detector.detectChanges('test-provider', [
                { id: 'model-1', name: 'Model 1' }
            ]);

            const stats = detector.getStats();
            expect(stats.totalComparisons).to.equal(1);
            expect(stats.changesDetected).to.equal(1);
            expect(stats.modelsAdded).to.equal(1);
        });
    });

    describe('RateLimiter Functionality', () => {
        beforeEach(async () => {
            await rateLimiter.initialize();
        });

        it('should initialize rate limits for providers', () => {
            expect(rateLimiter.rateLimits.size).to.equal(2);
            expect(rateLimiter.rateLimits.has('openai')).to.be.true;
            expect(rateLimiter.rateLimits.has('huggingface')).to.be.true;
        });

        it('should allow requests within limits', async () => {
            const result = await rateLimiter.canMakeRequest('openai', 1000);

            expect(result.allowed).to.be.true;
        });

        it('should block requests over rate limits', async () => {
            // Simulate hitting the limit
            const limits = rateLimiter.rateLimits.get('openai');
            limits.current.requests_this_minute = 60; // At limit

            const result = await rateLimiter.canMakeRequest('openai', 0);

            expect(result.allowed).to.be.false;
            expect(result.reason).to.equal('request_limit_exceeded');
        });

        it('should track request usage', async () => {
            await rateLimiter.recordRequest('openai', 1000, true);

            const current = rateLimiter.currentUsage.get('openai');
            expect(current.requests_this_minute).to.equal(1);
            expect(current.tokens_this_minute).to.equal(1000);
        });

        it('should handle rate limit hits with backoff', async () => {
            await rateLimiter.recordRequest('openai', 0, false); // Failed request

            const limits = rateLimiter.rateLimits.get('openai');
            expect(limits.backoff.consecutive_hits).to.equal(1);
            expect(limits.backoff.until).to.be.above(Date.now());
        });

        it('should get correct provider status', () => {
            const status = rateLimiter.getProviderStatus('openai');

            expect(status).to.have.property('provider', 'openai');
            expect(status).to.have.property('limits');
            expect(status).to.have.property('current');
            expect(status).to.have.property('utilization');
            expect(status).to.have.property('backoff');
        });

        it('should get correct statistics', () => {
            const stats = rateLimiter.getStats();
            expect(stats).to.have.property('providersTracked', 2);
            expect(stats).to.have.property('totalRequests', 0);
            expect(stats).to.have.property('rateLimitHits', 0);
        });
    });

    describe('HealthMonitor Functionality', () => {
        beforeEach(async () => {
            await modelTracker.initialize();
            await rateLimiter.initialize();
        });

        it('should initialize health status for providers and models', async () => {
            // Add a test model
            modelTracker.modelCatalog.set('test-model', {
                id: 'test-model',
                name: 'Test Model',
                provider: 'openai'
            });

            await healthMonitor.initializeHealthStatus();

            expect(healthMonitor.providerHealth.size).to.equal(2);
            expect(healthMonitor.modelHealth.size).to.equal(1);
        });

        it('should start and stop monitoring', async () => {
            await healthMonitor.startMonitoring();
            expect(healthMonitor.monitoringActive).to.be.true;

            await healthMonitor.stopMonitoring();
            expect(healthMonitor.monitoringActive).to.be.false;
        });

        it('should get health summary', async () => {
            await healthMonitor.initializeHealthStatus();

            const summary = healthMonitor.getHealthSummary();

            expect(summary).to.have.property('providers');
            expect(summary).to.have.property('models');
            expect(summary).to.have.property('overall');
            expect(summary.providers.total).to.equal(2);
            expect(summary.models.total).to.equal(0); // No models added yet
        });

        it('should get provider health status', async () => {
            await healthMonitor.initializeHealthStatus();

            const health = healthMonitor.getProviderHealth('openai');

            expect(health).to.have.property('entityId', 'openai');
            expect(health).to.have.property('entityType', 'provider');
            expect(health).to.have.property('status', 'unknown');
        });

        it('should get model health status', async () => {
            await healthMonitor.initializeHealthStatus();

            // Add a test model
            modelTracker.modelCatalog.set('test-model', {
                id: 'test-model',
                name: 'Test Model',
                provider: 'openai'
            });

            await healthMonitor.initializeHealthStatus();

            const health = healthMonitor.getModelHealth('test-model');

            expect(health).to.have.property('entityId', 'test-model');
            expect(health).to.have.property('entityType', 'model');
            expect(health).to.have.property('status', 'unknown');
        });

        it('should get correct statistics', async () => {
            const stats = healthMonitor.getStats();

            expect(stats).to.have.property('totalHealthChecks', 0);
            expect(stats).to.have.property('monitoringActive', false);
            expect(stats).to.have.property('providersMonitored', 0);
            expect(stats).to.have.property('modelsMonitored', 0);
        });
    });

    describe('Integration Tests', () => {
        it('should perform full catalog update with all components', async () => {
            await modelTracker.initialize();
            await rateLimiter.initialize();

            // Mock successful API responses
            sinon.stub(modelTracker, 'fetchProviderModels').resolves({
                data: [
                    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
                ]
            });

            // Mock rate limiter to allow requests
            sinon.stub(rateLimiter, 'canMakeRequest').resolves({ allowed: true });
            sinon.stub(rateLimiter, 'recordRequest').resolves();

            const result = await modelTracker.updateCatalog();

            expect(result.success).to.be.true;
            expect(result.results).to.have.lengthOf(2);
            expect(modelTracker.getAllModels()).to.have.lengthOf(2);
        });

        it('should handle component failures gracefully', async () => {
            await modelTracker.initialize();

            // Mock API failure
            sinon.stub(modelTracker, 'fetchProviderModels').rejects(new Error('Network Error'));

            const result = await modelTracker.updateCatalog();

            expect(result.success).to.be.false;
            expect(result.errors).to.have.lengthOf(2);
            expect(modelTracker.stats.errorsEncountered).to.equal(2);
        });

        it('should provide comprehensive system status', async () => {
            await modelTracker.initialize();
            await rateLimiter.initialize();

            // Add test data
            modelTracker.modelCatalog.set('test-model', {
                id: 'test-model',
                name: 'Test Model',
                provider: 'openai'
            });

            const trackerStats = modelTracker.getStats();
            const rateLimiterStats = rateLimiter.getStats();

            expect(trackerStats.totalModels).to.equal(1);
            expect(trackerStats.providersTracked).to.equal(2);
            expect(rateLimiterStats.providersTracked).to.equal(2);
        });
    });

    describe('Error Handling', () => {
        it('should handle initialization failures', async () => {
            mockProviderManager.loadProviders.rejects(new Error('Load failed'));

            try {
                await modelTracker.initialize();
                expect.fail('Should have thrown error');
            } catch (error) {
                expect(error.message).to.include('Load failed');
            }
        });

        it('should handle invalid provider configurations', async () => {
            mockProviderManager.validateConfigurations.returns({
                isValid: false,
                errors: [{ provider: 'invalid', errors: ['Invalid config'] }]
            });

            await modelTracker.initialize();

            // Should still initialize but with warnings
            expect(modelTracker.stats.providersTracked).to.equal(2);
        });

        it('should handle rate limiter failures', async () => {
            sinon.stub(rateLimiter, 'initialize').rejects(new Error('Rate limiter init failed'));

            try {
                await rateLimiter.initialize();
                expect.fail('Should have thrown error');
            } catch (error) {
                expect(error.message).to.include('Rate limiter init failed');
            }
        });
    });

    describe('Configuration and Cleanup', () => {
        it('should allow configuration updates', () => {
            const newConfig = {
                updateInterval: 10 * 60 * 1000, // 10 minutes
                maxConcurrentUpdates: 5
            };

            modelTracker.configure(newConfig);

            expect(modelTracker.config.updateInterval).to.equal(10 * 60 * 1000);
            expect(modelTracker.config.maxConcurrentUpdates).to.equal(5);
        });

        it('should clear catalog correctly', () => {
            // Add test data
            modelTracker.modelCatalog.set('test-model', { id: 'test-model' });
            modelTracker.providerCatalogs.set('test-provider', new Set(['test-model']));

            modelTracker.clearCatalog();

            expect(modelTracker.modelCatalog.size).to.equal(0);
            expect(modelTracker.providerCatalogs.size).to.equal(0);
            expect(modelTracker.stats.totalModels).to.equal(0);
        });

        it('should reset detector state', () => {
            // Add test data
            detector.previousStates.set('test', { models: [] });
            detector.changeHistory.set('test', [{ changes: 'test' }]);

            detector.reset();

            expect(detector.previousStates.size).to.equal(0);
            expect(detector.changeHistory.size).to.equal(0);
            expect(detector.stats.totalComparisons).to.equal(0);
        });
    });
});