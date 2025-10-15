/**
 * Unit tests for Automated Update Scheduler
 */

const AutomatedUpdateScheduler = require('../../scheduler/update-scheduler');
const CatalogUpdater = require('../../scheduler/catalog-updater');
const HealthChecker = require('../../scheduler/health-checker');
const ConfigSync = require('../../scheduler/config-sync');
const CleanupManager = require('../../scheduler/cleanup-manager');
const UpdateReporting = require('../../scheduler/reporting');

// Import the singleton instances
const catalogUpdaterInstance = require('../../scheduler/catalog-updater');
const healthCheckerInstance = require('../../scheduler/health-checker');
const configSyncInstance = require('../../scheduler/config-sync');
const cleanupManagerInstance = require('../../scheduler/cleanup-manager');
const updateReportingInstance = require('../../scheduler/reporting');

describe('AutomatedUpdateScheduler', () => {
    let mockModelTracker;
    let scheduler;

    beforeEach(() => {
        // Mock model tracker
        mockModelTracker = {
            providerManager: {
                getFilteredProviders: jest.fn().mockReturnValue([
                    { name: 'openai', baseURL: 'https://api.openai.com' },
                    { name: 'anthropic', baseURL: 'https://api.anthropic.com' }
                ])
            },
            updateProviderCatalog: jest.fn().mockResolvedValue({
                models: [],
                duration: 100
            })
        };

        // Create scheduler instance
        scheduler = new AutomatedUpdateScheduler(mockModelTracker);
    });

    afterEach(async () => {
        if (scheduler.isRunning) {
            await scheduler.stop();
        }
        jest.clearAllMocks();
    });

    describe('initialization', () => {
        test('should initialize with correct default config', () => {
            expect(scheduler.config.updateInterval).toBe(30 * 60 * 1000);
            expect(scheduler.config.enableCatalogUpdates).toBe(true);
            expect(scheduler.config.enableHealthChecks).toBe(true);
            expect(scheduler.config.enableConfigSync).toBe(true);
            expect(scheduler.config.enableCleanup).toBe(true);
        });

        test('should not be running initially', () => {
            expect(scheduler.isRunning).toBe(false);
        });

        test('should have empty update jobs initially', () => {
            expect(scheduler.updateJobs.size).toBe(0);
        });
    });

    describe('start/stop', () => {
        test('should start successfully', async () => {
            await scheduler.initialize();
            await scheduler.start();

            expect(scheduler.isRunning).toBe(true);
            expect(scheduler.updateJobs.size).toBeGreaterThan(0);
        });

        test('should stop successfully', async () => {
            await scheduler.initialize();
            await scheduler.start();
            await scheduler.stop();

            expect(scheduler.isRunning).toBe(false);
            expect(scheduler.updateJobs.size).toBe(0);
        });

        test('should handle start when already running', async () => {
            await scheduler.initialize();
            await scheduler.start();
            await scheduler.start(); // Should not throw

            expect(scheduler.isRunning).toBe(true);
        });

        test('should handle stop when not running', async () => {
            await scheduler.stop(); // Should not throw

            expect(scheduler.isRunning).toBe(false);
        });
    });

    describe('update jobs', () => {
        beforeEach(async () => {
            await scheduler.initialize();
        });

        test('should schedule update jobs on start', async () => {
            await scheduler.start();

            expect(scheduler.updateJobs.has('health-check')).toBe(true);
            expect(scheduler.updateJobs.has('config-sync')).toBe(true);
            expect(scheduler.updateJobs.has('cleanup')).toBe(true);
        });

        test('should execute health checks', async () => {
            const mockHealthChecker = {
                performHealthChecks: jest.fn().mockResolvedValue({
                    duration: 100,
                    results: [],
                    summary: { healthy: 1, unhealthy: 0 }
                })
            };

            scheduler.healthChecker = mockHealthChecker;

            await scheduler.performHealthChecks();

            expect(mockHealthChecker.performHealthChecks).toHaveBeenCalled();
        });

        test('should execute config sync', async () => {
            const mockConfigSync = {
                performSync: jest.fn().mockResolvedValue({
                    syncId: 'test-sync',
                    duration: 100,
                    results: []
                })
            };

            scheduler.configSync = mockConfigSync;

            await scheduler.performConfigSync();

            expect(mockConfigSync.performSync).toHaveBeenCalled();
        });

        test('should execute cleanup', async () => {
            const mockCleanupManager = {
                performCleanup: jest.fn().mockResolvedValue({
                    cleanupId: 'test-cleanup',
                    duration: 100,
                    results: { models: { removed: 0 }, providers: { removed: 0 } }
                })
            };

            scheduler.cleanupManager = mockCleanupManager;

            await scheduler.performCleanup();

            expect(mockCleanupManager.performCleanup).toHaveBeenCalled();
        });

        test('should force execute update job', async () => {
            const mockHealthChecker = {
                performHealthChecks: jest.fn().mockResolvedValue({})
            };

            scheduler.healthChecker = mockHealthChecker;

            await scheduler.forceUpdate('health-check');

            expect(mockHealthChecker.performHealthChecks).toHaveBeenCalled();
        });

        test('should throw error for unknown job', async () => {
            await expect(scheduler.forceUpdate('unknown-job')).rejects.toThrow('Unknown update job');
        });
    });

    describe('statistics', () => {
        beforeEach(async () => {
            await scheduler.initialize();
        });

        test('should record successful updates', () => {
            const result = { duration: 100 };

            scheduler.recordUpdateSuccess('test-job', result);

            expect(scheduler.stats.totalUpdates).toBe(1);
            expect(scheduler.stats.successfulUpdates).toBe(1);
            expect(scheduler.stats.failedUpdates).toBe(0);
        });

        test('should record failed updates', () => {
            const error = new Error('Test error');

            scheduler.recordUpdateFailure('test-job', error);

            expect(scheduler.stats.totalUpdates).toBe(1);
            expect(scheduler.stats.successfulUpdates).toBe(0);
            expect(scheduler.stats.failedUpdates).toBe(1);
        });

        test('should get update status', () => {
            scheduler.recordUpdateSuccess('health-check', { duration: 100 });
            scheduler.recordUpdateFailure('config-sync', new Error('Test'));

            const status = scheduler.getUpdateStatus();

            expect(status['health-check']).toBeDefined();
            expect(status['config-sync']).toBeDefined();
            expect(status['health-check'].totalExecutions).toBe(1);
            expect(status['config-sync'].totalExecutions).toBe(1);
        });

        test('should get scheduler stats', () => {
            scheduler.recordUpdateSuccess('test-job', { duration: 100 });

            const stats = scheduler.getStats();

            expect(stats.totalUpdates).toBe(1);
            expect(stats.successfulUpdates).toBe(1);
            expect(stats.isRunning).toBe(false);
        });
    });

    describe('configuration', () => {
        test('should configure scheduler settings', () => {
            const newConfig = {
                updateInterval: 60 * 60 * 1000,
                enableHealthChecks: false
            };

            scheduler.configure(newConfig);

            expect(scheduler.config.updateInterval).toBe(60 * 60 * 1000);
            expect(scheduler.config.enableHealthChecks).toBe(false);
        });

        test('should reset scheduler state', () => {
            scheduler.recordUpdateSuccess('test-job', { duration: 100 });
            scheduler.reset();

            expect(scheduler.stats.totalUpdates).toBe(0);
            expect(scheduler.updateJobs.size).toBe(0);
            expect(scheduler.updateHistory.length).toBe(0);
        });
    });
});

