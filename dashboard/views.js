/**
 * Dashboard Views
 * HTML templates and rendering functions for the monitoring dashboard
 */

class DashboardViews {
    constructor() {
        this.templates = new Map();
        this.initializeTemplates();
    }

    /**
     * Initialize HTML templates
     */
    initializeTemplates() {
        this.templates.set('main', this.getMainTemplate());
        this.templates.set('header', this.getHeaderTemplate());
        this.templates.set('sidebar', this.getSidebarTemplate());
        this.templates.set('dashboard', this.getDashboardTemplate());
        this.templates.set('metrics', this.getMetricsTemplate());
        this.templates.set('providers', this.getProvidersTemplate());
        this.templates.set('models', this.getModelsTemplate());
        this.templates.set('alerts', this.getAlertsTemplate());
        this.templates.set('settings', this.getSettingsTemplate());
    }

    /**
     * Render a template with data
     */
    render(templateName, data = {}) {
        const template = this.templates.get(templateName);
        if (!template) {
            throw new Error(`Template '${templateName}' not found`);
        }

        return this.interpolate(template, data);
    }

    /**
     * Simple template interpolation
     */
    interpolate(template, data) {
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return data[key] !== undefined ? data[key] : match;
        });
    }

    /**
     * Get main HTML template
     */
    getMainTemplate() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitoring Dashboard - Your PaL MoE</title>
    <link rel="stylesheet" href="/css/dashboard.css">
    <link rel="icon" href="/images/favicon.jpg" type="image/jpeg">
</head>
<body>
    <div id="app">
        ${this.getHeaderTemplate()}
        <div class="main-content">
            ${this.getSidebarTemplate()}
            <main class="content">
                <div id="page-content">
                    ${this.getDashboardTemplate()}
                </div>
            </main>
        </div>
    </div>
    <script src="/js/dashboard.js"></script>
</body>
</html>`;
    }

    /**
     * Get header template
     */
    getHeaderTemplate() {
        return `<header class="header">
    <div class="header-left">
        <h1 class="logo">Your PaL MoE</h1>
        <span class="subtitle">Monitoring Dashboard</span>
    </div>
    <div class="header-right">
        <div class="status-indicator">
            <span class="status-dot" id="system-status"></span>
            <span class="status-text" id="system-status-text">Loading...</span>
        </div>
        <div class="time-display" id="current-time"></div>
        <button class="btn btn-secondary" id="refresh-btn">Refresh</button>
    </div>
</header>`;
    }

    /**
     * Get sidebar template
     */
    getSidebarTemplate() {
        return `<nav class="sidebar">
    <ul class="nav-menu">
        <li class="nav-item active" data-page="dashboard">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            Dashboard
        </li>
        <li class="nav-item" data-page="metrics">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
            </svg>
            Metrics
        </li>
        <li class="nav-item" data-page="providers">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>
            </svg>
            Providers
        </li>
        <li class="nav-item" data-page="models">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m16.24-3.76l-4.24 4.24m-6-6L2.76 6.24m16.24 7.52l-4.24-4.24m-6 6L2.76 17.76"></path>
            </svg>
            Models
        </li>
        <li class="nav-item" data-page="alerts">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Alerts
        </li>
        <li class="nav-item" data-page="settings">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Settings
        </li>
    </ul>
</nav>`;
    }

    /**
     * Get dashboard overview template
     */
    getDashboardTemplate() {
        return `<div class="dashboard-page">
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

    <!-- Key Metrics Cards -->
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

    <!-- Charts Row -->
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

    <!-- Status Overview -->
    <div class="status-overview">
        <div class="status-section">
            <h3>Provider Status</h3>
            <div id="provider-status-list" class="status-list">
                <!-- Provider status items will be inserted here -->
            </div>
        </div>

        <div class="status-section">
            <h3>Recent Alerts</h3>
            <div id="alerts-list" class="alerts-list">
                <!-- Alert items will be inserted here -->
            </div>
        </div>
    </div>

    <!-- System Resources -->
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
</div>`;
    }

    /**
     * Get metrics page template
     */
    getMetricsTemplate() {
        return `<div class="metrics-page">
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
                    <!-- Table rows will be inserted here -->
                </tbody>
            </table>
        </div>
    </div>
