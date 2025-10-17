# TaskMaster Testing Guide

## Table of Contents
1. [Testing Overview](#testing-overview)
2. [Test Architecture](#test-architecture)
3. [Testing Methodology](#testing-methodology)
4. [Test Categories Detailed](#test-categories-detailed)
5. [Test Execution Guide](#test-execution-guide)
6. [Test Results and Metrics](#test-results-and-metrics)
7. [Troubleshooting and Debugging](#troubleshooting-and-debugging)
8. [Maintenance and Evolution](#maintenance-and-evolution)
9. [Best Practices and Recommendations](#best-practices-and-recommendations)
10. [Appendices](#appendices)

## 1. Testing Overview

### Purpose and Scope of TaskMaster Testing

TaskMaster is a sophisticated AI orchestration system that manages multiple AI providers and enables complex workflow decomposition. The testing suite ensures:

- **Reliability**: Consistent execution across different AI providers
- **Performance**: Efficient resource utilization and response times
- **Scalability**: Ability to handle concurrent requests and large workloads
- **Robustness**: Graceful handling of failures and edge cases
- **Workflow Orchestration**: Proper decomposition and execution of complex tasks

### Testing Philosophy and Approach

Our testing approach follows these core principles:

- **Comprehensive Coverage**: Tests cover unit, integration, performance, and end-to-end scenarios
- **Realistic Scenarios**: Test cases simulate actual usage patterns and edge conditions
- **Automated Execution**: CI/CD integration with automated test execution
- **Performance Benchmarks**: Established baselines for response times and resource usage
- **Failure Simulation**: Comprehensive error handling and recovery testing

### Test Environment Setup and Requirements

#### Prerequisites
- Node.js 16.x or higher
- npm or yarn package manager
- Git for version control
- Access to test AI provider API keys (mock keys for development)

#### Environment Variables
```bash
# Test Configuration
NODE_ENV=test
TEST_MODE=true
LOG_LEVEL=debug

# Mock API Keys (for testing only)
OPENAI_API_KEY=sk-test-openai-key-1234567890abcdef
ANTHROPIC_API_KEY=sk-ant-test-anthropic-key-1234567890abcdef
GOOGLE_API_KEY=AIzaSyTestGoogleKey1234567890abcdef

# Performance Testing
PERFORMANCE_TEST_DURATION=300000  # 5 minutes
CONCURRENT_USERS=50
```

#### Installation
```bash
# Install dependencies
npm install

# Install test dependencies
npm install --save-dev jest supertest sinon chai
```

### Testing Tools and Frameworks Used

#### Primary Testing Framework
- **Jest**: Main testing framework with built-in mocking, assertions, and test runners
- **Supertest**: HTTP endpoint testing for API integration tests
- **Sinon**: Advanced mocking and stubbing capabilities
- **Chai**: Additional assertion library for complex validations

#### Performance Testing Tools
- **Built-in Performance Hooks**: Node.js performance monitoring
- **Custom Metrics Collection**: Memory usage, response times, throughput measurement
- **Load Simulation**: Concurrent request generation and management

#### Code Quality Tools
- **ESLint**: Code linting and style enforcement
- **Coverage Tools**: Istanbul/NYC for code coverage reporting

### Test Coverage and Quality Metrics

#### Coverage Targets
- **Unit Tests**: 90%+ line coverage, 85%+ branch coverage
- **Integration Tests**: 80%+ API endpoint coverage
- **Performance Tests**: 100% critical path coverage
- **Error Scenarios**: 95%+ error condition coverage

#### Quality Metrics
- **Response Time**: P95 < 500ms for single requests
- **Throughput**: 10+ requests/second sustained
- **Memory Usage**: < 100MB per 1000 requests
- **Error Rate**: < 1% under normal conditions
- **Test Execution Time**: < 10 minutes for full suite

## 2. Test Architecture

### Test Directory Structure Explanation

```
tests/
├── unit/                          # Unit tests (isolated components)
│   ├── taskmaster.test.js        # Core TaskMaster functionality
│   ├── provider-selection.test.js # Provider selection logic
│   ├── error-handling.test.js    # Error handling scenarios
│   ├── prompt-types.test.js      # Different prompt type handling
│   ├── provider-manager.test.js  # Provider configuration management
│   └── ...
├── integration/                   # Integration tests (component interaction)
│   ├── taskmaster-workflow.test.js # Workflow orchestration
│   └── api.test.js               # API endpoint integration
├── performance/                   # Performance and load tests
│   └── taskmaster-performance.test.js # Comprehensive performance suite
├── deployment/                    # Deployment-specific tests
│   └── oracle-cloud.test.js      # Cloud deployment validation
├── taskmaster-test-config.js      # Shared test configuration
└── security.test.js              # Security-focused tests
```

### Test Organization and Categorization

#### Test Categories by Scope
- **Unit Tests**: Individual functions, classes, and modules in isolation
- **Integration Tests**: Component interactions and data flow
- **End-to-End Tests**: Complete user workflows and API interactions
- **Performance Tests**: Load, stress, and scalability validation
- **Security Tests**: Authentication, authorization, and vulnerability testing

#### Test Categories by Functionality
- **Initialization Tests**: Configuration loading and setup
- **Provider Tests**: AI provider integration and selection
- **Workflow Tests**: Task decomposition and orchestration
- **Error Tests**: Failure handling and recovery
- **Performance Tests**: Speed, throughput, and resource usage

### Mocking Strategy and Dependencies

#### Mocking Approach
- **External APIs**: Mock all AI provider API calls to ensure consistent, fast testing
- **File System**: Mock file operations for configuration loading
- **Network**: Simulate network failures, timeouts, and latency
- **Database**: Use in-memory databases for state management tests

#### Mock Implementation
```javascript
// Example mock setup in tests
jest.mock('node-fetch', () => jest.fn());
jest.mock('../../rolesConfig');
jest.mock('fs', () => ({
    promises: {
        readFile: jest.fn()
    }
}));
```

### Test Data Management

#### Test Data Sources
- **Static Test Data**: Predefined scenarios in `taskmaster-test-config.js`
- **Dynamic Generation**: Randomized test data for edge cases
- **Mock Responses**: Simulated AI provider responses for different scenarios

#### Data Categories
- **Provider Configurations**: Multiple AI providers with different capabilities
- **Test Scenarios**: Simple, complex, parallel, and sequential workflows
- **Error Conditions**: Rate limits, authentication failures, network issues
- **Performance Data**: Response times, memory usage, throughput metrics

### Test Environment Configuration

#### Configuration Files
- `tests/taskmaster-test-config.js`: Comprehensive test configuration
- `jest.config.js`: Jest testing framework configuration
- Environment-specific configs for different deployment scenarios

#### Environment Setup
```javascript
// Test environment initialization
beforeEach(async () => {
    jest.clearAllMocks();
    // Setup mocks and test data
    await initializeTestEnvironment();
});

afterEach(() => {
    jest.clearAllTimers();
    // Cleanup test artifacts
    cleanupTestEnvironment();
});
```

## 3. Testing Methodology

### Unit Testing Approach and Best Practices

#### Unit Test Structure
```javascript
describe('TaskMaster', () => {
    let taskMaster;
    let mockRolesConfig;

    beforeEach(() => {
        // Setup test fixtures
        mockRolesConfig = { /* mock implementation */ };
        taskMaster = new TaskMaster();
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            // Test implementation
        });
    });
});
```

#### Best Practices
- **Single Responsibility**: Each test focuses on one behavior
- **Descriptive Names**: Clear, descriptive test names
- **Arrange-Act-Assert**: Clear test structure
- **Independent Tests**: No test dependencies or shared state
- **Fast Execution**: Keep unit tests under 100ms each

### Integration Testing Strategy

#### Integration Test Focus
- **Component Interaction**: How modules work together
- **Data Flow**: End-to-end data processing
- **API Contracts**: Interface compliance between components
- **Workflow Execution**: Multi-step process validation

#### Integration Test Example
```javascript
describe('TaskMaster Workflow Integration', () => {
    test('should execute complete workflow from prompt to response', async () => {
        const prompt = 'Analyze this data and generate a report';
        const result = await orchestrator.executeWorkflow(prompt);

        expect(result.workflowId).toBeDefined();
        expect(result.result.finalResult).toBeDefined();
        expect(result.metadata.providersUsed.length).toBeGreaterThan(0);
    });
});
```

### Performance Testing Methodology

#### Performance Test Categories
- **Load Testing**: Sustained load over extended periods
- **Stress Testing**: Maximum capacity and failure points
- **Spike Testing**: Sudden load increases
- **Volume Testing**: Large data sets and high throughput

#### Performance Measurement
```javascript
const measureExecutionTime = async (fn) => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();

    return {
        duration: end - start,
        result
    };
};
```

### Error Handling Testing Approach

#### Error Test Coverage
- **API Failures**: Provider API errors and timeouts
- **Network Issues**: Connection failures and DNS resolution
- **Configuration Errors**: Invalid settings and missing parameters
- **Resource Exhaustion**: Memory limits and rate limiting
- **Data Validation**: Malformed inputs and edge cases

#### Error Testing Pattern
```javascript
test('should handle API failures gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('API call failed'));

    await expect(taskMaster.executeTool('gpt-4', { messages: [] }))
        .rejects.toThrow('API call failed');
});
```

### Continuous Integration Practices

#### CI/CD Integration
- **Automated Test Execution**: Run tests on every commit
- **Parallel Test Execution**: Distribute tests across multiple runners
- **Test Result Reporting**: Detailed reports with coverage metrics
- **Failure Notifications**: Alert on test failures or performance regressions

#### CI Configuration Example
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm ci
      - run: npm run test:coverage
      - run: npm run lint
```

## 4. Test Categories Detailed

### Unit Tests: Initialization, Tool Registration, Provider Selection

#### Initialization Tests
- **Configuration Loading**: Valid and invalid config files
- **Dependency Injection**: Proper setup of required components
- **Event Emission**: Correct initialization event firing
- **Error Recovery**: Graceful handling of initialization failures

#### Tool Registration Tests
- **Tool Validation**: Parameter schema validation
- **Duplicate Handling**: Overwriting existing tools
- **Metadata Tracking**: Call counts and usage statistics
- **Capability Mapping**: Tool capabilities and requirements

#### Provider Selection Tests
- **Priority-Based Selection**: Highest priority provider selection
- **Capability Matching**: Provider capability requirements
- **Load Balancing**: Distribution across multiple providers
- **Fallback Logic**: Automatic failover to backup providers

### Integration Tests: Workflow Orchestration, Subtask Decomposition

#### Workflow Orchestration Tests
- **Simple Workflows**: Single-step task execution
- **Sequential Workflows**: Ordered multi-step execution
- **Parallel Workflows**: Concurrent task execution
- **Mixed Workflows**: Combination of sequential and parallel tasks

#### Subtask Decomposition Tests
- **Prompt Analysis**: Automatic complexity detection
- **Task Breakdown**: Logical decomposition into subtasks
- **Dependency Resolution**: Correct task ordering and prerequisites
- **Resource Allocation**: Appropriate provider assignment

### Performance Tests: Load, Throughput, Latency, Resource Utilization

#### Load Testing
- **Sustained Load**: Extended periods of constant load
- **Gradual Load Increase**: Ramp-up testing scenarios
- **Peak Load**: Maximum concurrent request handling
- **Recovery Testing**: System behavior after load removal

#### Throughput Testing
- **Requests Per Second**: Maximum RPS measurement
- **Concurrent Users**: Multi-user scenario simulation
- **Data Throughput**: Large payload processing
- **Batch Processing**: Multiple request batching

#### Latency Testing
- **Response Time Distribution**: P50, P90, P95, P99 measurements
- **Cold Start vs Warm**: Initial request vs subsequent requests
- **Network Latency**: External dependency impact
- **Processing Latency**: Internal computation time

#### Resource Utilization Testing
- **Memory Usage**: Heap usage and garbage collection
- **CPU Usage**: Processing load and efficiency
- **Network I/O**: Bandwidth consumption
- **Disk I/O**: File system operations

### Error Handling Tests: API Errors, Network Errors, Configuration Errors

#### API Error Tests
- **Rate Limiting**: Provider rate limit handling
- **Authentication Failures**: Invalid API key scenarios
- **Model Not Found**: Unsupported model requests
- **Server Errors**: 5xx status code handling

#### Network Error Tests
- **Connection Refused**: Provider service unavailable
- **Timeout Handling**: Request timeout scenarios
- **DNS Failures**: Domain resolution issues
- **SSL/TLS Errors**: Certificate validation failures

#### Configuration Error Tests
- **Missing Parameters**: Required field validation
- **Invalid Formats**: Data type and format checking
- **Provider Misconfiguration**: Incorrect provider settings
- **Environment Variables**: Missing or invalid env vars

### Prompt Type Tests: Various Prompt Categories and Scenarios

#### Prompt Categories
- **Simple Prompts**: Basic questions and statements
- **Complex Prompts**: Multi-step instructions and analysis
- **Creative Prompts**: Open-ended creative tasks
- **Technical Prompts**: Code generation and technical tasks

#### Scenario Testing
- **Edge Cases**: Empty prompts, very long prompts, special characters
- **Multilingual Content**: Non-English language support
- **Structured Input**: JSON, XML, and formatted data
- **Contextual Prompts**: Conversation history and context

## 5. Test Execution Guide

### Running Individual Test Suites

#### Unit Tests
```bash
# Run all unit tests
npm test -- tests/unit/

# Run specific unit test file
npm test -- tests/unit/taskmaster.test.js

# Run specific test within a file
npm test -- tests/unit/taskmaster.test.js -t "should initialize successfully"
```

#### Integration Tests
```bash
# Run all integration tests
npm test -- tests/integration/

# Run workflow integration tests
npm test -- tests/integration/taskmaster-workflow.test.js
```

#### Performance Tests
```bash
# Run performance tests with extended timeout
npm test -- tests/performance/taskmaster-performance.test.js --testTimeout=60000

# Run specific performance test
npm test -- tests/performance/ -t "should handle 50 concurrent executions"
```

### Running All Tests Together

#### Complete Test Suite
```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

#### Parallel Execution
```bash
# Run tests in parallel (if configured)
npm test -- --maxWorkers=4

# Run tests with bail on first failure
npm test -- --bail
```

### Test Configuration and Environment Variables

#### Jest Configuration
```javascript
// jest.config.js
module.exports = {
    testEnvironment: 'node',
    collectCoverageFrom: [
        '**/*.js',
        '!node_modules/**',
        '!coverage/**',
        '!tests/**'
    ],
    coverageReporters: ['text', 'lcov', 'html'],
    testTimeout: 10000,
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
```

#### Environment Variables
```bash
# Test environment
NODE_ENV=test
TEST_MODE=true
LOG_LEVEL=debug

# Performance tuning
JEST_WORKERS=4
TEST_TIMEOUT=30000

# Coverage settings
COVERAGE_THRESHOLD=80
```

### Test Timeout and Retry Settings

#### Timeout Configuration
```javascript
// Test-level timeouts
test('slow operation', async () => {
    // ... test code
}, 30000); // 30 second timeout

// Suite-level timeouts
describe('Slow Tests', () => {
    beforeAll(async () => {
        jest.setTimeout(60000); // 1 minute
    });
    // ... tests
});
```

#### Retry Configuration
```javascript
// Retry flaky tests
jest.retryTimes(3);

// Conditional retry based on error type
const retryOnNetworkError = (error) => {
    return error.code === 'NETWORK_ERROR';
};
```

### Test Reporting and Logging

#### Test Output
```bash
# Verbose output
npm test -- --verbose

# JSON output for CI/CD
npm test -- --json --outputFile=test-results.json

# Coverage reporting
npm run test:coverage
```

#### Custom Reporting
```javascript
// Custom test reporter
class CustomReporter {
    onTestResult(test, testResult) {
        console.log(`Test ${testResult.title} completed in ${testResult.duration}ms`);
    }
}
```

## 6. Test Results and Metrics

### Test Success Criteria and Thresholds

#### Success Criteria
- **Unit Tests**: All tests pass, coverage > 90%
- **Integration Tests**: All workflows complete successfully
- **Performance Tests**: Meet established performance baselines
- **Error Tests**: Proper error handling and recovery

#### Threshold Definitions
```javascript
const PERFORMANCE_THRESHOLDS = {
    initialization: 100,      // Max 100ms
    singleExecution: 200,     // Max 200ms
    concurrentExecution: 1000, // Max 1000ms
    memoryUsage: 50 * 1024 * 1024, // Max 50MB
    errorRate: 0.01          // Max 1% error rate
};
```

### Performance Benchmarks and Baselines

#### Baseline Establishment
```javascript
// Performance baseline measurement
const establishBaseline = async () => {
    const samples = [];
    for (let i = 0; i < 100; i++) {
        const metrics = await measureExecutionTime(() =>
            taskMaster.executeTool('gpt-4', { messages: [{ role: 'user', content: 'test' }] })
        );
        samples.push(metrics.duration);
    }

    const baseline = {
        p50: percentile(samples, 50),
        p90: percentile(samples, 90),
        p95: percentile(samples, 95),
        p99: percentile(samples, 99)
    };

    return baseline;
};
```

#### Benchmark Categories
- **Cold Start**: Initial request performance
- **Warm Execution**: Subsequent request performance
- **Concurrent Load**: Multi-request performance
- **Peak Load**: Maximum capacity performance

### Error Rate Monitoring and Alerting

#### Error Rate Calculation
```javascript
const calculateErrorRate = (results) => {
    const total = results.length;
    const errors = results.filter(r => r.status === 'rejected').length;
    return errors / total;
};

// Alert thresholds
const ERROR_THRESHOLDS = {
    warning: 0.05,  // 5% error rate
    critical: 0.10  // 10% error rate
};
```

#### Alerting Configuration
```javascript
const checkErrorThresholds = (errorRate) => {
    if (errorRate > ERROR_THRESHOLDS.critical) {
        alert('CRITICAL: Error rate exceeded 10%');
    } else if (errorRate > ERROR_THRESHOLDS.warning) {
        alert('WARNING: Error rate exceeded 5%');
    }
};
```

### Resource Usage Metrics

#### Memory Monitoring
```javascript
const collectMemoryMetrics = () => {
    const memUsage = process.memoryUsage();
    return {
        rss: memUsage.rss,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        timestamp: Date.now()
    };
};
```

#### CPU Monitoring
```javascript
const collectCpuMetrics = () => {
    const cpus = os.cpus();
    return cpus.map(cpu => ({
        times: cpu.times,
        speed: cpu.speed
    }));
};
```

### Test Execution Time Analysis

#### Execution Time Tracking
```javascript
const trackExecutionTime = async (testFn, testName) => {
    const start = process.hrtime.bigint();
    const result = await testFn();
    const end = process.hrtime.bigint();

    const duration = Number(end - start) / 1e6; // Convert to milliseconds

    console.log(`${testName}: ${duration.toFixed(2)}ms`);
    return { result, duration };
};
```

#### Performance Trending
```javascript
const analyzePerformanceTrend = (historicalData) => {
    const recent = historicalData.slice(-10); // Last 10 runs
    const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
    const avgHistorical = historicalData.reduce((a, b) => a + b, 0) / historicalData.length;

    const trend = ((avgRecent - avgHistorical) / avgHistorical) * 100;
    return {
        trend,
        direction: trend > 0 ? 'slower' : 'faster',
        significance: Math.abs(trend) > 5 ? 'significant' : 'minor'
    };
};
```

## 7. Troubleshooting and Debugging

### Common Test Failures and Solutions

#### Test Timeout Issues
**Problem**: Tests exceed timeout limits
**Solutions**:
- Increase timeout for slow operations: `jest.setTimeout(60000)`
- Optimize test setup and teardown
- Mock slow external dependencies
- Run tests in isolation to identify bottlenecks

#### Mocking Problems
**Problem**: Mocks not working as expected
**Solutions**:
- Clear mocks between tests: `jest.clearAllMocks()`
- Use proper mock implementations
- Verify mock calls: `expect(mockFn).toHaveBeenCalledWith(...)`
- Check mock setup order in `beforeEach`

#### Async Test Issues
**Problem**: Async operations not completing
**Solutions**:
- Always await async operations
- Use `done` callback for non-promise async tests
- Ensure proper error handling in async tests
- Check for unhandled promise rejections

### Debugging Test Failures

#### Debugging Techniques
```javascript
// Add debugging logs
test('debugging example', async () => {
    console.log('Starting test...');
    const result = await someOperation();
    console.log('Result:', result);
    expect(result).toBeDefined();
});

// Use debugger
test('debug with breakpoint', () => {
    debugger; // Will pause execution in debug mode
    const result = someFunction();
    expect(result).toBe('expected');
});
```

#### Debug Configuration
```javascript
// jest.config.js debug settings
module.exports = {
    // ... other config
    verbose: true,
    detectOpenHandles: true,
    forceExit: true,
    testTimeout: 10000
};
```

### Performance Bottleneck Identification

#### Profiling Tests
```javascript
const profileTest = async (testFn) => {
    console.time('test-execution');
    const startMem = process.memoryUsage();

    await testFn();

    const endMem = process.memoryUsage();
    console.timeEnd('test-execution');

    console.log('Memory delta:', endMem.heapUsed - startMem.heapUsed);
};
```

#### Common Bottlenecks
- **Memory Leaks**: Accumulating objects not garbage collected
- **Inefficient Algorithms**: O(n²) operations on large datasets
- **Blocking Operations**: Synchronous I/O in async contexts
- **Resource Contention**: Multiple tests competing for resources

### Memory Leak Detection

#### Memory Leak Testing
```javascript
test('should not leak memory', async () => {
    const initialMem = collectMetrics();

    // Perform memory-intensive operations
    for (let i = 0; i < 1000; i++) {
        await taskMaster.executeTool('tool-0', {
            messages: [{ role: 'user', content: `test ${i}` }]
        });
    }

    const finalMem = collectMetrics();
    const memoryGrowth = finalMem.heapUsed - initialMem.heapUsed;

    expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth
});
```

#### Leak Detection Tools
- **Heap Snapshots**: Capture memory usage at different points
- **Garbage Collection**: Force GC between measurements
- **Object Tracking**: Monitor object creation and cleanup
- **Profiling Tools**: Chrome DevTools memory profiler

### Test Environment Issues

#### Environment Setup Problems
**Common Issues**:
- Missing environment variables
- Incorrect Node.js version
- Dependency conflicts
- File permission issues

**Solutions**:
```bash
# Check environment
node --version
npm --version

# Clean install
rm -rf node_modules package-lock.json
npm install

# Verify environment variables
echo $NODE_ENV
echo $TEST_MODE
```

#### CI/CD Environment Issues
- **Resource Limits**: Memory/CPU constraints in containers
- **Network Restrictions**: Firewall blocking external APIs
- **Disk Space**: Insufficient space for test artifacts
- **Concurrent Jobs**: Resource contention between jobs

## 8. Maintenance and Evolution

### Adding New Tests

#### Test Creation Guidelines
1. **Identify Test Scope**: Unit, integration, or performance test
2. **Define Test Cases**: Clear acceptance criteria
3. **Setup Test Data**: Mock data and fixtures
4. **Implement Test Logic**: Arrange, Act, Assert pattern
5. **Add Documentation**: Clear test descriptions and comments

#### New Test Template
```javascript
describe('New Feature', () => {
    describe('Specific Functionality', () => {
        test('should perform expected behavior', async () => {
            // Arrange
            const input = 'test input';
            const expected = 'expected output';

            // Act
            const result = await newFeature.process(input);

            // Assert
            expect(result).toBe(expected);
        });
    });
});
```

### Updating Existing Tests

#### Test Update Process
1. **Analyze Changes**: Understand what functionality changed
2. **Update Test Cases**: Modify tests to match new behavior
3. **Maintain Coverage**: Ensure coverage doesn't decrease
4. **Update Mocks**: Adjust mocks for API changes
5. **Run Regression Tests**: Verify no existing functionality broken

#### Refactoring Tests
```javascript
// Before: Monolithic test
test('should handle complex scenario', async () => {
    // 50+ lines of setup, execution, and assertions
});

// After: Focused tests
describe('Complex Scenario', () => {
    test('should validate input', () => { /* focused test */ });
    test('should process data', () => { /* focused test */ });
    test('should return correct result', () => { /* focused test */ });
});
```

### Test Refactoring Guidelines

#### Code Smell Indicators
- **Long Tests**: Tests longer than 20 lines
- **Multiple Assertions**: More than 3-5 assertions per test
- **Complex Setup**: Extensive beforeEach/afterEach blocks
- **Duplicate Code**: Repeated test patterns
- **Brittle Tests**: Tests that fail on minor changes

#### Refactoring Techniques
- **Extract Helper Functions**: Common setup code
- **Use Test Fixtures**: Shared test data
- **Parameterize Tests**: Test multiple scenarios with one test
- **Custom Matchers**: Domain-specific assertions

### Test Data Management

#### Test Data Organization
```
tests/
├── fixtures/           # Static test data
│   ├── providers.json
│   └── responses.json
├── generators/         # Dynamic data generators
│   └── testDataGenerator.js
└── mocks/             # Mock implementations
    ├── apiResponses.js
    └── errorScenarios.js
```

#### Data Generation Strategies
```javascript
// Factory pattern for test data
const createTestProvider = (overrides = {}) => ({
    name: 'TestProvider',
    baseUrl: 'https://api.test.com',
    models: [],
    priority: 1,
    ...overrides
});

// Randomized test data
const generateRandomPrompt = () => {
    const prompts = [
        'Hello world',
        'Analyze this data',
        'Generate a report',
        'Solve this problem'
    ];
    return prompts[Math.floor(Math.random() * prompts.length)];
};
```

### Test Documentation Updates

#### Documentation Standards
- **Test Descriptions**: Clear, descriptive test names
- **Code Comments**: Explain complex test logic
- **README Updates**: Document new test categories
- **API Documentation**: Update for new test endpoints

#### Documentation Template
```javascript
/**
 * Tests for TaskMaster workflow orchestration
 *
 * @description
 * This test suite validates the workflow orchestration capabilities
 * including task decomposition, parallel execution, and error handling.
 *
 * @test-categories integration, workflow
 * @performance-baseline p95 < 1000ms
 * @coverage-target 85%
 */
describe('TaskMaster Workflow Orchestration', () => {
    // ... tests
});
```

## 9. Best Practices and Recommendations

### Test Writing Guidelines

#### Test Structure Best Practices
```javascript
describe('Feature Name', () => {
    describe('Specific Behavior', () => {
        test('should produce expected result when given valid input', async () => {
            // Given: Clear setup
            const input = createValidInput();

            // When: Action performed
            const result = await performAction(input);

            // Then: Assertions
            expect(result).toMatchExpectedOutput();
        });
    });
});
```

#### Naming Conventions
- **Test Files**: `feature.test.js` or `feature.spec.js`
- **Test Names**: `should ${expected behavior} when ${condition}`
- **Describe Blocks**: Feature or component names
- **Mock Names**: `mock${DependencyName}`

### Code Coverage Targets

#### Coverage Goals
- **Statement Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Function Coverage**: > 95%
- **Line Coverage**: > 90%

#### Coverage Configuration
```javascript
// jest.config.js
module.exports = {
    collectCoverageFrom: [
        '**/*.js',
        '!node_modules/**',
        '!tests/**',
        '!coverage/**'
    ],
    coverageThreshold: {
        global: {
            statements: 90,
            branches: 85,
            functions: 95,
            lines: 90
        }
    }
};
```

### Performance Optimization Tips

#### Test Performance Optimization
- **Parallel Execution**: Run tests concurrently
- **Selective Testing**: Run only affected tests in development
- **Mock Heavy Operations**: Avoid real API calls in unit tests
- **Shared Setup**: Use beforeAll for expensive setup

#### Code Optimization
```javascript
// Optimize test setup
let sharedResource;

beforeAll(async () => {
    sharedResource = await expensiveSetup(); // Run once
});

beforeEach(() => {
    // Reset state quickly
    resetSharedResource(sharedResource);
});
```

### Error Handling Best Practices

#### Comprehensive Error Testing
```javascript
describe('Error Handling', () => {
    test('should handle network failures', async () => {
        mockFetch.mockRejectedValue(new Error('Network Error'));

        await expect(operation()).rejects.toThrow('Network Error');
    });

    test('should handle invalid input', () => {
        expect(() => validateInput(null)).toThrow('Invalid input');
    });

    test('should recover from transient failures', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('Temporary failure'))
            .mockResolvedValueOnce({ ok: true, json: () => ({ success: true }) });

        const result = await retryOperation();
        expect(result.success).toBe(true);
    });
});
```

### Continuous Improvement Strategies

#### Test Quality Metrics
- **Flakiness Rate**: Tests that fail intermittently
- **Maintenance Burden**: Time spent fixing tests
- **Debugging Time**: Time to diagnose test failures
- **CI/CD Pipeline Time**: Impact on deployment speed

#### Improvement Process
1. **Regular Review**: Monthly test suite assessment
2. **Performance Monitoring**: Track test execution times
3. **Failure Analysis**: Root cause analysis of test failures
4. **Refactoring**: Continuous test code improvement
5. **Training**: Team education on testing best practices

## 10. Appendices

### Test Configuration Examples

#### Jest Configuration
```javascript
// jest.config.js
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/index.js',
        '!src/cli.js'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testTimeout: 10000,
    maxWorkers: '50%',
    detectOpenHandles: true,
    forceExit: true
};
```

#### Test Setup File
```javascript
// tests/setup.js
const { jest } = require('@jest/globals');

// Global test setup
beforeAll(() => {
    // Configure test environment
    process.env.NODE_ENV = 'test';
});

// Global test teardown
afterAll(() => {
    // Cleanup
});

// Custom matchers
expect.extend({
    toBeValidProvider(received) {
        const pass = received &&
            typeof received.name === 'string' &&
            typeof received.baseUrl === 'string';
        return {
            message: () => `expected ${received} to be a valid provider`,
            pass
        };
    }
});
```

### Mock Data Samples

#### Provider Configuration Mock
```javascript
const mockProviders = [
    {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        models: [
            {
                name: 'gpt-4',
                capabilities: ['text-generation', 'reasoning'],
                contextWindow: 8192,
                maxTokens: 4096
            }
        ],
        priority: 1,
        rateLimit: { requests: 100, period: '1m' }
    },
    {
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        models: [
            {
                name: 'claude-3-opus-20240229',
                capabilities: ['text-generation', 'reasoning'],
                contextWindow: 200000,
                maxTokens: 4096
            }
        ],
        priority: 2,
        rateLimit: { requests: 50, period: '1m' }
    }
];
```

#### API Response Mocks
```javascript
const mockApiResponses = {
    success: {
        status: 200,
        data: {
            choices: [{
                message: {
                    content: 'This is a mock response from the AI model'
                }
            }],
            usage: {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30
            }
        }
    },
    rateLimit: {
        status: 429,
        data: {
            error: {
                type: 'rate_limit_exceeded',
                message: 'Rate limit exceeded. Please try again later.'
            }
        }
    },
    serverError: {
        status: 500,
        data: {
            error: {
                type: 'internal_server_error',
                message: 'The server encountered an internal error.'
            }
        }
    }
};
```

### Test Command Reference

#### Basic Test Commands
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/unit/taskmaster.test.js

# Run tests matching pattern
npm test -- --testNamePattern="initialization"

# Run tests in verbose mode
npm test -- --verbose
```

#### Advanced Test Commands
```bash
# Run tests in parallel
npm test -- --maxWorkers=4

# Run tests with custom configuration
npm test -- --config jest.config.ci.js

# Generate coverage report
npm test -- --coverage --coverageDirectory=./reports/coverage

# Run tests with debugging
npm test -- --inspect-brk

# Run performance tests only
npm test -- tests/performance/

# Run tests with custom timeout
npm test -- --testTimeout=60000
```

### Troubleshooting Checklist

#### Test Execution Issues
- [ ] Node.js version compatible (16.x+)
- [ ] Dependencies installed (`npm install`)
- [ ] Environment variables set
- [ ] Test database available (if needed)
- [ ] External services mocked
- [ ] File permissions correct
- [ ] Port conflicts resolved

#### Performance Issues
- [ ] Memory usage within limits
- [ ] CPU usage not excessive
- [ ] Network connectivity stable
- [ ] External API responses fast
- [ ] Database queries optimized
- [ ] Cache properly configured

#### Coverage Issues
- [ ] All source files included
- [ ] Test files excluded from coverage
- [ ] Coverage thresholds appropriate
- [ ] Istanbul configuration correct
- [ ] Source maps generated

#### CI/CD Issues
- [ ] Build environment matches local
- [ ] Secrets and credentials configured
- [ ] Artifact upload working
- [ ] Test results properly reported
- [ ] Notification systems configured

### Additional Resources and References

#### Documentation Links
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Node.js Testing Best Practices](https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/)
- [JavaScript Testing Fundamentals](https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing/Cross_browser_testing/JavaScript)

#### Tools and Libraries
- **Testing Frameworks**: Jest, Mocha, Jasmine
- **Assertion Libraries**: Chai, Should.js
- **Mocking Libraries**: Sinon.js, testdouble.js
- **Coverage Tools**: Istanbul, NYC
- **Performance Tools**: Artillery, k6

#### Community Resources
- **GitHub Issues**: Report bugs and request features
- **Stack Overflow**: Get help with specific testing problems
- **Testing Blogs**: Martin Fowler, Kent C. Dodds, Testing Library
- **Conferences**: JSConf, Node.js Interactive, TestConf

#### Internal Resources
- **Team Wiki**: Internal testing guidelines and conventions
- **Code Review Checklist**: Testing requirements for PRs
- **Performance Dashboard**: Real-time test metrics and trends
- **Incident Response**: Procedures for test suite failures

---

*This testing guide is maintained by the TaskMaster development team. For questions or contributions, please refer to the project documentation or create an issue in the repository.*