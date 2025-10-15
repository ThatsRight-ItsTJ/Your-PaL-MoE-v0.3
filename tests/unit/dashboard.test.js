/**
 * Dashboard Component Unit Tests
 * Tests for monitoring dashboard functionality
 */

const expect = require('expect');
const sinon = require('sinon');
const DashboardServer = require('../../dashboard/server');
const DashboardRoutes = require('../../dashboard/routes');
const DashboardController = require('../../dashboard/controllers');
const DashboardAuth = require('../../dashboard/auth');
const logger = require('../../utils/logger');

describe('Dashboard Component', () => {
    let dashboardServer;
    let dashboardRoutes;
    let dashboardController;
    let dashboardAuth;
    let mockModelTracker;
    let mockHealthMonitor;
    let mockCacheManager;
    let mockRateLimiter;

    beforeEach(() => {
        // Mock dependencies
        mockModelTracker = {
            providerManager: {
                getFilteredProviders: sinon.stub().returns([
                    { name: 'openai', base_url: 'https://api.openai.com' },
                    { name: 'anthropic', base_url: 'https://api.anthropic.com' }
                ])
            },
            getAllModels: sinon.stub().returns([
                { id: 'gpt-4', provider: 'openai', status: 'available' },
                { id: 'claude-3', provider: 'anthropic', status: 'available' }
            ]),
            getModelsByProvider: sinon.stub().returns([])
        };

        mockHealthMonitor = {
            getHealthSummary: sinon.stub().returns({
                providers: { total: 2, healthy: 1, unhealthy: 1 },
                models: { total: 2, available: 1, unavailable: 1 }
            }),
            getProviderHealth: sinon.stub().returns({
                status: 'healthy',
                responseTime: 150
            }),
            getModelHealth: sinon.stub().returns({
                status: 'available'
            })
        };

        mockCacheManager = {
            getHitRate: sinon.stub().returns(87.3),
            getSize: sinon.stub().returns(1540)
        };

        mockRateLimiter = {};

        // Initialize components
        dashboardController = new DashboardController({
            modelTracker: mockModelTracker,
            healthMonitor: mockHealthMonitor,
            cacheManager: mockCacheManager,
            rateLimiter: mockRateLimiter
        });

        dashboardRoutes = new DashboardRoutes();

        dashboardAuth = new DashboardAuth({
            users: {
                admin: 'admin123',
                viewer: 'viewer123'
            }
        });

        dashboardServer = new DashboardServer({
            port: 3002, // Use different port for tests
            authEnabled: false // Disable auth for tests
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('DashboardController', () => {
        describe('aggregateSystemMetrics', () => {
            it('should aggregate system metrics correctly', () => {
                const metrics = dashboardController.aggregateSystemMetrics();

                expect(metrics).to.have.property('timestamp');
                expect(metrics).to.have.property('system');
                expect(metrics).to.have.property('requests');
                expect(metrics).to.have.property('performance');
                expect(metrics).to.have.property('health');
            });

            it('should cache metrics data', () => {
                const metrics1 = dashboardController.aggregateSystemMetrics();
                const metrics2 = dashboardController.aggregateSystemMetrics();

                expect(metrics1).to.equal(metrics2); // Should return cached data
            });
        });

        describe('aggregateProviderData', () => {
            it('should aggregate provider data with health status', () => {
                const providers = dashboardController.aggregateProviderData();

                expect(providers).to.be.an('array');
                expect(providers).to.have.length.greaterThan(0);

                const provider = providers[0];
                expect(provider).to.have.property('name');
                expect(provider).to.have.property('health');
                expect(provider).to.have.property('metrics');
            });
        });

        describe('aggregateModelData', () => {
            it('should aggregate model data with health status', () => {
                const models = dashboardController.aggregateModelData();

                expect(models).to.be.an('array');
                expect(models).to.have.length.greaterThan(0);

                const model = models[0];
                expect(model).to.have.property('id');
                expect(model).to.have.property('provider');
                expect(model).to.have.property('health');
                expect(model).to.have.property('metrics');
            });
        });

        describe('generateAlerts', () => {
            it('should generate alerts based on system state', () => {
                const alerts = dashboardController.generateAlerts();

                expect(alerts).to.be.an('array');
                // Should generate alerts for unhealthy providers
            });

            it('should cache alert data', () => {
                const alerts1 = dashboardController.generateAlerts();
                const alerts2 = dashboardController.generateAlerts();

                expect(alerts1).to.equal(alerts2);
            });
        });

        describe('getDashboardSummary', () => {
            it('should provide comprehensive dashboard summary', () => {
                const summary = dashboardController.getDashboardSummary();

                expect(summary).to.have.property('timestamp');
                expect(summary).to.have.property('system');
                expect(summary).to.have.property('metrics');
                expect(summary).to.have.property('counts');
                expect(summary).to.have.property('recentAlerts');
            });
        });
    });

    describe('DashboardRoutes', () => {
        let mockReq;
        let mockRes;

        beforeEach(() => {
            mockReq = {
                params: {},
                query: {},
                body: {},
                user: { username: 'admin', role: 'admin', permissions: ['read', 'write'] }
            };

            mockRes = {
                json: sinon.spy(),
                status: sinon.stub().returns({ json: sinon.spy() }),
                sendFile: sinon.spy()
            };
        });

        describe('getSystemStatus', () => {
            it('should return system status information', () => {
                dashboardRoutes.getSystemStatus(mockReq, mockRes);

                expect(mockRes.json.calledOnce).to.be.true;
                const status = mockRes.json.firstCall.args[0];

                expect(status).to.have.property('uptime');
                expect(status).to.have.property('memory');
                expect(status).to.have.property('version');
                expect(status).to.have.property('platform');
            });
        });

        describe('getMetrics', () => {
            it('should return metrics data', () => {
                dashboardRoutes.getMetrics(mockReq, mockRes);

                expect(mockRes.json.calledOnce).to.be.true;
            });
        });

        describe('getProviders', () => {
            it('should return providers list', () => {
                dashboardRoutes.getProviders(mockReq, mockRes);

                expect(mockRes.json.calledOnce).to.be.true;
                const response = mockRes.json.firstCall.args[0];

                expect(response).to.have.property('providers');
                expect(response.providers).to.be.an('array');
            });
        });

        describe('getModels', () => {
            it('should return models list', () => {
                dashboardRoutes.getModels(mockReq, mockRes);

                expect(mockRes.json.calledOnce).to.be.true;
                const response = mockRes.json.firstCall.args[0];

                expect(response).to.have.property('models');
                expect(response.models).to.be.an('array');
            });
        });

        describe('getAlerts', () => {
            it('should return alerts list', () => {
                dashboardRoutes.getAlerts(mockReq, mockRes);

                expect(mockRes.json.calledOnce).to.be.true;
                const response = mockRes.json.firstCall.args[0];

                expect(response).to.have.property('alerts');
                expect(response.alerts).to.be.an('array');
            });
        });
    });

    describe('DashboardAuth', () => {
        describe('authenticate', () => {
            it('should authenticate valid user', () => {
                const result = dashboardAuth.authenticate('admin', 'admin123');

                expect(result).to.not.be.null;
                expect(result).to.have.property('token');
                expect(result).to.have.property('username', 'admin');
                expect(result).to.have.property('role', 'admin');
                expect(result.permissions).to.include('admin');
            });

            it('should reject invalid password', () => {
                const result = dashboardAuth.authenticate('admin', 'wrongpassword');

                expect(result).to.be.null;
            });

            it('should reject unknown user', () => {
                const result = dashboardAuth.authenticate('unknown', 'password');

                expect(result).to.be.null;
            });
        });

        describe('validateSession', () => {
            let token;

            beforeEach(() => {
                const auth = dashboardAuth.authenticate('admin', 'admin123');
                token = auth.token;
            });

            it('should validate active session', () => {
                const result = dashboardAuth.validateSession(token);

                expect(result).to.not.be.null;
                expect(result).to.have.property('username', 'admin');
                expect(result).to.have.property('role', 'admin');
            });

            it('should reject invalid token', () => {
                const result = dashboardAuth.validateSession('invalid-token');

                expect(result).to.be.null;
            });
        });

        describe('hasPermission', () => {
            it('should check user permissions correctly', () => {
                const user = { username: 'admin', role: 'admin', permissions: ['read', 'write', 'admin'] };

                expect(dashboardAuth.hasPermission(user, 'read')).to.be.true;
                expect(dashboardAuth.hasPermission(user, 'admin')).to.be.true;
                expect(dashboardAuth.hasPermission(user, 'delete')).to.be.true; // admin has all permissions
            });

            it('should reject insufficient permissions', () => {
                const user = { username: 'viewer', role: 'viewer', permissions: ['read'] };

                expect(dashboardAuth.hasPermission(user, 'read')).to.be.true;
                expect(dashboardAuth.hasPermission(user, 'write')).to.be.false;
                expect(dashboardAuth.hasPermission(user, 'admin')).to.be.false;
            });
        });

        describe('user management', () => {
            it('should add new user', () => {
                const result = dashboardAuth.addUser('testuser', 'password123', 'viewer');

                expect(result).to.have.property('username', 'testuser');
                expect(result).to.have.property('role', 'viewer');
            });

            it('should reject duplicate user', () => {
                expect(() => {
                    dashboardAuth.addUser('admin', 'password123', 'viewer');
                }).to.throw('User admin already exists');
            });

            it('should update user', () => {
                dashboardAuth.addUser('testuser', 'password123', 'viewer');
                const result = dashboardAuth.updateUser('testuser', { role: 'operator' });

                expect(result).to.have.property('username', 'testuser');
                expect(result).to.have.property('role', 'operator');
            });

            it('should delete user', () => {
                dashboardAuth.addUser('testuser', 'password123', 'viewer');
                const result = dashboardAuth.deleteUser('testuser');

                expect(result).to.be.true;
                expect(dashboardAuth.getUser('testuser')).to.be.null;
            });
        });

        describe('role management', () => {
            it('should return role definitions', () => {
                const roles = dashboardAuth.getAllRoles();

                expect(roles).to.be.an('array');
                expect(roles).to.have.length.greaterThan(0);

                const adminRole = roles.find(r => r.name === 'admin');
                expect(adminRole).to.have.property('permissions');
                expect(adminRole.permissions).to.include('admin');
            });

            it('should validate role permissions', () => {
                const adminRole = dashboardAuth.getRole('admin');
                const viewerRole = dashboardAuth.getRole('viewer');

                expect(adminRole.permissions).to.include('admin');
                expect(adminRole.permissions).to.include('write');
                expect(viewerRole.permissions).to.not.include('write');
            });
        });
    });

    describe('DashboardServer', () => {
        describe('initialization', () => {
            it('should initialize with correct configuration', () => {
                expect(dashboardServer).to.have.property('port', 3002);
                expect(dashboardServer).to.have.property('host', 'localhost');
                expect(dashboardServer).to.have.property('app');
                expect(dashboardServer).to.have.property('server');
                expect(dashboardServer).to.have.property('wss');
            });

            it('should setup middleware correctly', () => {
                // Test that middleware is applied
                expect(dashboardServer.app).to.be.a('function');
            });
        });

        describe('WebSocket handling', () => {
            it('should handle WebSocket connections', () => {
                // Mock WebSocket connection
                const mockWs = {
                    readyState: 1, // OPEN
                    send: sinon.spy(),
                    on: sinon.spy()
                };

                const mockReq = {
                    socket: { remoteAddress: '127.0.0.1' }
                };

                // Simulate connection
                dashboardServer.wss.emit('connection', mockWs, mockReq);

                expect(dashboardServer.clients.has(mockWs)).to.be.true;
            });

            it('should broadcast messages to clients', () => {
                const mockWs = {
                    readyState: 1,
                    send: sinon.spy()
                };

                dashboardServer.clients.add(mockWs);

                dashboardServer.broadcast('test', { message: 'hello' });

                expect(mockWs.send.calledOnce).to.be.true;
                const sentData = JSON.parse(mockWs.send.firstCall.args[0]);
                expect(sentData.type).to.equal('test');
                expect(sentData.data.message).to.equal('hello');
            });
        });

        describe('API endpoints', () => {
            let mockReq;
            let mockRes;

            beforeEach(() => {
                mockReq = {
                    params: {},
                    query: {},
                    body: {},
                    ip: '127.0.0.1',
                    get: sinon.stub().returns('Test User Agent')
                };

                mockRes = {
                    json: sinon.spy(),
                    status: sinon.stub().returns({ json: sinon.spy() }),
                    sendFile: sinon.spy()
                };
            });

            it('should handle health endpoint', () => {
                // Test health endpoint directly
                dashboardServer.app._router.stack.forEach(layer => {
                    if (layer.route && layer.route.path === '/api/health') {
                        layer.route.stack[0].handle(mockReq, mockRes);
                    }
                });

                expect(mockRes.json.calledOnce).to.be.true;
                const response = mockRes.json.firstCall.args[0];
                expect(response).to.have.property('status', 'healthy');
            });

            it('should handle metrics endpoint', () => {
                // Test metrics endpoint
                dashboardServer.app._router.stack.forEach(layer => {
                    if (layer.route && layer.route.path === '/api/metrics') {
                        layer.route.stack[0].handle(mockReq, mockRes);
                    }
                });

                expect(mockRes.json.calledOnce).to.be.true;
            });
        });

        describe('alert system', () => {
            it('should check for alerts and broadcast them', () => {
                const mockWs = {
                    readyState: 1,
                    send: sinon.spy()
                };

                dashboardServer.clients.add(mockWs);

                // Mock metrics with high error rate
                const metrics = {
                    requests: { successRate: 0.85, errors: 100 },
                    performance: { averageResponseTime: 1200 },
                    system: { memory: { heapUsed: 100000000, heapTotal: 200000000 } }
                };

                const health = { status: 'healthy' };

                dashboardServer.checkForAlerts(metrics, health);

                // Should have sent alerts to WebSocket client
                expect(mockWs.send.called).to.be.true;
            });
        });
    });

    describe('Integration Tests', () => {
        describe('full dashboard flow', () => {
            it('should handle complete user authentication and data access flow', () => {
                // 1. Authenticate user
                const auth = dashboardAuth.authenticate('admin', 'admin123');
                expect(auth).to.have.property('token');

                // 2. Validate session
                const user = dashboardAuth.validateSession(auth.token);
                expect(user).to.have.property('username', 'admin');

                // 3. Check permissions
                expect(dashboardAuth.hasPermission(user, 'read')).to.be.true;
                expect(dashboardAuth.hasPermission(user, 'admin')).to.be.true;

                // 4. Access dashboard data
                const summary = dashboardController.getDashboardSummary();
                expect(summary).to.have.property('system');
                expect(summary).to.have.property('metrics');

                // 5. Generate alerts
                const alerts = dashboardController.generateAlerts();
                expect(alerts).to.be.an('array');
            });

            it('should handle provider and model monitoring', () => {
                // Test provider aggregation
                const providers = dashboardController.aggregateProviderData();
                expect(providers).to.be.an('array');

                // Test model aggregation
                const models = dashboardController.aggregateModelData();
                expect(models).to.be.an('array');

                // Test health monitoring integration
                const healthSummary = mockHealthMonitor.getHealthSummary();
                expect(healthSummary).to.have.property('providers');
                expect(healthSummary).to.have.property('models');
            });
        });

        describe('error handling', () => {
            it('should handle authentication failures gracefully', () => {
                const result = dashboardAuth.authenticate('admin', 'wrongpassword');
                expect(result).to.be.null;
            });

            it('should handle invalid session tokens', () => {
                const result = dashboardAuth.validateSession('invalid-token');
                expect(result).to.be.null;
            });

            it('should handle missing data gracefully', () => {
                // Test with missing dependencies
                const controller = new DashboardController({});
                const summary = controller.getDashboardSummary();

                expect(summary).to.have.property('timestamp');
                // Should not crash even with missing dependencies
            });
        });

        describe('performance and caching', () => {
            it('should cache data appropriately', () => {
                const start = Date.now();
                const summary1 = dashboardController.getDashboardSummary();
                const time1 = Date.now() - start;

                const start2 = Date.now();
                const summary2 = dashboardController.getDashboardSummary();
                const time2 = Date.now() - start2;

                // Second call should be faster due to caching
                expect(time2).to.be.lessThan(time1);
                expect(summary1).to.equal(summary2);
            });

            it('should handle concurrent requests', async () => {
                const promises = [];
                for (let i = 0; i < 10; i++) {
                    promises.push(dashboardController.getDashboardSummary());
                }

                const results = await Promise.all(promises);
                expect(results).to.have.length(10);
                expect(results[0]).to.equal(results[1]); // All should be cached
            });
        });
    });
});