describe('CatalogUpdater', () => {
    let catalogUpdater;
    let mockModelTracker;

    beforeEach(() => {
        mockModelTracker = {
            getModelsByProvider: jest.fn().mockReturnValue([]),
            updateProviderCatalog: jest.fn().mockResolvedValue({
                models: [
                    { id: 'model1', name: 'Model 1', provider: 'test' },
                    { id: 'model2', name: 'Model 2', provider: 'test' }
                ]
            }),
            addModel: jest.fn().mockResolvedValue(),
            updateModel: jest.fn().mockResolvedValue(),
            removeModel: jest.fn().mockResolvedValue()
        };

        // Reset the singleton instance
        catalogUpdaterInstance.reset();
        catalogUpdater = catalogUpdaterInstance;
        catalogUpdater.modelTracker = mockModelTracker;
    });

    describe('initialization', () => {
        test('should initialize with default config', () => {
            expect(catalogUpdater.config.batchSize).toBe(10);
            expect(catalogUpdater.config.maxConcurrentUpdates).toBe(3);
            expect(catalogUpdater.config.retryAttempts).toBe(3);
        });
    });

    describe('catalog updates', () => {
        beforeEach(async () => {
            await catalogUpdater.initialize(mockModelTracker);
        });

        test('should perform catalog update', async () => {
            const result = await catalogUpdater.performCatalogUpdate();

            expect(result).toHaveProperty('updateId');
            expect(result).toHaveProperty('duration');
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('summary');
        });

        test('should update provider catalog', async () => {
            const provider = { name: 'test', baseURL: 'https://api.test.com' };

            const result = await catalogUpdater.updateProviderCatalog(provider);

            expect(result.provider).toBe('test');
            expect(result).toHaveProperty('duration');
            expect(result).toHaveProperty('changes');
        });

        test('should process catalog changes', async () => {
            const newModels = [
                { id: 'new-model', name: 'New Model', provider: 'test' }
            ];
            const existingModelIds = new Set();

            const changes = await catalogUpdater.processCatalogChanges(
                'test', newModels, existingModelIds, {}
            );

            expect(changes.added).toBe(1);
            expect(changes.updated).toBe(0);
            expect(changes.removed).toBe(0);
        });

        test('should check if model is stale', () => {
            const recentModel = {
                last_verified: new Date().toISOString()
            };
            const oldModel = {
                last_verified: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() // 40 days ago
            };

            expect(catalogUpdater.isModelStale(recentModel, 30 * 24 * 60 * 60 * 1000)).toBe(false);
            expect(catalogUpdater.isModelStale(oldModel, 30 * 24 * 60 * 60 * 1000)).toBe(true);
        });
    });

    describe('statistics', () => {
        test('should get update statistics', () => {
            const stats = catalogUpdater.getStats();

            expect(stats).toHaveProperty('totalUpdates');
            expect(stats).toHaveProperty('successfulUpdates');
            expect(stats).toHaveProperty('failedUpdates');
            expect(stats).toHaveProperty('config');
        });

        test('should configure updater settings', () => {
            catalogUpdater.configure({ batchSize: 20 });

            expect(catalogUpdater.config.batchSize).toBe(20);
        });
    });
});