</div>`;
    }

    /**
     * Get providers page template
     */
    getProvidersTemplate() {
        return `<div class="providers-page">
    <div class="page-header">
        <h2>Provider Management</h2>
        <div class="page-actions">
            <button class="btn btn-primary" id="add-provider">Add Provider</button>
            <button class="btn btn-secondary" id="refresh-providers">Refresh</button>
        </div>
    </div>

    <div class="providers-grid" id="providers-grid">
        <!-- Provider cards will be inserted here -->
    </div>

    <div class="provider-details" id="provider-details" style="display: none;">
        <div class="detail-header">
            <h3 id="provider-name">Provider Details</h3>
            <button class="btn btn-secondary" id="close-details">Close</button>
        </div>
        <div class="detail-content">
            <div class="detail-section">
                <h4>Status & Health</h4>
                <div class="health-indicators">
                    <div class="indicator">
                        <span class="indicator-label">Status:</span>
                        <span class="indicator-value" id="provider-status">Unknown</span>
                    </div>
                    <div class="indicator">
                        <span class="indicator-label">Response Time:</span>
                        <span class="indicator-value" id="provider-response-time">0ms</span>
                    </div>
                    <div class="indicator">
                        <span class="indicator-label">Uptime:</span>
                        <span class="indicator-value" id="provider-uptime">0%</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4>Performance Metrics</h4>
                <canvas id="provider-performance-chart"></canvas>
            </div>

            <div class="detail-section">
                <h4>Models</h4>
                <div id="provider-models-list" class="models-list">
                    <!-- Models will be listed here -->
                </div>
            </div>
        </div>
    </div>
</div>`;
    }

    /**
     * Get models page template
     */
    getModelsTemplate() {
        return `<div class="models-page">
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
                <!-- Model rows will be inserted here -->
            </tbody>
        </table>
    </div>

    <div class="model-details" id="model-details" style="display: none;">
        <div class="detail-header">
            <h3 id="model-detail-name">Model Details</h3>
            <button class="btn btn-secondary" id="close-model-details">Close</button>
        </div>
        <div class="detail-content">
            <div class="detail-grid">
                <div class="detail-item">
                    <label>ID:</label>
                    <span id="model-detail-id"></span>
                </div>
                <div class="detail-item">
                    <label>Provider:</label>
                    <span id="model-detail-provider"></span>
                </div>
                <div class="detail-item">
                    <label>Status:</label>
                    <span id="model-detail-status"></span>
                </div>
                <div class="detail-item">
                    <label>Context Length:</label>
                    <span id="model-detail-context"></span>
                </div>
            </div>

            <div class="detail-section">
                <h4>Capabilities</h4>
                <div id="model-capabilities" class="capabilities-list">
                    <!-- Capabilities will be listed here -->
                </div>
            </div>

            <div class="detail-section">
                <h4>Usage Statistics</h4>
                <div class="usage-stats">
                    <div class="stat-item">
                        <span class="stat-label">Total Requests:</span>
                        <span class="stat-value" id="model-requests">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Success Rate:</span>
                        <span class="stat-value" id="model-success-rate">0%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Avg Response Time:</span>
                        <span class="stat-value" id="model-avg-time">0ms</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>`;
    }

    /**
     * Get alerts page template
     */
    getAlertsTemplate() {
        return `<div class="alerts-page">
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
            <!-- Alert items will be inserted here -->
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
</div>`;
    }

    /**
     * Get settings page template
     */
    getSettingsTemplate() {
        return `<div class="settings-page">
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
</div>`;
    }

    /**
     * Render alert item
     */
    renderAlertItem(alert) {
        const levelClass = alert.level === 'critical' ? 'alert-critical' : 'alert-warning';
        const acknowledgedClass = alert.acknowledged ? 'alert-acknowledged' : '';

        return `
            <div class="alert-item ${levelClass} ${acknowledgedClass}" data-id="${alert.id}">
                <div class="alert-header">
                    <span class="alert-level">${alert.level.toUpperCase()}</span>
                    <span class="alert-timestamp">${new Date(alert.timestamp).toLocaleString()}</span>
                    ${!alert.acknowledged ? '<button class="btn btn-sm acknowledge-btn">Acknowledge</button>' : ''}
                </div>
                <div class="alert-message">${alert.message}</div>
                <div class="alert-details">${alert.details}</div>
            </div>
        `;
    }

    /**
     * Render provider card
     */
    renderProviderCard(provider) {
        const statusClass = provider.health?.status === 'healthy' ? 'status-healthy' :
                           provider.health?.status === 'unhealthy' ? 'status-unhealthy' : 'status-unknown';

        return `
            <div class="provider-card" data-provider="${provider.name}">
                <div class="provider-header">
                    <h4>${provider.name}</h4>
                    <span class="provider-status ${statusClass}">${provider.health?.status || 'unknown'}</span>
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
        `;
    }

    /**
     * Render model table row
     */
    renderModelRow(model) {
        const statusClass = model.status === 'available' ? 'status-available' :
                           model.status === 'unavailable' ? 'status-unavailable' : 'status-unknown';

        return `
            <tr data-model="${model.id}">
                <td>${model.id}</td>
                <td>${model.name || model.id}</td>
                <td>${model.provider}</td>
                <td><span class="status-badge ${statusClass}">${model.status}</span></td>
                <td>${model.capabilities?.join(', ') || 'N/A'}</td>
                <td>${model.contextLength || 'N/A'}</td>
                <td>${model.metrics?.lastUsed ? new Date(model.metrics.lastUsed).toLocaleDateString() : 'Never'}</td>
                <td>
                    <button class="btn btn-sm view-model">View</button>
                </td>
            </tr>
        `;
    }
}

module.exports = DashboardViews;