/**
 * Report Generator
 * Generates comprehensive analytics reports in multiple formats
 * Supports PDF, CSV, JSON, and HTML report generation
 */

const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class ReportGenerator {
    constructor(options = {}) {
        this.options = {
            outputDir: options.outputDir || './reports',
            retentionPeriod: options.retentionPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
            enableCharts: options.enableCharts || true,
            chartLibrary: options.chartLibrary || 'chartjs', // chartjs, plotly, or none
            ...options
        };

        // Report templates and configurations
        this.templates = new Map();
        this.reportHistory = new Map(); // reportId -> metadata

        // Ensure output directory exists
        if (!fs.existsSync(this.options.outputDir)) {
            fs.mkdirSync(this.options.outputDir, { recursive: true });
        }

        logger.info('ReportGenerator initialized', this.options);
    }

    /**
     * Initialize the report generator
     */
    async initialize() {
        this.loadTemplates();
        logger.info('ReportGenerator initialized successfully');
    }

    /**
     * Load report templates
     */
    loadTemplates() {
        // Define report templates
        this.templates.set('usage_summary', {
            name: 'Usage Summary Report',
            type: 'summary',
            sections: ['overview', 'trends', 'top_users', 'provider_breakdown'],
            formats: ['pdf', 'html', 'json']
        });

        this.templates.set('cost_analysis', {
            name: 'Cost Analysis Report',
            type: 'financial',
            sections: ['cost_overview', 'optimization', 'forecast', 'recommendations'],
            formats: ['pdf', 'csv', 'json']
        });

        this.templates.set('performance_dashboard', {
            name: 'Performance Dashboard',
            type: 'dashboard',
            sections: ['metrics', 'alerts', 'forecasts', 'health_status'],
            formats: ['html', 'json']
        });

        this.templates.set('monthly_report', {
            name: 'Monthly Analytics Report',
            type: 'comprehensive',
            sections: ['executive_summary', 'usage_metrics', 'cost_analysis', 'forecasts', 'recommendations'],
            formats: ['pdf', 'html', 'json']
        });
    }

    /**
     * Generate a report
     */
    async generateReport(type, options = {}) {
        const template = this.templates.get(type);
        if (!template) {
            throw new Error(`Unknown report type: ${type}`);
        }

        const reportId = this.generateReportId(type);
        const startTime = Date.now();

        try {
            logger.info(`Generating ${type} report`, { reportId, options });

            // Gather data for the report
            const data = await this.gatherReportData(type, options);

            // Generate report in requested formats
            const formats = options.formats || template.formats;
            const results = {};

            for (const format of formats) {
                results[format] = await this.generateReportFormat(reportId, type, data, format, options);
            }

            // Store report metadata
            const metadata = {
                id: reportId,
                type,
                generated: new Date(),
                duration: Date.now() - startTime,
                formats: Object.keys(results),
                options,
                fileSize: this.calculateTotalSize(results)
            };

            this.reportHistory.set(reportId, metadata);

            logger.info(`Report ${reportId} generated successfully`, {
                duration: metadata.duration,
                formats: metadata.formats.length
            });

            return {
                reportId,
                metadata,
                files: results
            };

        } catch (error) {
            logger.error(`Failed to generate ${type} report`, { reportId, error: error.message });
            throw error;
        }
    }

    /**
     * Generate periodic reports
     */
    async generateHourlySummary(timestamp = new Date()) {
        const options = {
            period: 'hour',
            timestamp,
            formats: ['json']
        };

        return await this.generateReport('usage_summary', options);
    }

    async generateDailySummary(timestamp = new Date()) {
        const options = {
            period: 'day',
            timestamp,
            formats: ['json', 'html']
        };

        return await this.generateReport('usage_summary', options);
    }

    async generateWeeklySummary(timestamp = new Date()) {
        const options = {
            period: 'week',
            timestamp,
            formats: ['pdf', 'html', 'json']
        };

        return await this.generateReport('cost_analysis', options);
    }

    /**
     * Gather data for report generation
     */
    async gatherReportData(type, options) {
        // This would integrate with the analytics engine to gather data
        // For now, return mock data structure
        const data = {
            generated: new Date(),
            period: options.period || 'custom',
            timestamp: options.timestamp || new Date(),
            summary: {
                totalRequests: 0,
                totalTokens: 0,
                totalCost: 0,
                activeUsers: 0,
                activeProviders: 0
            },
            trends: [],
            breakdowns: {},
            forecasts: {},
            recommendations: []
        };

        // In a real implementation, this would call analytics engine methods
        // data.summary = await this.analyticsEngine.getSummaryStats(options);
        // data.trends = await this.analyticsEngine.getUsageTrends(options);
        // etc.

        return data;
    }

    /**
     * Generate report in specific format
     */
    async generateReportFormat(reportId, type, data, format, options) {
        const fileName = `${reportId}_${type}.${format}`;
        const filePath = path.join(this.options.outputDir, fileName);

        switch (format) {
            case 'json':
                return await this.generateJSONReport(data, filePath);

            case 'csv':
                return await this.generateCSVReport(data, filePath, type);

            case 'html':
                return await this.generateHTMLReport(data, filePath, type, options);

            case 'pdf':
                return await this.generatePDFReport(data, filePath, type, options);

            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }

    /**
     * Generate JSON report
     */
    async generateJSONReport(data, filePath) {
        const jsonContent = JSON.stringify(data, null, 2);
        fs.writeFileSync(filePath, jsonContent);

        return {
            path: filePath,
            size: jsonContent.length,
            format: 'json'
        };
    }

    /**
     * Generate CSV report
     */
    async generateCSVReport(data, filePath, type) {
        let csvContent = '';

        // Generate CSV based on report type
        switch (type) {
            case 'cost_analysis':
                csvContent = this.generateCostAnalysisCSV(data);
                break;

            case 'usage_summary':
                csvContent = this.generateUsageSummaryCSV(data);
                break;

            default:
                csvContent = this.generateGenericCSV(data);
        }

        fs.writeFileSync(filePath, csvContent);

        return {
            path: filePath,
            size: csvContent.length,
            format: 'csv'
        };
    }

    /**
     * Generate cost analysis CSV
     */
    generateCostAnalysisCSV(data) {
        let csv = 'Date,Cost,Tokens,Requests,Average Cost Per Token\n';

        if (data.trends && data.trends.length > 0) {
            data.trends.forEach(trend => {
                csv += `${trend.date || trend.timestamp},${trend.cost || 0},${trend.tokens || 0},${trend.requests || 0},${trend.cost && trend.tokens ? (trend.cost / trend.tokens).toFixed(6) : 0}\n`;
            });
        }

        return csv;
    }

    /**
     * Generate usage summary CSV
     */
    generateUsageSummaryCSV(data) {
        let csv = 'Metric,Value,Unit\n';
        csv += `Total Requests,${data.summary?.totalRequests || 0},count\n`;
        csv += `Total Tokens,${data.summary?.totalTokens || 0},tokens\n`;
        csv += `Total Cost,${data.summary?.totalCost || 0},USD\n`;
        csv += `Active Users,${data.summary?.activeUsers || 0},count\n`;
        csv += `Active Providers,${data.summary?.activeProviders || 0},count\n`;

        return csv;
    }

    /**
     * Generate generic CSV
     */
    generateGenericCSV(data) {
        let csv = 'Key,Value\n';

        const flatten = (obj, prefix = '') => {
            const result = [];
            for (const [key, value] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}.${key}` : key;
                if (typeof value === 'object' && value !== null) {
                    result.push(...flatten(value, fullKey));
                } else {
                    result.push([fullKey, value]);
                }
            }
            return result;
        };

        const flattened = flatten(data);
        flattened.forEach(([key, value]) => {
            csv += `${key},${value}\n`;
        });

        return csv;
    }

    /**
     * Generate HTML report
     */
    async generateHTMLReport(data, filePath, type, options) {
        const htmlContent = this.generateHTMLContent(data, type, options);
        fs.writeFileSync(filePath, htmlContent);

        return {
            path: filePath,
            size: htmlContent.length,
            format: 'html'
        };
    }

    /**
     * Generate HTML content
     */
    generateHTMLContent(data, type, options) {
        const title = this.templates.get(type)?.name || 'Analytics Report';

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e8f4fd; border-radius: 5px; }
        .chart { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f5f5f5; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
        <p>Generated: ${data.generated?.toISOString() || new Date().toISOString()}</p>
        <p>Period: ${data.period || 'N/A'}</p>
    </div>

    ${this.generateHTMLSections(data, type)}

    <div class="section">
        <h2>Report Information</h2>
        <p>This report was automatically generated by the Analytics Engine.</p>
    </div>
</body>
</html>`;
    }

    /**
     * Generate HTML sections
     */
    generateHTMLSections(data, type) {
        let sections = '';

        // Summary section
        if (data.summary) {
            sections += `
    <div class="section">
        <h2>Summary</h2>
        <div class="metric">
            <strong>Total Requests:</strong> ${data.summary.totalRequests || 0}
        </div>
        <div class="metric">
            <strong>Total Tokens:</strong> ${data.summary.totalTokens || 0}
        </div>
        <div class="metric">
            <strong>Total Cost:</strong> $${(data.summary.totalCost || 0).toFixed(2)}
        </div>
        <div class="metric">
            <strong>Active Users:</strong> ${data.summary.activeUsers || 0}
        </div>
    </div>`;
        }

        // Trends section
        if (data.trends && data.trends.length > 0) {
            sections += `
    <div class="section">
        <h2>Usage Trends</h2>
        <div class="chart">
            <p>Chart would be displayed here with ${data.trends.length} data points</p>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Period</th>
                    <th>Requests</th>
                    <th>Tokens</th>
                    <th>Cost</th>
                </tr>
            </thead>
            <tbody>
                ${data.trends.slice(0, 10).map(trend => `
                <tr>
                    <td>${trend.period || trend.date || 'N/A'}</td>
                    <td>${trend.requests || 0}</td>
                    <td>${trend.tokens || 0}</td>
                    <td>$${(trend.cost || 0).toFixed(2)}</td>
                </tr>`).join('')}
            </tbody>
        </table>
    </div>`;
        }

        // Recommendations section
        if (data.recommendations && data.recommendations.length > 0) {
            sections += `
    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${data.recommendations.map(rec => `
            <li><strong>${rec.type}:</strong> ${rec.message}</li>`).join('')}
        </ul>
    </div>`;
        }

        return sections;
    }

    /**
     * Generate PDF report
     */
    async generatePDFReport(data, filePath, type, options) {
        // In a real implementation, this would use a PDF library like puppeteer or pdfkit
        // For now, create a simple text-based PDF placeholder
        const pdfContent = `
Analytics Report: ${this.templates.get(type)?.name || 'Unknown'}
Generated: ${data.generated?.toISOString() || new Date().toISOString()}

SUMMARY:
- Total Requests: ${data.summary?.totalRequests || 0}
- Total Tokens: ${data.summary?.totalTokens || 0}
- Total Cost: $${(data.summary?.totalCost || 0).toFixed(2)}
- Active Users: ${data.summary?.activeUsers || 0}

This is a placeholder PDF. In a real implementation, this would generate a properly formatted PDF document.
`;

        fs.writeFileSync(filePath, pdfContent);

        return {
            path: filePath,
            size: pdfContent.length,
            format: 'pdf'
        };
    }

    /**
     * Export data in various formats
     */
    async exportData(format, options = {}) {
        const data = await this.gatherReportData('full_export', options);

        switch (format) {
            case 'json':
                return JSON.stringify(data, null, 2);

            case 'csv':
                return this.generateGenericCSV(data);

            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Generate unique report ID
     */
    generateReportId(type) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${type}_${timestamp}_${random}`;
    }

    /**
     * Calculate total file size
     */
    calculateTotalSize(results) {
        return Object.values(results).reduce((total, result) => total + (result.size || 0), 0);
    }

    /**
     * Get report history
     */
    getReportHistory(limit = 50) {
        const history = Array.from(this.reportHistory.values())
            .sort((a, b) => b.generated - a.generated)
            .slice(0, limit);

        return history;
    }

    /**
     * Get report by ID
     */
    getReport(reportId) {
        return this.reportHistory.get(reportId) || null;
    }

    /**
     * Clean up old reports
     */
    async cleanup(maxAge = this.options.retentionPeriod) {
        const cutoff = Date.now() - maxAge;
        let cleanedReports = 0;
        let cleanedFiles = 0;

        // Remove old report metadata
        for (const [reportId, metadata] of this.reportHistory) {
            if (metadata.generated.getTime() < cutoff) {
                this.reportHistory.delete(reportId);
                cleanedReports++;

                // Remove associated files
                for (const format of metadata.formats) {
                    const fileName = `${reportId}_${metadata.type}.${format}`;
                    const filePath = path.join(this.options.outputDir, fileName);

                    try {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                            cleanedFiles++;
                        }
                    } catch (error) {
                        logger.warn(`Failed to remove old report file: ${filePath}`, { error: error.message });
                    }
                }
            }
        }

        logger.info(`ReportGenerator cleanup: removed ${cleanedReports} reports and ${cleanedFiles} files`);
        return { cleanedReports, cleanedFiles };
    }

    /**
     * Shutdown the report generator
     */
    async shutdown() {
        logger.info('ReportGenerator shutdown complete');
    }
}

module.exports = ReportGenerator;