describe('HealthChecker', () => {
    let healthChecker;
    let mockModelTracker;

    beforeEach(() => {
        mockModelTracker = {
            providerManager: {
                getFilteredProviders: jest.fn().mockReturnValue([
                    { name: 'test', baseURL: 'https://api.test.com' }
                ])
            }
        };

        // Reset the singleton instance
        healthCheckerInstance.reset();
        healthChecker = healthCheckerInstance;
        healthChecker.modelTracker = mockModelTracker;
    });

    describe('initialization', () => {
        test('should initialize with default config', () => {
            expect(healthChecker.config.checkInterval).toBe(5 * 60 * 1000);
            expect(healthChecker.config.timeout).toBe(30000);
            expect(healthChecker.config.maxConcurrentChecks).toBe(5);
        });
    });

    describe('health checks', () => {
        beforeEach(async () => {
            await healthChecker.initialize(mockModelTracker);
        });

        test('should perform health checks', async () => {
            // Mock fetch for connectivity check
            global.fetch = jest.fn().mockResolvedValue({
                ok: true,
                status: 200
            });

            const result = await healthChecker.performHealthChecks();

            expect(result).toHaveProperty('duration');
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('summary');
        });

        test('should check provider health', async () => {
            const provider = { name: 'test', baseURL: 'https://api.test.com' };

            // Mock the checkProviderHealth from monitoring
            const mockCheckProviderHealth = jest.fn().mockResolvedValue({
                message: 'Provider test is healthy',
                responseTime: 100
            });

            // Replace the imported function
            require('../../utils/monitoring').checkProviderHealth = mockCheckProviderHealth;

            const result = await healthChecker.checkProviderHealth(provider);

            expect(result).toHaveProperty('responseTime');
        });

        test('should update health states', () => {
            const results = [
                { provider: 'test', healthy: true, responseTime: 100 }
            ];

            healthChecker.updateHealthStates(results);

            const health = healthChecker.providerHealth.get('test');
            expect(health.status).toBe('healthy');
            expect(health.consecutiveSuccesses).toBe(1);
        });

        test('should get health summary', () => {
            healthChecker.providerHealth.set('test1', { status: 'healthy' });
            healthChecker.providerHealth.set('test2', { status: 'unhealthy' });

            const summary = healthChecker.getHealthSummary();

            expect(summary.totalProviders).toBe(2);
            expect(summary.healthy).toBe(1);
            expect(summary.unhealthy).toBe(1);
        });
    });
});

