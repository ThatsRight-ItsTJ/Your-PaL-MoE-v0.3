/**
 * Monitoring Dashboard Frontend
 * Real-time monitoring and visualization client
 */

class DashboardApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.updateInterval = 5000; // 5 seconds
        this.charts = new Map();
        this.websocket = null;
        this.isConnected = false;
        this.dataCache = new Map();

        this.initializeApp();
    }

    /**
     * Initialize the dashboard application
     */
    async initializeApp() {
        this.setupEventListeners();
        this.initializeWebSocket();
        this.initializeCharts();
        this.startPeriodicUpdates();
        this.updateTime();

        // Load initial data
        await this.loadDashboardData();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const page = e.currentTarget.dataset.page;
                this.navigateToPage(page);
            });
        });

        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        // Time range selector
        const timeRange = document.getElementById('time-range');
        if (timeRange) {
            timeRange.addEventListener('change', (e) => {
                this.updateTimeRange(e.target.value);
            });
        }

        // Settings
        this.setupSettingsListeners();
    }

    /**
     * Setup settings event listeners
     */
    setupSettingsListeners() {
        const saveBtn = document.getElementById('save-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        const resetBtn = document.getElementById('reset-settings');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetSettings());
        }
    }

    /**
     * Initialize WebSocket connection
     */
    initializeWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            this.websocket = new WebSocket(wsUrl);

            this.websocket.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus(true);
                console.log('WebSocket connected');
            };

            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.websocket.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus(false);
                console.log('WebSocket disconnected');

                // Attempt to reconnect after 5 seconds
                setTimeout(() => this.initializeWebSocket(), 5000);
            };

            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

        } catch (error) {
            console.error('Failed to initialize WebSocket:', error);
        }
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'welcome':
                console.log('Connected to dashboard server');
                break;

            case 'metrics':
                this.updateMetrics(data.data);
                break;

            case 'health':
                this.updateHealthStatus(data.data);
                break;

            case 'alerts':
                this.updateAlerts(data.data);
                break;

            default:
                console.log('Unknown message type:', data.type);
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('system-status-text');

        if (statusDot && statusText) {
            if (connected) {
                statusDot.className = 'status-dot';
                statusText.textContent = 'Connected';
            } else {
                statusDot.className = 'status-dot status-error';
                statusText.textContent = 'Disconnected';
            }
        }
    }

    /**
     * Navigate to a different page
     */
    navigateToPage(page) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        this.currentPage = page;

        // Load page content
        this.loadPageContent(page);
    }

    /**
     * Load page content
     */
    async loadPageContent(page) {
        const contentContainer = document.getElementById('page-content');

        try {
            let content = '';

            switch (page) {
                case 'dashboard':
                    content = await this.loadDashboardContent();
                    break;
                case 'metrics':
                    content = await this.loadMetricsContent();
                    break;
                case 'providers':
                    content = await this.loadProvidersContent();
                    break;
                case 'models':
                    content = await this.loadModelsContent();
                    break;
                case 'alerts':
                    content = await this.loadAlertsContent();
                    break;
                case 'settings':
                    content = await this.loadSettingsContent();
                    break;
                default:
                    content = '<div class="error">Page not found</div>';
            }

            contentContainer.innerHTML = content;

            // Initialize page-specific functionality
            this.initializePage(page);

        } catch (error) {
            console.error('Error loading page content:', error);
            contentContainer.innerHTML = '<div class="error">Failed to load page content</div>';
        }
    }

    /**
     * Load dashboard content
     */
    async loadDashboardContent() {
        // This would typically load from a template or API
        // For now, return static content
        return `
            <div class="dashboard-page">
                <div class="page-header">
                    <h2>Dashboard Overview</h2>
                    <div class="page-actions">
                        <select id="time-range" class="form-select">
                            <option value="1h">Last Hour</option>
                            <option value="6h">Last 6 Hours</option>
                            <option value="24h" selected>Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                        </select>
                    </div>
                </div>

                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-header">
                            <h3>Total Requests</h3>
                            <span class="metric-trend" id="requests-trend"></span>
                        </div>
                        <div class="metric-value" id="total-requests">0</div>
                        <div class="metric-subtext" id="requests-period">Last 24h</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-header">
                            <h3>Success Rate</h3>
                            <span class="metric-trend" id="success-trend"></span>
                        </div>
                        <div class="metric-value" id="success-rate">0%</div>
                        <div class="metric-subtext">Overall</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-header">
                            <h3>Avg Response Time</h3>
                            <span class="metric-trend" id="response-trend"></span>
                        </div>
                        <div class="metric-value" id="avg-response-time">0ms</div>
                        <div class="metric-subtext">Average</div>
                    </div>

                    <div class="metric-card">
                        <div class="metric-header">
                            <h3>Active Providers</h3>
                            <span class="metric-trend" id="providers-trend"></span>
                        </div>
                        <div class="metric-value" id="active-providers">0</div>
                        <div class="metric-subtext">Healthy</div>
                    </div>
                </div>

                <div class="charts-row">
                    <div class="chart-container">
                        <h3>Request Volume</h3>
                        <canvas id="requests-chart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Response Time Distribution</h3>
                        <canvas id="response-time-chart"></canvas>
                    </div>
                </div>

                <div class="status-overview">
                    <div class="status-section">
                        <h3>Provider Status</h3>
                        <div id="provider-status-list" class="status-list"></div>
                    </div>

                    <div class="status-section">
                        <h3>Recent Alerts</h3>
                        <div id="alerts-list" class="alerts-list"></div>
                    </div>
                </div>

                <div class="system-resources">
                    <h3>System Resources</h3>
                    <div class="resource-grid">
                        <div class="resource-item">
                            <label>Memory Usage</label>
                            <div class="progress-bar">
                                <div class="progress-fill" id="memory-usage" style="width: 0%"></div>
                            </div>
                            <span class="resource-value" id="memory-text">0%</span>
                        </div>

                        <div class="resource-item">
                            <label>CPU Usage</label>
                            <div class="progress-bar">
                                <div class="progress-fill" id="cpu-usage" style="width: 0%"></div>
                            </div>
                            <span class="resource-value" id="cpu-text">0%</span>
                        </div>

                        <div class="resource-item">
                            <label>Cache Hit Rate</label>
                            <div class="progress-bar">
                                <div class="progress-fill" id="cache-hit-rate" style="width: 0%"></div>
                            </div>
                            <span class="resource-value" id="cache-text">0%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Initialize page-specific functionality
     */
    initializePage(page) {
        switch (page) {
            case 'dashboard':
                this.initializeDashboardCharts();
                break;
            case 'metrics':
                this.initializeMetricsPage();
                break;
            case 'providers':
                this.initializeProvidersPage();
                break;
            case 'models':
                this.initializeModelsPage();
                break;
            case 'alerts':
                this.initializeAlertsPage();
                break;
        }
    }

    /**
     * Initialize Chart.js charts
     */
    initializeCharts() {
        // This would initialize Chart.js if available
        // For now, we'll create placeholder chart functions
    }

    /**
     * Initialize dashboard charts
     */
    initializeDashboardCharts() {
        this.createRequestsChart();
        this.createResponseTimeChart();
    }

    /**
     * Create requests chart
     */
    createRequestsChart() {
        const ctx = document.getElementById('requests-chart');
        if (!ctx) return;

        // Mock chart data - in real implementation, use Chart.js
        ctx.innerHTML = '<div class="chart-placeholder">Request Volume Chart</div>';
    }

    /**
     * Create response time chart
     */
    createResponseTimeChart() {
        const ctx = document.getElementById('response-time-chart');
        if (!ctx) return;

        // Mock chart data
        ctx.innerHTML = '<div class="chart-placeholder">Response Time Chart</div>';
    }

    /**
     * Load dashboard data
     */
    async loadDashboardData() {
        try {
            const response = await fetch('/api/metrics');
            const metrics = await response.json();

            this.updateMetrics(metrics);
            this.updateSystemResources(metrics.system);

        } catch (error) {
            console.error('Error loading dashboard data:', error);
        }
    }

    /**
     * Update metrics display
     */
    updateMetrics(metrics) {
        // Update metric cards
        this.updateElement('total-requests', metrics.requests.total.toLocaleString());
        this.updateElement('success-rate', `${(metrics.requests.successRate * 100).toFixed(1)}%`);
        this.updateElement('avg-response-time', `${metrics.performance.averageResponseTime.toFixed(0)}ms`);

        // Update trends (mock data)
        this.updateTrend('requests-trend', 'positive', '+12%');
        this.updateTrend('success-trend', 'positive', '+2.1%');
        this.updateTrend('response-trend', 'negative', '-5%');
        this.updateTrend('providers-trend', 'neutral', '0%');
    }

    /**
     * Update system resources
     */
    updateSystemResources(system) {
        if (!system) return;

        const memoryPercent = ((system.memory.heapUsed / system.memory.heapTotal) * 100).toFixed(1);
        this.updateElement('memory-usage', `width: ${memoryPercent}%`);
        this.updateElement('memory-text', `${memoryPercent}%`);

        // Mock CPU and cache data
        this.updateElement('cpu-usage', 'width: 45%');
        this.updateElement('cpu-text', '45%');

        this.updateElement('cache-hit-rate', 'width: 87%');
        this.updateElement('cache-text', '87%');
    }

    /**
     * Update health status
     */
    updateHealthStatus(health) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.getElementById('system-status-text');

        if (statusDot && statusText) {
            const isHealthy = health.status === 'healthy';
            statusDot.className = `status-dot ${isHealthy ? '' : 'status-error'}`;
            statusText.textContent = health.status;
        }
    }

    /**
     * Update alerts
     */
    updateAlerts(alerts) {
        const alertsList = document.getElementById('alerts-list');
        if (!alertsList) return;

        alertsList.innerHTML = alerts.map(alert => `
            <div class="alert-item alert-${alert.level}">
                <div class="alert-message">${alert.message}</div>
                <div class="alert-details">${alert.details}</div>
            </div>
        `).join('');
    }

    /**
     * Update trend indicator
     */
    updateTrend(elementId, direction, value) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.textContent = value;
        element.className = `metric-trend ${direction === 'positive' ? '' : direction === 'negative' ? 'negative' : 'neutral'}`;
    }

    /**
     * Update DOM element
     */
    updateElement(id, content) {
        const element = document.getElementById(id);
        if (element) {
            if (typeof content === 'object' && content.style) {
                // Handle style updates
                Object.assign(element.style, content);
            } else {
                element.textContent = content;
            }
        }
    }

    /**
     * Refresh all data
     */
    async refreshData() {
        await this.loadDashboardData();
        this.showNotification('Data refreshed', 'success');
    }

    /**
     * Update time range
     */
    updateTimeRange(range) {
        // Update data based on new time range
        this.refreshData();
    }

    /**
     * Start periodic updates
     */
    startPeriodicUpdates() {
        setInterval(() => {
            if (this.currentPage === 'dashboard') {
                this.loadDashboardData();
            }
        }, this.updateInterval);
    }

    /**
     * Update current time display
     */
    updateTime() {
        const timeElement = document.getElementById('current-time');
        if (timeElement) {
            const now = new Date();
            timeElement.textContent = now.toLocaleTimeString();
        }

        // Update every second
        setTimeout(() => this.updateTime(), 1000);
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        // Simple notification - could be enhanced with a proper notification system
        console.log(`[${type.toUpperCase()}] ${message}`);
    }

    /**
     * Load metrics page content
     */
    async loadMetricsContent() {
        return `
            <div class="metrics-page">
                <div class="page-header">
                    <h2>Detailed Metrics</h2>
                    <div class="page-actions">
                        <button class="btn btn-primary" id="export-metrics">Export Data</button>
                    </div>
                </div>

                <div class="metrics-content">
                    <div class="metrics-filters">
                        <select id="metrics-timeframe" class="form-select">
                            <option value="1h">Last Hour</option>
                            <option value="6h">Last 6 Hours</option>
                            <option value="24h" selected>Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                        </select>
                        <select id="metrics-type" class="form-select">
                            <option value="all">All Metrics</option>
                            <option value="requests">Requests</option>
                            <option value="performance">Performance</option>
                            <option value="system">System</option>
                        </select>
                    </div>

                    <div class="metrics-charts">
                        <div class="chart-container full-width">
                            <h3>Requests Over Time</h3>
                            <canvas id="detailed-requests-chart"></canvas>
                        </div>

                        <div class="chart-container">
                            <h3>Response Time Trends</h3>
                            <canvas id="response-trends-chart"></canvas>
                        </div>

                        <div class="chart-container">
                            <h3>Error Rate Analysis</h3>
                            <canvas id="error-analysis-chart"></canvas>
                        </div>
                    </div>

                    <div class="metrics-table">
                        <h3>Metrics Summary</h3>
                        <table id="metrics-table" class="data-table">
                            <thead>
                                <tr>
                                    <th>Metric</th>
                                    <th>Current</th>
                                    <th>Average</th>
                                    <th>Min</th>
                                    <th>Max</th>
                                    <th>Trend</th>
                                </tr>
                            </thead>
                            <tbody id="metrics-table-body">
                                <tr><td colspan="6">Loading metrics...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Load providers page content
     */
    async loadProvidersContent() {
        return `
            <div class="providers-page">
                <div class="page-header">
                    <h2>Provider Management</h2>
                    <div class="page-actions">
                        <button class="btn btn-primary" id="add-provider">Add Provider</button>
                        <button class="btn btn-secondary" id="refresh-providers">Refresh</button>
                    </div>
                </div>

                <div class="providers-grid" id="providers-grid">
                    <div class="loading">Loading providers...</div>
                </div>
            </div>
        `;
    }

    /**
     * Load models page content
     */
    async loadModelsContent() {
        return `
            <div class="models-page">
                <div class="page-header">
                    <h2>Model Catalog</h2>
                    <div class="page-actions">
                        <input type="text" id="model-search" placeholder="Search models..." class="form-input">
                        <select id="model-filter" class="form-select">
                            <option value="all">All Models</option>
                            <option value="available">Available</option>
                            <option value="unavailable">Unavailable</option>
                        </select>
                    </div>
                </div>

                <div class="models-table-container">
                    <table id="models-table" class="data-table">
                        <thead>
                            <tr>
                                <th>Model ID</th>
                                <th>Name</th>
                                <th>Provider</th>
                                <th>Status</th>
                                <th>Capabilities</th>
                                <th>Context Length</th>
                                <th>Last Used</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody id="models-table-body">
                            <tr><td colspan="8">Loading models...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * Load alerts page content
     */
    async loadAlertsContent() {
        return `
            <div class="alerts-page">
                <div class="page-header">
                    <h2>System Alerts</h2>
                    <div class="page-actions">
                        <button class="btn btn-primary" id="acknowledge-all">Acknowledge All</button>
                        <select id="alert-filter" class="form-select">
                            <option value="all">All Alerts</option>
                            <option value="active">Active Only</option>
                            <option value="critical">Critical</option>
                            <option value="warning">Warning</option>
                        </select>
                    </div>
                </div>

                <div class="alerts-container">
                    <div id="alerts-list-detailed" class="alerts-list-detailed">
                        <div class="loading">Loading alerts...</div>
                    </div>
                </div>

                <div class="alert-stats">
                    <div class="stat-card">
                        <h4>Total Alerts</h4>
                        <div class="stat-value" id="total-alerts">0</div>
                    </div>
                    <div class="stat-card">
                        <h4>Critical</h4>
                        <div class="stat-value critical" id="critical-alerts">0</div>
                    </div>
                    <div class="stat-card">
                        <h4>Warning</h4>
                        <div class="stat-value warning" id="warning-alerts">0</div>
                    </div>
                    <div class="stat-card">
                        <h4>Active</h4>
                        <div class="stat-value" id="active-alerts">0</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Load settings page content
     */
    async loadSettingsContent() {
        return `
            <div class="settings-page">
                <div class="page-header">
                    <h2>Dashboard Settings</h2>
                </div>

                <div class="settings-content">
                    <div class="settings-section">
                        <h3>General Settings</h3>
                        <div class="setting-item">
                            <label for="update-interval">Update Interval (seconds)</label>
                            <input type="number" id="update-interval" value="5" min="1" max="60" class="form-input">
                        </div>

                        <div class="setting-item">
                            <label for="theme">Theme</label>
                            <select id="theme" class="form-select">
                                <option value="dark" selected>Dark</option>
                                <option value="light">Light</option>
                            </select>
                        </div>

                        <div class="setting-item">
                            <label for="timezone">Timezone</label>
                            <select id="timezone" class="form-select">
                                <option value="UTC">UTC</option>
                                <option value="America/New_York">Eastern Time</option>
                                <option value="America/Chicago" selected>Central Time</option>
                                <option value="America/Denver">Mountain Time</option>
                                <option value="America/Los_Angeles">Pacific Time</option>
                            </select>
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3>Alert Thresholds</h3>
                        <div class="setting-item">
                            <label for="error-rate-threshold">Error Rate Threshold (%)</label>
                            <input type="number" id="error-rate-threshold" value="5" min="0" max="100" class="form-input">
                        </div>

                        <div class="setting-item">
                            <label for="response-time-threshold">Response Time Threshold (ms)</label>
                            <input type="number" id="response-time-threshold" value="1000" min="100" class="form-input">
                        </div>

                        <div class="setting-item">
                            <label for="memory-threshold">Memory Usage Threshold (%)</label>
                            <input type="number" id="memory-threshold" value="85" min="0" max="100" class="form-input">
                        </div>
                    </div>

                    <div class="settings-section">
                        <h3>Notifications</h3>
                        <div class="setting-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="email-notifications" checked>
                                Email notifications for critical alerts
                            </label>
                        </div>

                        <div class="setting-item">
                            <label class="checkbox-label">
                                <input type="checkbox" id="browser-notifications">
                                Browser notifications
                            </label>
                        </div>
                    </div>

                    <div class="settings-actions">
                        <button class="btn btn-primary" id="save-settings">Save Settings</button>
                        <button class="btn btn-secondary" id="reset-settings">Reset to Defaults</button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Initialize metrics page
     */
    initializeMetricsPage() {
        // Setup event listeners for metrics page
        const exportBtn = document.getElementById('export-metrics');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportMetrics());
        }

        // Load metrics data
        this.loadMetricsData();
    }

    /**
     * Initialize providers page
     */
    initializeProvidersPage() {
        // Load providers data
        this.loadProvidersData();
    }

    /**
     * Initialize models page
     */
    initializeModelsPage() {
        // Load models data
        this.loadModelsData();
    }

    /**
     * Initialize alerts page
     */
    initializeAlertsPage() {
        // Load alerts data
        this.loadAlertsData();
    }

    /**
     * Load metrics data
     */
    async loadMetricsData() {
        try {
            const response = await fetch('/api/metrics');
            const metrics = await response.json();

            this.updateMetricsTable(metrics);
        } catch (error) {
            console.error('Error loading metrics data:', error);
        }
    }

    /**
     * Load providers data
     */
    async loadProvidersData() {
        try {
            const response = await fetch('/api/providers');
            const data = await response.json();

            this.renderProviders(data.providers);
        } catch (error) {
            console.error('Error loading providers data:', error);
        }
    }

    /**
     * Load models data
     */
    async loadModelsData() {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();

            this.renderModels(data.models);
        } catch (error) {
            console.error('Error loading models data:', error);
        }
    }

    /**
     * Load alerts data
     */
    async loadAlertsData() {
        try {
            const response = await fetch('/api/alerts');
            const data = await response.json();

            this.renderAlerts(data.alerts);
        } catch (error) {
            console.error('Error loading alerts data:', error);
        }
    }

    /**
     * Update metrics table
     */
    updateMetricsTable(metrics) {
        const tbody = document.getElementById('metrics-table-body');
        if (!tbody) return;

        const rows = [
            {
                metric: 'Total Requests',
                current: metrics.requests.total,
                average: metrics.requests.total, // Mock average
                min: 0,
                max: metrics.requests.total,
                trend: '+5%'
            },
            {
                metric: 'Success Rate',
                current: `${(metrics.requests.successRate * 100).toFixed(1)}%`,
                average: '98.5%',
                min: '95.0%',
                max: '99.9%',
                trend: '+0.2%'
            },
            {
                metric: 'Average Response Time',
                current: `${metrics.performance.averageResponseTime.toFixed(0)}ms`,
                average: '250ms',
                min: '50ms',
                max: '2000ms',
                trend: '-10ms'
            }
        ];

        tbody.innerHTML = rows.map(row => `
            <tr>
                <td>${row.metric}</td>
                <td>${row.current}</td>
                <td>${row.average}</td>
                <td>${row.min}</td>
                <td>${row.max}</td>
                <td class="${row.trend.startsWith('+') ? 'positive' : 'negative'}">${row.trend}</td>
            </tr>
        `).join('');
    }

    /**
     * Render providers
     */
    renderProviders(providers) {
        const container = document.getElementById('providers-grid');
        if (!container) return;

        container.innerHTML = providers.map(provider => `
            <div class="provider-card" data-provider="${provider.name}">
                <div class="provider-header">
                    <h4>${provider.name}</h4>
                    <span class="provider-status status-${provider.health || 'unknown'}">${provider.health || 'unknown'}</span>
                </div>
                <div class="provider-metrics">
                    <div class="metric">
                        <span class="metric-label">Models:</span>
                        <span class="metric-value">${provider.models}</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Response Time:</span>
                        <span class="metric-value">${provider.health?.responseTime || 'N/A'}ms</span>
                    </div>
                    <div class="metric">
                        <span class="metric-label">Requests:</span>
                        <span class="metric-value">${provider.metrics?.requests?.total || 0}</span>
                    </div>
                </div>
                <div class="provider-actions">
                    <button class="btn btn-sm view-details">View Details</button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Render models table
     */
    renderModels(models) {
        const tbody = document.getElementById('models-table-body');
        if (!tbody) return;

        tbody.innerHTML = models.map(model => `
            <tr data-model="${model.id}">
                <td>${model.id}</td>
                <td>${model.name || model.id}</td>
                <td>${model.provider}</td>
                <td><span class="status-badge status-${model.status}">${model.status}</span></td>
                <td>${model.capabilities?.join(', ') || 'N/A'}</td>
                <td>${model.contextLength || 'N/A'}</td>
                <td>${model.metrics?.lastUsed ? new Date(model.metrics.lastUsed).toLocaleDateString() : 'Never'}</td>
                <td>
                    <button class="btn btn-sm view-model">View</button>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Render alerts
     */
    renderAlerts(alerts) {
        const container = document.getElementById('alerts-list-detailed');
        if (!container) return;

        container.innerHTML = alerts.map(alert => `
            <div class="alert-item alert-${alert.level} ${alert.acknowledged ? 'alert-acknowledged' : ''}" data-id="${alert.id}">
                <div class="alert-header">
                    <span class="alert-level">${alert.level.toUpperCase()}</span>
                    <span class="alert-timestamp">${new Date(alert.timestamp).toLocaleString()}</span>
                    ${!alert.acknowledged ? '<button class="btn btn-sm acknowledge-btn">Acknowledge</button>' : ''}
                </div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-details">${alert.details}</div>
            </div>
        `).join('');

        // Update stats
        this.updateAlertStats(alerts);
    }

    /**
     * Update alert statistics
     */
    updateAlertStats(alerts) {
        const total = alerts.length;
        const critical = alerts.filter(a => a.level === 'critical').length;
        const warning = alerts.filter(a => a.level === 'warning').length;
        const active = alerts.filter(a => !a.acknowledged).length;

        this.updateElement('total-alerts', total);
        this.updateElement('critical-alerts', critical);
        this.updateElement('warning-alerts', warning);
        this.updateElement('active-alerts', active);
    }

    /**
     * Export metrics data
     */
    exportMetrics() {
        // Mock export functionality
        this.showNotification('Metrics export feature coming soon', 'info');
    }

    /**
     * Save settings
     */
    async saveSettings() {
        const settings = {
            updateInterval: parseInt(document.getElementById('update-interval').value),
            theme: document.getElementById('theme').value,
            timezone: document.getElementById('timezone').value,
            errorRateThreshold: parseInt(document.getElementById('error-rate-threshold').value),
            responseTimeThreshold: parseInt(document.getElementById('response-time-threshold').value),
            memoryThreshold: parseInt(document.getElementById('memory-threshold').value),
            emailNotifications: document.getElementById('email-notifications').checked,
            browserNotifications: document.getElementById('browser-notifications').checked
        };

        try {
            const response = await fetch('/api/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            if (response.ok) {
                this.showNotification('Settings saved successfully', 'success');
            } else {
                throw new Error('Failed to save settings');
            }
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showNotification('Failed to save settings', 'error');
        }
    }

    /**
     * Reset settings to defaults
     */
    resetSettings() {
        document.getElementById('update-interval').value = '5';
        document.getElementById('theme').value = 'dark';
        document.getElementById('timezone').value = 'America/Chicago';
        document.getElementById('error-rate-threshold').value = '5';
        document.getElementById('response-time-threshold').value = '1000';
        document.getElementById('memory-threshold').value = '85';
        document.getElementById('email-notifications').checked = true;
        document.getElementById('browser-notifications').checked = false;

        this.showNotification('Settings reset to defaults', 'info');
    }
}

// Initialize the dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardApp = new DashboardApp();
});