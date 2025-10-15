/**
 * Monitoring Dashboard Server
 * Provides real-time monitoring and visualization of system health and performance
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const logger = require('../utils/logger');
const { metricsCollector, healthCheckManager } = require('../utils/monitoring');

class DashboardServer {
    constructor(options = {}) {
        this.port = options.port || 3001;
        this.host = options.host || 'localhost';
        this.app = express();
        this.server = http.createServer(this.app);
        this.wss = new WebSocket.Server({ server: this.server });

        // WebSocket clients
        this.clients = new Set();

        // Update intervals
        this.updateInterval = options.updateInterval || 5000; // 5 seconds
        this.updateTimer = null;

        // Authentication (basic for now)
        this.authEnabled = options.authEnabled !== false;
        this.users = options.users || { admin: 'admin123' };

        this.initializeMiddleware();
        this.initializeWebSocket();
        this.initializeRoutes();
    }

    /**
     * Initialize Express middleware
     */
    initializeMiddleware() {
        // Serve static files
        this.app.use(express.static(path.join(__dirname, 'public')));

        // Parse JSON bodies
        this.app.use(express.json());

        // Basic authentication middleware
        if (this.authEnabled) {
            this.app.use(this.basicAuthMiddleware.bind(this));
        }

        // Security headers
        this.app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`Dashboard request: ${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            next();
        });
    }

    /**
     * Basic authentication middleware
     */
    basicAuthMiddleware(req, res, next) {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Basic ')) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Dashboard"');
            return res.status(401).json({ error: 'Authentication required' });
        }

        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');

        if (!this.users[username] || this.users[username] !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        req.user = username;
        next();
    }

    /**
     * Initialize WebSocket server
     */
    initializeWebSocket() {
        this.wss.on('connection', (ws, req) => {
            logger.info('WebSocket client connected', { ip: req.socket.remoteAddress });

            this.clients.add(ws);

            // Send initial data
            this.sendToClient(ws, 'welcome', {
                message: 'Connected to monitoring dashboard',
                timestamp: new Date().toISOString()
            });

            // Handle client messages
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message.toString());
                    this.handleWebSocketMessage(ws, data);
                } catch (error) {
                    logger.error('Invalid WebSocket message', { error: error.message });
                }
            });

            // Handle client disconnect
            ws.on('close', () => {
                logger.info('WebSocket client disconnected');
                this.clients.delete(ws);
            });

            // Handle errors
            ws.on('error', (error) => {
                logger.error('WebSocket error', { error: error.message });
                this.clients.delete(ws);
            });
        });
    }

    /**
     * Handle WebSocket messages from clients
     */
    handleWebSocketMessage(ws, data) {
        switch (data.type) {
            case 'subscribe':
                // Client wants to subscribe to specific data streams
                this.sendToClient(ws, 'subscribed', {
                    streams: data.streams || ['metrics', 'health', 'alerts']
                });
                break;

            case 'ping':
                this.sendToClient(ws, 'pong', { timestamp: new Date().toISOString() });
                break;

            default:
                logger.warn('Unknown WebSocket message type', { type: data.type });
        }
    }

    /**
     * Send message to specific WebSocket client
     */
    sendToClient(ws, type, data) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
        }
    }

    /**
     * Broadcast message to all connected clients
     */
    broadcast(type, data) {
        const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });

        this.clients.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    /**
     * Initialize API routes
     */
    initializeRoutes() {
        // Health check endpoint
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // System metrics endpoint
        this.app.get('/api/metrics', (req, res) => {
            try {
                const metrics = metricsCollector.getMetrics();
                res.json(metrics);
            } catch (error) {
                logger.error('Error getting metrics', { error: error.message });
                res.status(500).json({ error: 'Failed to get metrics' });
            }
        });

        // Health status endpoint
        this.app.get('/api/health/status', (req, res) => {
            try {
                const health = healthCheckManager.getHealth();
                res.json(health);
            } catch (error) {
                logger.error('Error getting health status', { error: error.message });
                res.status(500).json({ error: 'Failed to get health status' });
            }
        });

        // Provider health endpoint
        this.app.get('/api/providers/health', (req, res) => {
            // This would integrate with the health monitor
            // For now, return mock data
            res.json({
                providers: [
                    { name: 'openai', status: 'healthy', responseTime: 150 },
                    { name: 'anthropic', status: 'healthy', responseTime: 200 },
                    { name: 'huggingface', status: 'unhealthy', responseTime: null }
                ]
            });
        });

        // Model catalog endpoint
        this.app.get('/api/models', (req, res) => {
            // This would integrate with model tracker
            // For now, return mock data
            res.json({
                models: [
                    { id: 'gpt-4', provider: 'openai', status: 'available' },
                    { id: 'claude-3', provider: 'anthropic', status: 'available' },
                    { id: 'llama-2-70b', provider: 'huggingface', status: 'unavailable' }
                ]
            });
        });

        // API usage statistics
        this.app.get('/api/usage', (req, res) => {
            // This would integrate with usage tracking
            // For now, return mock data
            res.json({
                totalRequests: 15420,
                successRate: 98.5,
                averageResponseTime: 245,
                requestsByProvider: {
                    openai: 8920,
                    anthropic: 4500,
                    huggingface: 2000
                },
                requestsByEndpoint: {
                    '/api/chat': 12000,
                    '/api/completions': 3420
                }
            });
        });

        // Cache performance endpoint
        this.app.get('/api/cache', (req, res) => {
            // This would integrate with cache manager
            // For now, return mock data
            res.json({
                hitRate: 87.3,
                totalRequests: 25600,
                cacheHits: 22380,
                cacheMisses: 3220,
                averageResponseTime: 45
            });
        });

        // Serve main dashboard page
        this.app.get('/', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });

        // Catch-all handler for SPA
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        });
    }

    /**
     * Start periodic data updates
     */
    startUpdates() {
        this.updateTimer = setInterval(() => {
            this.sendUpdates();
        }, this.updateInterval);
    }

    /**
     * Stop periodic data updates
     */
    stopUpdates() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    /**
     * Send real-time updates to connected clients
     */
    sendUpdates() {
        try {
            // Get current metrics
            const metrics = metricsCollector.getMetrics();
            const health = healthCheckManager.getHealth();

            // Broadcast updates
            this.broadcast('metrics', metrics);
            this.broadcast('health', health);

            // Check for alerts
            this.checkForAlerts(metrics, health);

        } catch (error) {
            logger.error('Error sending updates', { error: error.message });
        }
    }

    /**
     * Check for system alerts
     */
    checkForAlerts(metrics, health) {
        const alerts = [];

        // Check memory usage
        if (health.checks.memory && health.checks.memory.status === 'unhealthy') {
            alerts.push({
                level: 'critical',
                message: 'High memory usage detected',
                details: health.checks.memory.message
            });
        }

        // Check error rates
        if (metrics.requests.successRate < 95) {
            alerts.push({
                level: 'warning',
                message: 'High error rate detected',
                details: `Success rate: ${metrics.requests.successRate.toFixed(2)}%`
            });
        }

        // Check response times
        if (metrics.performance.averageResponseTime > 1000) {
            alerts.push({
                level: 'warning',
                message: 'Slow response times detected',
                details: `Average: ${metrics.performance.averageResponseTime.toFixed(0)}ms`
            });
        }

        // Broadcast alerts if any
        if (alerts.length > 0) {
            this.broadcast('alerts', alerts);
        }
    }

    /**
     * Start the dashboard server
     */
    async start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, this.host, (error) => {
                if (error) {
                    logger.error('Failed to start dashboard server', { error: error.message });
                    reject(error);
                    return;
                }

                logger.info(`Dashboard server started on http://${this.host}:${this.port}`);
                this.startUpdates();
                resolve();
            });
        });
    }

    /**
     * Stop the dashboard server
     */
    async stop() {
        return new Promise((resolve) => {
            this.stopUpdates();

            // Close all WebSocket connections
            this.clients.forEach(ws => ws.close());
            this.clients.clear();

            this.server.close(() => {
                logger.info('Dashboard server stopped');
                resolve();
            });
        });
    }

    /**
     * Get server status
     */
    getStatus() {
        return {
            running: this.server.listening,
            port: this.port,
            host: this.host,
            clients: this.clients.size,
            authEnabled: this.authEnabled
        };
    }
}

module.exports = DashboardServer;

// If run directly
if (require.main === module) {
    const server = new DashboardServer({
        port: process.env.DASHBOARD_PORT || 3001,
        authEnabled: process.env.DASHBOARD_AUTH !== 'false'
    });

    server.start().catch(error => {
        console.error('Failed to start dashboard server:', error);
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('Shutting down dashboard server...');
        await server.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('Shutting down dashboard server...');
        await server.stop();
        process.exit(0);
    });
}