describe('ConfigSync', () => {
    let configSync;
    let mockModelTracker;

    beforeEach(() => {
        mockModelTracker = {
            providerManager: {
                getFilteredProviders: jest.fn().mockReturnValue([
                    { name: 'test', baseURL: 'https://api.test.com' }
                ])
            }
        };

        // Reset the singleton instance
        configSyncInstance.reset();
        configSync = configSyncInstance;
        configSync.modelTracker = mockModelTracker;
    });

    describe('initialization', () => {
        test('should initialize with default config', () => {
            expect(configSync.config.syncInterval).toBe(60 * 60 * 1000);
            expect(configSync.config.backupEnabled).toBe(true);
            expect(configSync.config.validateBeforeSync).toBe(true);
        });
    });

    describe('sync operations', () => {
        beforeEach(async () => {
            await configSync.initialize(mockModelTracker);
        });

        test('should perform config sync', async () => {
            const result = await configSync.performSync();

            expect(result).toHaveProperty('syncId');
            expect(result).toHaveProperty('duration');
            expect(result).toHaveProperty('results');
        });

        test('should sync provider configs', async () => {
            const results = await configSync.syncProviderConfigs();

            expect(Array.isArray(results)).toBe(true);
        });

        test('should generate provider config', () => {
            const provider = {
                name: 'test',
                baseURL: 'https://api.test.com',
                apiKey: 'test-key',
                priority: 5
            };

            const config = configSync.generateProviderConfig(provider);

            expect(config.name).toBe('test');
            expect(config.base_url).toBe('https://api.test.com');
            expect(config.api_key).toBe('test-key');
            expect(config.priority).toBe(5);
        });
    });
});

describe('CleanupManager', () => {
    let cleanupManager;
    let mockModelTracker;

    beforeEach(() => {
        mockModelTracker = {
            getAllModels: jest.fn().mockReturnValue([]),
            removeModel: jest.fn().mockResolvedValue(),
            providerManager: {
                getFilteredProviders: jest.fn().mockReturnValue([])
            }
        };

        // Reset the singleton instance
        cleanupManagerInstance.reset();
        cleanupManager = cleanupManagerInstance;
        cleanupManager.modelTracker = mockModelTracker;
    });

    describe('initialization', () => {
        test('should initialize with default config', () => {
            expect(cleanupManager.config.cleanupInterval).toBe(24 * 60 * 60 * 1000);
            expect(cleanupManager.config.staleModelThreshold).toBe(30 * 24 * 60 * 60 * 1000);
            expect(cleanupManager.config.dryRun).toBe(false);
        });
    });

    describe('cleanup operations', () => {
        beforeEach(async () => {
            await cleanupManager.initialize(mockModelTracker);
        });

        test('should perform cleanup', async () => {
            const result = await cleanupManager.performCleanup();

            expect(result).toHaveProperty('cleanupId');
            expect(result).toHaveProperty('duration');
            expect(result).toHaveProperty('results');
        });

        test('should cleanup stale models', async () => {
            const staleModel = {
                id: 'stale-model',
                last_verified: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString() // 40 days ago
            };

            mockModelTracker.getAllModels.mockReturnValue([staleModel]);

            const result = await cleanupManager.cleanupStaleModels({});

            expect(result.removed).toBe(1);
        });

        test('should check if model is stale', () => {
            const staleModel = {
                last_verified: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
            };
            const freshModel = {
                last_verified: new Date().toISOString()
            };

            expect(cleanupManager.isModelStale(staleModel)).toBe(true);
            expect(cleanupManager.isModelStale(freshModel)).toBe(false);
        });

        test('should get cleanup recommendations', () => {
            const recommendations = cleanupManager.getCleanupRecommendations();

            expect(Array.isArray(recommendations)).toBe(true);
        });
    });
});

