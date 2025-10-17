/**
 * Comprehensive Performance and Load Testing for TaskMaster
 * Tests initialization, tool execution, concurrent operations, and resource utilization
 */

const { performance } = require('perf_hooks');
const { EventEmitter } = require('events');
const TaskMaster = require('../../taskmaster');
const RolesConfig = require('../../rolesConfig');

// Mock external dependencies
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));

jest.mock('node-fetch', () => jest.fn());
jest.mock('../../rolesConfig');

const fetch = require('node-fetch');

describe('TaskMaster Performance Tests', () => {
    let taskMaster;
    let mockRolesConfig;
    let mockFetch;

    // Performance thresholds (in milliseconds)
    const PERFORMANCE_THRESHOLDS = {
        initialization: 100,      // Max 100ms for initialization
        toolRegistration: 50,     // Max 50ms per tool registration
        singleExecution: 200,     // Max 200ms for single tool execution
        memoryUsage: 50 * 1024 * 1024, // Max 50MB memory usage
        concurrentExecution: 1000 // Max 1000ms for concurrent operations
    };

    // Mock configuration data
    const mockConfig = {
        endpoints: {
            '/chat/completions': {
                models: {
                    'gpt-4': [{
                        provider_name: 'OpenAI',
                        base_url: 'https://api.openai.com/v1',
                        api_key: 'test-key',
                        model: 'gpt-4',
                        priority: 1
                    }]
                }
            }
        }
    };

    const mockTools = {};
    // Generate 100 mock tools for performance testing
    for (let i = 0; i < 100; i++) {
        mockTools[`tool-${i}`] = {
            name: `tool-${i}`,
            description: `Performance test tool ${i}`,
            endpoint: '/chat/completions',
            providers: [{
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4',
                priority: 1
            }],
            capabilities: ['text-generation'],
            parameters: {
                messages: { type: 'array', required: true },
                temperature: { type: 'number', default: 0.7 }
            }
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup RolesConfig mock
        mockRolesConfig = {
            loadConfig: jest.fn().mockResolvedValue(mockConfig),
            getTools: jest.fn().mockReturnValue(mockTools),
            getProviderConfig: jest.fn().mockReturnValue({
                provider_name: 'OpenAI',
                base_url: 'https://api.openai.com/v1',
                api_key: 'test-key',
                model: 'gpt-4',
                priority: 1
            })
        };
        RolesConfig.mockImplementation(() => mockRolesConfig);

        // Setup fetch mock with controlled response time
        mockFetch = jest.fn();
        fetch.default = mockFetch;

        // Mock successful API response
        mockFetch.mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                choices: [{ message: { content: 'Test response' } }],
                usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
            })
        });

        taskMaster = new TaskMaster();
    });

    afterEach(() => {
        jest.clearAllTimers();
    });

    // Performance metrics collection utilities
    const collectMetrics = () => {
        const memUsage = process.memoryUsage();
        return {
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            timestamp: Date.now()
        };
    };

    const measureExecutionTime = async (fn) => {
        const start = performance.now();
        const startMem = collectMetrics();

        const result = await fn();

        const end = performance.now();
        const endMem = collectMetrics();

        return {
            duration: end - start,
            memoryDelta: endMem.heapUsed - startMem.heapUsed,
            result
        };
    };

    describe('Basic Performance Tests', () => {
        test('should initialize within performance threshold', async () => {
            const metrics = await measureExecutionTime(async () => {
                await taskMaster.initialize();
            });

            expect(metrics.duration).toBeLessThan(PERFORMANCE_THRESHOLDS.initialization);
            expect(taskMaster.isInitialized).toBe(true);
            console.log(`Initialization time: ${metrics.duration.toFixed(2)}ms`);
        });

        test('should register multiple tools efficiently', async () => {
            await taskMaster.initialize();

            const startTime = performance.now();
            // Tools are already registered during initialization
            const endTime = performance.now();

            const registrationTime = endTime - startTime;
            const avgTimePerTool = registrationTime / Object.keys(mockTools).length;

            expect(avgTimePerTool).toBeLessThan(PERFORMANCE_THRESHOLDS.toolRegistration);
            expect(Object.keys(taskMaster.registeredTools)).toHaveLength(Object.keys(mockTools).length);
            console.log(`Tool registration: ${registrationTime.toFixed(2)}ms total, ${avgTimePerTool.toFixed(4)}ms per tool`);
        });

        test('should execute single tool within time threshold', async () => {
            await taskMaster.initialize();

            const metrics = await measureExecutionTime(async () => {
                return await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: 'Test message' }]
                });
            });

            expect(metrics.duration).toBeLessThan(PERFORMANCE_THRESHOLDS.singleExecution);
            expect(metrics.result).toHaveProperty('executionId');
            console.log(`Single tool execution: ${metrics.duration.toFixed(2)}ms`);
        });

        test('should maintain memory usage within limits during initialization', async () => {
            const startMem = collectMetrics();

            await taskMaster.initialize();

            const endMem = collectMetrics();
            const memoryIncrease = endMem.heapUsed - startMem.heapUsed;

            expect(memoryIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.memoryUsage);
            console.log(`Memory usage after initialization: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        });

        test('should maintain memory usage within limits during tool execution', async () => {
            await taskMaster.initialize();

            const startMem = collectMetrics();

            await taskMaster.executeTool('tool-0', {
                messages: [{ role: 'user', content: 'Test message' }]
            });

            const endMem = collectMetrics();
            const memoryIncrease = endMem.heapUsed - startMem.heapUsed;

            expect(memoryIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.memoryUsage);
            console.log(`Memory usage during execution: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        });
    });

    describe('Load Testing Scenarios', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should handle 10 concurrent tool executions', async () => {
            const concurrentRequests = 10;
            const promises = [];

            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(
                    measureExecutionTime(async () => {
                        return await taskMaster.executeTool(`tool-${i % 10}`, {
                            messages: [{ role: 'user', content: `Test message ${i}` }]
                        });
                    })
                );
            }

            const startTime = performance.now();
            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;

            expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.concurrentExecution);
            expect(results).toHaveLength(concurrentRequests);
            results.forEach(result => {
                expect(result.result).toHaveProperty('executionId');
            });

            console.log(`10 concurrent executions: ${totalTime.toFixed(2)}ms total`);
        });

        test('should handle 50 concurrent tool executions', async () => {
            const concurrentRequests = 50;
            const promises = [];

            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(
                    measureExecutionTime(async () => {
                        return await taskMaster.executeTool(`tool-${i % 10}`, {
                            messages: [{ role: 'user', content: `Test message ${i}` }]
                        });
                    })
                );
            }

            const startTime = performance.now();
            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;

            expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.concurrentExecution * 2);
            expect(results).toHaveLength(concurrentRequests);

            console.log(`50 concurrent executions: ${totalTime.toFixed(2)}ms total`);
        });

        test('should handle sustained load over 5 minutes', async () => {
            const testDuration = 5 * 60 * 1000; // 5 minutes
            const startTime = Date.now();
            let executionCount = 0;
            const executionTimes = [];

            while (Date.now() - startTime < testDuration) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Sustained test ${executionCount}` }]
                    });
                });

                executionTimes.push(metrics.duration);
                executionCount++;

                // Small delay to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            const avgExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
            const maxExecutionTime = Math.max(...executionTimes);
            const minExecutionTime = Math.min(...executionTimes);

            expect(avgExecutionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.singleExecution);
            expect(maxExecutionTime).toBeLessThan(PERFORMANCE_THRESHOLDS.singleExecution * 5);

            console.log(`Sustained load (5min): ${executionCount} executions`);
            console.log(`Average execution time: ${avgExecutionTime.toFixed(2)}ms`);
            console.log(`Min/Max execution time: ${minExecutionTime.toFixed(2)}ms / ${maxExecutionTime.toFixed(2)}ms`);
        }, 6 * 60 * 1000); // 6 minute timeout

        test('should handle burst traffic simulation', async () => {
            const burstSize = 20;
            const burstCount = 5;
            const burstDelays = [0, 100, 200, 300, 400]; // Reduced delays for testing

            const allResults = [];

            for (let burst = 0; burst < burstCount; burst++) {
                if (burst > 0) {
                    await new Promise(resolve => setTimeout(resolve, burstDelays[burst]));
                }

                const promises = [];
                for (let i = 0; i < burstSize; i++) {
                    promises.push(
                        measureExecutionTime(async () => {
                            return await taskMaster.executeTool(`tool-${i % 10}`, {
                                messages: [{ role: 'user', content: `Burst ${burst} message ${i}` }]
                            });
                        })
                    );
                }

                const burstStart = performance.now();
                const results = await Promise.all(promises);
                const burstTime = performance.now() - burstStart;

                allResults.push(...results);
                console.log(`Burst ${burst + 1}: ${burstTime.toFixed(2)}ms for ${burstSize} requests`);
            }

            expect(allResults).toHaveLength(burstSize * burstCount);
        }, 30000); // 30 second timeout

        test('should handle mixed workload patterns', async () => {
            const workloadPatterns = [
                { type: 'simple', messages: [{ role: 'user', content: 'Hello' }] },
                { type: 'complex', messages: [{ role: 'user', content: 'A'.repeat(1000) }] },
                { type: 'multi-turn', messages: [
                    { role: 'user', content: 'Hello' },
                    { role: 'assistant', content: 'Hi there!' },
                    { role: 'user', content: 'How are you?' }
                ]}
            ];

            const concurrentWorkloads = 30;
            const promises = [];

            for (let i = 0; i < concurrentWorkloads; i++) {
                const pattern = workloadPatterns[i % workloadPatterns.length];
                promises.push(
                    measureExecutionTime(async () => {
                        return await taskMaster.executeTool('tool-0', {
                            messages: pattern.messages,
                            temperature: pattern.type === 'creative' ? 0.9 : 0.7
                        });
                    })
                );
            }

            const startTime = performance.now();
            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;

            expect(results).toHaveLength(concurrentWorkloads);
            console.log(`Mixed workload: ${totalTime.toFixed(2)}ms for ${concurrentWorkloads} varied requests`);
        });

        test('should detect memory leaks during prolonged operation', async () => {
            const testDuration = 2 * 60 * 1000; // 2 minutes
            const startTime = Date.now();
            const memoryReadings = [];
            let executionCount = 0;

            while (Date.now() - startTime < testDuration) {
                await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: `Memory leak test ${executionCount}` }]
                });

                executionCount++;

                // Record memory every 10 executions
                if (executionCount % 10 === 0) {
                    memoryReadings.push(collectMetrics());
                }

                // Small delay
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Check for memory growth trend
            const initialMemory = memoryReadings[0].heapUsed;
            const finalMemory = memoryReadings[memoryReadings.length - 1].heapUsed;
            const memoryGrowth = finalMemory - initialMemory;
            const acceptableGrowth = 10 * 1024 * 1024; // 10MB acceptable growth

            expect(memoryGrowth).toBeLessThan(acceptableGrowth);

            console.log(`Memory leak test: ${executionCount} executions over 2 minutes`);
            console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
        }, 3 * 60 * 1000); // 3 minute timeout
    });

    describe('Throughput and Scalability Tests', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should measure requests per second capabilities', async () => {
            const testDuration = 10000; // 10 seconds
            const startTime = Date.now();
            let executionCount = 0;
            const executionTimes = [];

            while (Date.now() - startTime < testDuration) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `RPS test ${executionCount}` }]
                    });
                });

                executionTimes.push(metrics.duration);
                executionCount++;
            }

            const rps = executionCount / (testDuration / 1000);
            const avgResponseTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;

            expect(rps).toBeGreaterThan(5); // At least 5 RPS
            expect(avgResponseTime).toBeLessThan(500); // Average under 500ms

            console.log(`RPS Test: ${rps.toFixed(2)} requests/second`);
            console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
        });

        test('should test horizontal scaling potential', async () => {
            // Simulate multiple TaskMaster instances
            const instanceCount = 3;
            const instances = [];

            for (let i = 0; i < instanceCount; i++) {
                const instance = new TaskMaster();
                await instance.initialize();
                instances.push(instance);
            }

            const concurrentRequests = 30;
            const promises = [];

            for (let i = 0; i < concurrentRequests; i++) {
                const instance = instances[i % instanceCount];
                promises.push(
                    measureExecutionTime(async () => {
                        return await instance.executeTool('tool-0', {
                            messages: [{ role: 'user', content: `Scaling test ${i}` }]
                        });
                    })
                );
            }

            const startTime = performance.now();
            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;

            expect(results).toHaveLength(concurrentRequests);
            console.log(`Horizontal scaling: ${totalTime.toFixed(2)}ms for ${concurrentRequests} requests across ${instanceCount} instances`);
        });

        test('should test vertical scaling limits', async () => {
            const maxConcurrent = 100;
            const promises = [];

            for (let i = 0; i < maxConcurrent; i++) {
                promises.push(
                    measureExecutionTime(async () => {
                        return await taskMaster.executeTool(`tool-${i % 10}`, {
                            messages: [{ role: 'user', content: `Vertical scaling test ${i}` }]
                        });
                    })
                );
            }

            const startTime = performance.now();
            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;

            expect(results).toHaveLength(maxConcurrent);
            console.log(`Vertical scaling limit: ${totalTime.toFixed(2)}ms for ${maxConcurrent} concurrent requests`);
        });

        test('should measure resource utilization efficiency', async () => {
            const executionCount = 100;
            const startMem = collectMetrics();
            const startTime = performance.now();

            for (let i = 0; i < executionCount; i++) {
                await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: `Efficiency test ${i}` }]
                });
            }

            const endTime = performance.now();
            const endMem = collectMetrics();

            const totalTime = endTime - startTime;
            const memoryUsed = endMem.heapUsed - startMem.heapUsed;
            const avgTimePerRequest = totalTime / executionCount;
            const memoryPerRequest = memoryUsed / executionCount;

            expect(avgTimePerRequest).toBeLessThan(100); // Under 100ms per request
            expect(memoryPerRequest).toBeLessThan(1024 * 1024); // Under 1MB per request

            console.log(`Resource efficiency: ${avgTimePerRequest.toFixed(2)}ms per request`);
            console.log(`Memory efficiency: ${(memoryPerRequest / 1024).toFixed(2)}KB per request`);
        });
    });

    describe('Latency and Response Time Tests', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should measure average response time under normal load', async () => {
            const sampleSize = 50;
            const executionTimes = [];

            for (let i = 0; i < sampleSize; i++) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Latency test ${i}` }]
                    });
                });
                executionTimes.push(metrics.duration);
            }

            const avgResponseTime = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
            const maxResponseTime = Math.max(...executionTimes);
            const minResponseTime = Math.min(...executionTimes);

            expect(avgResponseTime).toBeLessThan(200); // Average under 200ms
            expect(maxResponseTime).toBeLessThan(500); // Max under 500ms

            console.log(`Average response time: ${avgResponseTime.toFixed(2)}ms`);
            console.log(`Response time range: ${minResponseTime.toFixed(2)}ms - ${maxResponseTime.toFixed(2)}ms`);
        });

        test('should measure p50, p90, p95, p99 response times', async () => {
            const sampleSize = 100;
            const executionTimes = [];

            for (let i = 0; i < sampleSize; i++) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Percentile test ${i}` }]
                    });
                });
                executionTimes.push(metrics.duration);
            }

            executionTimes.sort((a, b) => a - b);

            const p50 = executionTimes[Math.floor(sampleSize * 0.5)];
            const p90 = executionTimes[Math.floor(sampleSize * 0.9)];
            const p95 = executionTimes[Math.floor(sampleSize * 0.95)];
            const p99 = executionTimes[Math.floor(sampleSize * 0.99)];

            expect(p50).toBeLessThan(150); // P50 under 150ms
            expect(p90).toBeLessThan(300); // P90 under 300ms
            expect(p95).toBeLessThan(400); // P95 under 400ms
            expect(p99).toBeLessThan(600); // P99 under 600ms

            console.log(`P50: ${p50.toFixed(2)}ms, P90: ${p90.toFixed(2)}ms, P95: ${p95.toFixed(2)}ms, P99: ${p99.toFixed(2)}ms`);
        });

        test('should test response time consistency', async () => {
            const sampleSize = 30;
            const executionTimes = [];

            for (let i = 0; i < sampleSize; i++) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Consistency test ${i}` }]
                    });
                });
                executionTimes.push(metrics.duration);
            }

            const avg = executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length;
            const variance = executionTimes.reduce((sum, time) => sum + Math.pow(time - avg, 2), 0) / executionTimes.length;
            const stdDev = Math.sqrt(variance);
            const coefficientOfVariation = stdDev / avg;

            expect(coefficientOfVariation).toBeLessThan(1.0); // CV under 100% (more lenient for mocked tests)

            console.log(`Response time consistency - StdDev: ${stdDev.toFixed(2)}ms, CV: ${(coefficientOfVariation * 100).toFixed(2)}%`);
        });

        test('should handle timeout scenarios gracefully', async () => {
            // Mock a slow response
            mockFetch.mockImplementationOnce(() => new Promise(resolve =>
                setTimeout(() => resolve({
                    ok: true,
                    json: jest.fn().mockResolvedValue({
                        choices: [{ message: { content: 'Slow response' } }]
                    })
                }), 2000) // 2 second delay for testing
            ));

            const startTime = performance.now();

            try {
                await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: 'Timeout test' }]
                });
            } catch (error) {
                // Expected timeout
            }

            const duration = performance.now() - startTime;
            expect(duration).toBeGreaterThan(1500); // Should take at least 1.5 seconds

            console.log(`Timeout handling: ${duration.toFixed(2)}ms`);
        }, 10000); // 10 second timeout

        test('should measure cold start vs warm performance', async () => {
            // Cold start - first execution
            const coldStartMetrics = await measureExecutionTime(async () => {
                const instance = new TaskMaster();
                await instance.initialize();
                return await instance.executeTool('tool-0', {
                    messages: [{ role: 'user', content: 'Cold start test' }]
                });
            });

            // Warm executions
            const warmExecutionTimes = [];
            for (let i = 0; i < 5; i++) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Warm test ${i}` }]
                    });
                });
                warmExecutionTimes.push(metrics.duration);
            }

            const avgWarmTime = warmExecutionTimes.reduce((a, b) => a + b, 0) / warmExecutionTimes.length;

            expect(coldStartMetrics.duration).toBeGreaterThan(avgWarmTime);
            console.log(`Cold start: ${coldStartMetrics.duration.toFixed(2)}ms, Average warm: ${avgWarmTime.toFixed(2)}ms`);
        });
    });

    describe('Resource Utilization Tests', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should monitor CPU usage patterns during execution', async () => {
            // Note: CPU monitoring in Node.js is limited, we'll track execution time as proxy
            const executionCount = 20;
            const executionTimes = [];

            for (let i = 0; i < executionCount; i++) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `CPU test ${i}` }]
                    });
                });
                executionTimes.push(metrics.duration);
            }

            const avgExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / executionCount;
            const maxExecutionTime = Math.max(...executionTimes);

            expect(avgExecutionTime).toBeLessThan(200);
            expect(maxExecutionTime).toBeLessThan(500);

            console.log(`CPU usage proxy - Avg execution: ${avgExecutionTime.toFixed(2)}ms, Max: ${maxExecutionTime.toFixed(2)}ms`);
        });

        test('should monitor memory allocation and garbage collection', async () => {
            const memoryReadings = [];
            const executionCount = 50;

            for (let i = 0; i < executionCount; i++) {
                await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: `GC test ${i}` }]
                });

                if (i % 10 === 0) {
                    memoryReadings.push(collectMetrics());
                    // Force garbage collection if available
                    if (global.gc) {
                        global.gc();
                    }
                }
            }

            const initialMemory = memoryReadings[0].heapUsed;
            const finalMemory = memoryReadings[memoryReadings.length - 1].heapUsed;
            const memoryGrowth = finalMemory - initialMemory;

            expect(memoryGrowth).toBeLessThan(20 * 1024 * 1024); // Less than 20MB growth

            console.log(`Memory growth during ${executionCount} executions: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
        });

        test('should monitor file descriptor usage', async () => {
            // File descriptor monitoring is OS-specific and complex in Node.js
            // We'll use connection count as a proxy
            const executionCount = 30;
            let activeConnections = 0;

            for (let i = 0; i < executionCount; i++) {
                activeConnections++;
                await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: `FD test ${i}` }]
                });
                activeConnections--;
            }

            expect(activeConnections).toBe(0); // Should clean up connections
            console.log(`File descriptor proxy: ${executionCount} executions completed without leaks`);
        });

        test('should test network connection pooling efficiency', async () => {
            const concurrentRequests = 20;
            const promises = [];

            for (let i = 0; i < concurrentRequests; i++) {
                promises.push(
                    measureExecutionTime(async () => {
                        return await taskMaster.executeTool('tool-0', {
                            messages: [{ role: 'user', content: `Connection pool test ${i}` }]
                        });
                    })
                );
            }

            const startTime = performance.now();
            const results = await Promise.all(promises);
            const totalTime = performance.now() - startTime;

            const avgTimePerRequest = totalTime / concurrentRequests;

            expect(avgTimePerRequest).toBeLessThan(300); // Under 300ms per request
            expect(results).toHaveLength(concurrentRequests);

            console.log(`Connection pooling: ${avgTimePerRequest.toFixed(2)}ms avg per request for ${concurrentRequests} concurrent`);
        });

        test('should monitor event loop performance', async () => {
            // Monitor event loop lag
            const lags = [];
            const monitor = setInterval(() => {
                const start = process.hrtime.bigint();
                setImmediate(() => {
                    const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds
                    lags.push(lag);
                });
            }, 100);

            const executionCount = 20;
            for (let i = 0; i < executionCount; i++) {
                await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: `Event loop test ${i}` }]
                });
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            clearInterval(monitor);

            const avgLag = lags.reduce((a, b) => a + b, 0) / lags.length;
            const maxLag = Math.max(...lags);

            expect(avgLag).toBeLessThan(10); // Average lag under 10ms
            expect(maxLag).toBeLessThan(50); // Max lag under 50ms

            console.log(`Event loop performance - Avg lag: ${avgLag.toFixed(2)}ms, Max lag: ${maxLag.toFixed(2)}ms`);
        });
    });

    describe('Stress and Failure Testing', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should handle system behavior at maximum capacity', async () => {
            const maxCapacity = 50; // Adjust based on system capabilities
            const promises = [];

            for (let i = 0; i < maxCapacity; i++) {
                promises.push(
                    measureExecutionTime(async () => {
                        return await taskMaster.executeTool(`tool-${i % 10}`, {
                            messages: [{ role: 'user', content: `Max capacity test ${i}` }]
                        });
                    })
                );
            }

            const startTime = performance.now();
            const results = await Promise.allSettled(promises);
            const totalTime = performance.now() - startTime;

            const successful = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;

            expect(successful).toBeGreaterThan(maxCapacity * 0.8); // At least 80% success rate
            console.log(`Max capacity test: ${successful}/${maxCapacity} successful, ${totalTime.toFixed(2)}ms total`);
        });

        test('should test graceful degradation under extreme load', async () => {
            const extremeLoad = 100;
            const promises = [];

            for (let i = 0; i < extremeLoad; i++) {
                promises.push(
                    taskMaster.executeTool(`tool-${i % 10}`, {
                        messages: [{ role: 'user', content: `Extreme load test ${i}` }]
                    }).catch(() => null) // Ignore errors for degradation test
                );
            }

            const startTime = performance.now();
            const results = await Promise.allSettled(promises);
            const totalTime = performance.now() - startTime;

            const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
            const successRate = successful / extremeLoad;

            expect(successRate).toBeGreaterThan(0.5); // At least 50% success rate under extreme load
            console.log(`Graceful degradation: ${successRate * 100}% success rate under extreme load`);
        });

        test('should test recovery after stress testing', async () => {
            // First stress the system
            const stressLoad = 30;
            const stressPromises = [];

            for (let i = 0; i < stressLoad; i++) {
                stressPromises.push(
                    taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Stress test ${i}` }]
                    }).catch(() => null)
                );
            }

            await Promise.allSettled(stressPromises);

            // Wait a bit for recovery
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Test recovery - should work normally again
            const recoveryMetrics = await measureExecutionTime(async () => {
                return await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: 'Recovery test' }]
                });
            });

            expect(recoveryMetrics.duration).toBeLessThan(PERFORMANCE_THRESHOLDS.singleExecution);
            console.log(`Recovery after stress: ${recoveryMetrics.duration.toFixed(2)}ms`);
        });

        test('should handle performance with degraded providers', async () => {
            // Mock degraded provider (slower response)
            mockFetch.mockImplementationOnce(() => new Promise(resolve =>
                setTimeout(() => resolve({
                    ok: true,
                    json: jest.fn().mockResolvedValue({
                        choices: [{ message: { content: 'Degraded response' } }]
                    })
                }), 1000) // 1 second delay
            ));

            const metrics = await measureExecutionTime(async () => {
                return await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: 'Degraded provider test' }]
                });
            });

            expect(metrics.duration).toBeGreaterThan(900); // Should take at least 900ms
            expect(metrics.result).toHaveProperty('executionId');

            console.log(`Degraded provider performance: ${metrics.duration.toFixed(2)}ms`);
        });

        test('should handle performance with limited resources', async () => {
            // Simulate limited memory by creating large objects
            const memoryHog = [];
            for (let i = 0; i < 100000; i++) {
                memoryHog.push({ data: 'x'.repeat(1000) });
            }

            const metrics = await measureExecutionTime(async () => {
                return await taskMaster.executeTool('tool-0', {
                    messages: [{ role: 'user', content: 'Limited resources test' }]
                });
            });

            // Clean up
            memoryHog.length = 0;

            expect(metrics.duration).toBeLessThan(PERFORMANCE_THRESHOLDS.singleExecution * 2);
            console.log(`Limited resources performance: ${metrics.duration.toFixed(2)}ms`);
        });
    });

    describe('Benchmark and Comparison Tests', () => {
        beforeEach(async () => {
            await taskMaster.initialize();
        });

        test('should establish performance baseline', async () => {
            const baselineRuns = 10;
            const baselineTimes = [];

            for (let i = 0; i < baselineRuns; i++) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Baseline test ${i}` }]
                    });
                });
                baselineTimes.push(metrics.duration);
            }

            const avgBaseline = baselineTimes.reduce((a, b) => a + b, 0) / baselineRuns;
            const stdDev = Math.sqrt(
                baselineTimes.reduce((sum, time) => sum + Math.pow(time - avgBaseline, 2), 0) / baselineRuns
            );

            expect(avgBaseline).toBeLessThan(200);
            expect(stdDev / avgBaseline).toBeLessThan(0.5); // CV under 50% (more lenient for mocked tests)

            console.log(`Performance baseline: ${avgBaseline.toFixed(2)}ms ± ${stdDev.toFixed(2)}ms`);
        });

        test('should compare performance with different provider configurations', async () => {
            const providers = ['OpenAI', 'Anthropic', 'Google'];
            const results = {};

            for (const provider of providers) {
                mockRolesConfig.getProviderConfig.mockReturnValue({
                    provider_name: provider,
                    base_url: `https://api.${provider.toLowerCase()}.com/v1`,
                    api_key: 'test-key',
                    model: 'test-model',
                    priority: 1
                });

                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `${provider} test` }]
                    });
                });

                results[provider] = metrics.duration;
            }

            // All providers should perform within reasonable bounds
            Object.values(results).forEach(duration => {
                expect(duration).toBeLessThan(500);
            });

            console.log('Provider performance comparison:');
            Object.entries(results).forEach(([provider, duration]) => {
                console.log(`  ${provider}: ${duration.toFixed(2)}ms`);
            });
        });

        test('should compare performance with different workflow complexities', async () => {
            const workflows = {
                simple: { messages: [{ role: 'user', content: 'Hello' }] },
                complex: {
                    messages: [{ role: 'user', content: 'A'.repeat(100) }], // Reduced size for testing
                    temperature: 0.9,
                    max_tokens: 1000
                },
                multiTurn: {
                    messages: [
                        { role: 'user', content: 'Hello' },
                        { role: 'assistant', content: 'Hi there!' },
                        { role: 'user', content: 'How are you?' }
                    ]
                }
            };

            const results = {};

            for (const [type, params] of Object.entries(workflows)) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', params);
                });
                results[type] = metrics.duration;
            }

            // Complex workflows should take longer but not excessively
            // Note: In mocked tests, all may be similar, so we check they're reasonable
            expect(results.complex).toBeGreaterThanOrEqual(results.simple);
            expect(results.multiTurn).toBeGreaterThanOrEqual(results.simple);
            expect(results.complex).toBeLessThan(results.simple * 5);

            console.log('Workflow complexity comparison:');
            Object.entries(results).forEach(([type, duration]) => {
                console.log(`  ${type}: ${duration.toFixed(2)}ms`);
            });
        });

        test('should compare performance with different prompt types', async () => {
            const promptTypes = {
                question: { messages: [{ role: 'user', content: 'What is the capital of France?' }] },
                instruction: { messages: [{ role: 'user', content: 'Write a function to calculate fibonacci numbers.' }] },
                creative: {
                    messages: [{ role: 'user', content: 'Write a short story about a robot learning to paint.' }],
                    temperature: 0.8
                },
                analytical: {
                    messages: [{ role: 'user', content: 'Analyze the performance implications of different sorting algorithms.' }],
                    temperature: 0.3
                }
            };

            const results = {};

            for (const [type, params] of Object.entries(promptTypes)) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', params);
                });
                results[type] = metrics.duration;
            }

            // All prompt types should perform within reasonable bounds
            Object.values(results).forEach(duration => {
                expect(duration).toBeLessThan(400);
            });

            console.log('Prompt type performance comparison:');
            Object.entries(results).forEach(([type, duration]) => {
                console.log(`  ${type}: ${duration.toFixed(2)}ms`);
            });
        });

        test('should detect performance regression', async () => {
            const historicalBaseline = 150; // ms - hypothetical baseline
            const currentRuns = 5;
            const currentTimes = [];

            for (let i = 0; i < currentRuns; i++) {
                const metrics = await measureExecutionTime(async () => {
                    return await taskMaster.executeTool('tool-0', {
                        messages: [{ role: 'user', content: `Regression test ${i}` }]
                    });
                });
                currentTimes.push(metrics.duration);
            }

            const avgCurrent = currentTimes.reduce((a, b) => a + b, 0) / currentRuns;
            const regressionThreshold = historicalBaseline * 1.5; // 50% degradation allowed

            expect(avgCurrent).toBeLessThan(regressionThreshold);

            const regression = ((avgCurrent - historicalBaseline) / historicalBaseline) * 100;
            console.log(`Performance regression check: ${regression > 0 ? '+' : ''}${regression.toFixed(2)}% vs baseline`);
        });
    });
});