describe('UpdateReporting', () => {
    let updateReporting;
    let mockUpdateScheduler;

    beforeEach(() => {
        mockUpdateScheduler = {
            getStats: jest.fn().mockReturnValue({
                totalUpdates: 10,
                successfulUpdates: 8,
                failedUpdates: 2,
                isRunning: true
            }),
            catalogUpdater: {
                getStats: jest.fn().mockReturnValue({
                    totalUpdates: 5,
                    successfulUpdates: 5,
                    failedUpdates: 0
                })
            },
            healthChecker: {
                getHealthStatus: jest.fn().mockReturnValue({
                    summary: { healthy: 2, unhealthy: 0, totalProviders: 2 },
                    stats: { totalChecks: 10, averageResponseTime: 100 }
                })
            },
            configSync: {
                getStats: jest.fn().mockReturnValue({
                    totalSyncs: 3,
                    successfulSyncs: 3,
                    failedSyncs: 0
                })
            },
            cleanupManager: {
                getStats: jest.fn().mockReturnValue({
                    totalCleanups: 2,
                    successfulCleanups: 2,
                    failedCleanups: 0
                })
            }
        };

        // Reset the singleton instance
        updateReportingInstance.reset();
        updateReporting = updateReportingInstance;
        updateReporting.updateScheduler = mockUpdateScheduler;
    });

    describe('initialization', () => {
        test('should initialize with default config', () => {
            expect(updateReporting.config.reportInterval).toBe(60 * 60 * 1000);
            expect(updateReporting.config.enableFileReports).toBe(true);
            expect(updateReporting.config.includeMetrics).toBe(true);
        });
    });

    describe('report generation', () => {
        beforeEach(async () => {
            await updateReporting.initialize(mockUpdateScheduler);
        });

        test('should generate report', async () => {
            const result = await updateReporting.generateReport();

            expect(result).toHaveProperty('reportId');
            expect(result).toHaveProperty('report');
            expect(result).toHaveProperty('data');
            expect(result).toHaveProperty('duration');
        });

        test('should collect report data', async () => {
            const data = await updateReporting.collectReportData();

            expect(data).toHaveProperty('timestamp');
            expect(data).toHaveProperty('system');
            expect(data).toHaveProperty('scheduler');
            expect(data).toHaveProperty('catalog');
            expect(data).toHaveProperty('health');
            expect(data).toHaveProperty('config');
            expect(data).toHaveProperty('cleanup');
        });

        test('should format report content', () => {
            const mockData = {
                timestamp: new Date().toISOString(),
                period: 'last_24h',
                scheduler: { totalUpdates: 10, successfulUpdates: 8, failedUpdates: 2 },
                health: { summary: { healthy: 2, unhealthy: 0 } },
                metrics: {
                    requests: { total: 100, successRate: 0.95 },
                    performance: { averageResponseTime: 150 }
                }
            };

            const report = updateReporting.formatReport(mockData, 'test-report', {});

            expect(typeof report).toBe('string');
            expect(report).toContain('AUTOMATED UPDATE SCHEDULER REPORT');
            expect(report).toContain('SCHEDULER STATISTICS');
            expect(report).toContain('HEALTH CHECK STATISTICS');
        });

        test('should generate recommendations', () => {
            const mockData = {
                scheduler: { totalUpdates: 10, failedUpdates: 3, isRunning: false },
                health: { summary: { unhealthy: 1 } }
            };

            const recommendations = updateReporting.generateRecommendations(mockData);

            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations.length).toBeGreaterThan(0);
        });
    });

    describe('utilities', () => {
        test('should format duration', () => {
            expect(updateReporting.formatDuration(30)).toBe('30.00s');
            expect(updateReporting.formatDuration(90)).toBe('1.50m');
            expect(updateReporting.formatDuration(3660)).toBe('1.02h');
            expect(updateReporting.formatDuration(86401)).toBe('1.00d');
        });

        test('should format bytes', () => {
            expect(updateReporting.formatBytes(0)).toBe('0 B');
            expect(updateReporting.formatBytes(1024)).toBe('1.00 KB');
            expect(updateReporting.formatBytes(1024 * 1024)).toBe('1.00 MB');
        });
    });
});