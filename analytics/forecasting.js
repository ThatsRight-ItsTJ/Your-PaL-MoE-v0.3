/**
 * Forecasting Engine
 * Analyzes usage patterns and generates forecasts for token usage, costs, and demand
 * Uses statistical models and machine learning techniques for prediction
 */

const logger = require('../utils/logger');

class ForecastingEngine {
    constructor(options = {}) {
        this.options = {
            retentionPeriod: options.retentionPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
            forecastHorizon: options.forecastHorizon || 30, // 30 days
            minDataPoints: options.minDataPoints || 7, // Minimum data points for forecasting
            confidenceInterval: options.confidenceInterval || 0.95, // 95% confidence
            seasonalityDetection: options.seasonalityDetection || true,
            ...options
        };

        // Storage for historical data and forecasts
        this.historicalData = new Map(); // metric -> time series data
        this.forecasts = new Map(); // metric -> forecast results
        this.models = new Map(); // metric -> trained models
        this.accuracyMetrics = new Map(); // metric -> accuracy statistics

        // Forecasting intervals
        this.forecastTimer = null;

        logger.info('ForecastingEngine initialized', this.options);
    }

    /**
     * Initialize the forecasting engine
     */
    async initialize() {
        this.startForecastTimer();
        logger.info('ForecastingEngine initialized successfully');
    }

    /**
     * Start periodic forecasting
     */
    startForecastTimer() {
        // Run forecasting daily
        this.forecastTimer = setInterval(() => {
            this.generateForecasts();
        }, 24 * 60 * 60 * 1000);

        // Generate initial forecasts
        setTimeout(() => this.generateForecasts(), 5000);
    }

    /**
     * Record data point for forecasting
     */
    async recordData(metric, value, timestamp = new Date(), metadata = {}) {
        if (!metric || typeof value !== 'number' || isNaN(value)) {
            logger.warn('Invalid forecast data', { metric, value });
            return;
        }

        if (!this.historicalData.has(metric)) {
            this.historicalData.set(metric, []);
        }

        const dataPoint = {
            timestamp: new Date(timestamp),
            value,
            metadata
        };

        this.historicalData.get(metric).push(dataPoint);

        // Keep only recent data (last 90 days)
        const cutoff = Date.now() - this.options.retentionPeriod;
        const filtered = this.historicalData.get(metric)
            .filter(point => point.timestamp.getTime() > cutoff);

        this.historicalData.set(metric, filtered);

        logger.debug('Recorded forecast data', { metric, value });
    }

    /**
     * Generate forecasts for all metrics
     */
    async generateForecasts() {
        try {
            logger.info('Generating forecasts...');

            const metrics = Array.from(this.historicalData.keys());

            for (const metric of metrics) {
                await this.generateMetricForecast(metric);
            }

            logger.info(`Generated forecasts for ${metrics.length} metrics`);

        } catch (error) {
            logger.error('Error generating forecasts', { error: error.message });
        }
    }

    /**
     * Generate forecast for a specific metric
     */
    async generateMetricForecast(metric) {
        const data = this.historicalData.get(metric);
        if (!data || data.length < this.options.minDataPoints) {
            logger.debug(`Insufficient data for forecasting ${metric}`, { dataPoints: data?.length || 0 });
            return;
        }

        try {
            // Sort data by timestamp
            data.sort((a, b) => a.timestamp - b.timestamp);

            // Detect seasonality and trends
            const analysis = this.analyzeTimeSeries(data);

            // Generate forecast based on analysis
            const forecast = this.computeForecast(data, analysis);

            // Calculate confidence intervals
            const confidenceIntervals = this.calculateConfidenceIntervals(forecast, data);

            // Store forecast
            this.forecasts.set(metric, {
                generated: new Date(),
                horizon: this.options.forecastHorizon,
                forecast,
                confidenceIntervals,
                analysis,
                metadata: {
                    dataPoints: data.length,
                    lastDataPoint: data[data.length - 1].timestamp,
                    model: analysis.model
                }
            });

            logger.debug(`Generated forecast for ${metric}`, {
                points: forecast.length,
                model: analysis.model
            });

        } catch (error) {
            logger.error(`Error forecasting ${metric}`, { error: error.message, stack: error.stack });
        }
    }

    /**
     * Analyze time series data
     */
    analyzeTimeSeries(data) {
        const values = data.map(d => d.value);
        const timestamps = data.map(d => d.timestamp.getTime());

        const analysis = {
            trend: this.detectTrend(values),
            seasonality: this.options.seasonalityDetection ? this.detectSeasonality(data) : null,
            volatility: this.calculateVolatility(values),
            model: this.selectBestModel(data)
        };

        // Calculate statistical properties
        analysis.mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        analysis.stdDev = Math.sqrt(
            values.reduce((sum, val) => sum + Math.pow(val - analysis.mean, 2), 0) / values.length
        );

        return analysis;
    }

    /**
     * Detect trend in time series
     */
    detectTrend(values) {
        if (values.length < 3) return { slope: 0, direction: 'stable' };

        // Simple linear regression
        const n = values.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((sum, y) => sum + y, 0);
        const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
        const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        let direction = 'stable';
        const slopeThreshold = Math.abs(analysis.mean * 0.01); // 1% of mean

        if (slope > slopeThreshold) direction = 'increasing';
        else if (slope < -slopeThreshold) direction = 'decreasing';

        return { slope, intercept, direction };
    }

    /**
     * Detect seasonality in data
     */
    detectSeasonality(data) {
        if (data.length < 14) return null; // Need at least 2 weeks

        // Check for daily patterns (24-hour cycles)
        const dailyPattern = this.detectPeriodicity(data, 24);

        // Check for weekly patterns (7-day cycles)
        const weeklyPattern = this.detectPeriodicity(data, 24 * 7);

        return {
            daily: dailyPattern,
            weekly: weeklyPattern,
            strength: Math.max(dailyPattern?.strength || 0, weeklyPattern?.strength || 0)
        };
    }

    /**
     * Detect periodicity in data
     */
    detectPeriodicity(data, periodHours) {
        const periodMs = periodHours * 60 * 60 * 1000;
        const values = data.map(d => d.value);

        // Simple autocorrelation
        const correlations = [];
        for (let lag = 1; lag <= Math.min(10, Math.floor(values.length / 2)); lag++) {
            const correlation = this.calculateCorrelation(values, lag);
            correlations.push({ lag, correlation });
        }

        const maxCorrelation = Math.max(...correlations.map(c => Math.abs(c.correlation)));
        const bestLag = correlations.find(c => Math.abs(c.correlation) === maxCorrelation);

        if (maxCorrelation > 0.3) { // Significant correlation threshold
            return {
                period: periodHours,
                strength: maxCorrelation,
                lag: bestLag.lag
            };
        }

        return null;
    }

    /**
     * Calculate correlation coefficient
     */
    calculateCorrelation(values, lag) {
        const n = values.length - lag;
        if (n < 2) return 0;

        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

        let numerator = 0;
        let sumX2 = 0;
        let sumY2 = 0;

        for (let i = 0; i < n; i++) {
            const x = values[i] - mean;
            const y = values[i + lag] - mean;
            numerator += x * y;
            sumX2 += x * x;
            sumY2 += y * y;
        }

        const denominator = Math.sqrt(sumX2 * sumY2);
        return denominator > 0 ? numerator / denominator : 0;
    }

    /**
     * Calculate volatility (standard deviation of changes)
     */
    calculateVolatility(values) {
        if (values.length < 2) return 0;

        const changes = [];
        for (let i = 1; i < values.length; i++) {
            changes.push(values[i] - values[i - 1]);
        }

        const meanChange = changes.reduce((sum, change) => sum + change, 0) / changes.length;
        const variance = changes.reduce((sum, change) => sum + Math.pow(change - meanChange, 2), 0) / changes.length;

        return Math.sqrt(variance);
    }

    /**
     * Select best forecasting model
     */
    selectBestModel(data) {
        const values = data.map(d => d.value);

        // Simple model selection based on data characteristics
        if (values.length < 10) {
            return 'naive'; // Simple last value
        }

        const trend = this.detectTrend(values);
        const hasSeasonality = this.detectSeasonality(data);

        if (hasSeasonality && hasSeasonality.strength > 0.5) {
            return 'seasonal_naive';
        } else if (Math.abs(trend.slope) > 0.01) {
            return 'linear_regression';
        } else {
            return 'moving_average';
        }
    }

    /**
     * Compute forecast using selected model
     */
    computeForecast(data, analysis) {
        const values = data.map(d => d.value);
        const forecast = [];

        switch (analysis.model) {
            case 'naive':
                return this.naiveForecast(values, this.options.forecastHorizon);

            case 'seasonal_naive':
                return this.seasonalNaiveForecast(data, analysis.seasonality, this.options.forecastHorizon);

            case 'linear_regression':
                return this.linearRegressionForecast(values, this.options.forecastHorizon);

            case 'moving_average':
                return this.movingAverageForecast(values, this.options.forecastHorizon);

            default:
                return this.naiveForecast(values, this.options.forecastHorizon);
        }
    }

    /**
     * Naive forecast (last value)
     */
    naiveForecast(values, horizon) {
        const lastValue = values[values.length - 1];
        return Array(horizon).fill(lastValue);
    }

    /**
     * Seasonal naive forecast
     */
    seasonalNaiveForecast(data, seasonality, horizon) {
        if (!seasonality || !seasonality.daily) return this.naiveForecast(data.map(d => d.value), horizon);

        const values = data.map(d => d.value);
        const period = seasonality.daily.period;
        const forecast = [];

        for (let i = 0; i < horizon; i++) {
            const seasonalIndex = (values.length - period + i) % period;
            forecast.push(values[values.length - period + seasonalIndex] || values[values.length - 1]);
        }

        return forecast;
    }

    /**
     * Linear regression forecast
     */
    linearRegressionForecast(values, horizon) {
        const n = values.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((sum, y) => sum + y, 0);
        const sumXY = values.reduce((sum, y, x) => sum + x * y, 0);
        const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const forecast = [];
        for (let i = 0; i < horizon; i++) {
            forecast.push(intercept + slope * (n + i));
        }

        return forecast;
    }

    /**
     * Moving average forecast
     */
    movingAverageForecast(values, horizon) {
        const windowSize = Math.min(7, Math.floor(values.length / 2));
        const movingAverage = values.slice(-windowSize).reduce((sum, val) => sum + val, 0) / windowSize;

        return Array(horizon).fill(movingAverage);
    }

    /**
     * Calculate confidence intervals
     */
    calculateConfidenceIntervals(forecast, historicalData) {
        const values = historicalData.map(d => d.value);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const stdDev = Math.sqrt(
            values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
        );

        // Use historical standard deviation as error estimate
        const zScore = 1.96; // 95% confidence interval
        const margin = zScore * stdDev;

        return forecast.map(point => ({
            lower: Math.max(0, point - margin),
            point,
            upper: point + margin
        }));
    }

    /**
     * Get forecast for a metric
     */
    getForecast(metric, horizon = this.options.forecastHorizon) {
        const forecast = this.forecasts.get(metric);
        if (!forecast) return null;

        // Check if forecast is still valid (generated within last 24 hours)
        const age = Date.now() - forecast.generated.getTime();
        if (age > 24 * 60 * 60 * 1000) {
            return null; // Forecast too old
        }

        return {
            ...forecast,
            forecast: forecast.forecast.slice(0, horizon),
            confidenceIntervals: forecast.confidenceIntervals.slice(0, horizon)
        };
    }

    /**
     * Get forecasts for multiple metrics
     */
    async getForecasts(filters = {}) {
        const results = {};

        for (const [metric, forecast] of this.forecasts) {
            if (filters.metric && !metric.includes(filters.metric)) continue;

            results[metric] = this.getForecast(metric, filters.horizon);
        }

        return results;
    }

    /**
     * Evaluate forecast accuracy
     */
    evaluateAccuracy(metric, actualValues) {
        const forecast = this.forecasts.get(metric);
        if (!forecast) return null;

        const predicted = forecast.forecast;
        const n = Math.min(predicted.length, actualValues.length);

        if (n === 0) return null;

        // Calculate MAPE (Mean Absolute Percentage Error)
        let sumAPE = 0;
        let validPoints = 0;

        for (let i = 0; i < n; i++) {
            if (actualValues[i] > 0) {
                const ape = Math.abs((actualValues[i] - predicted[i]) / actualValues[i]);
                sumAPE += ape;
                validPoints++;
            }
        }

        const mape = validPoints > 0 ? (sumAPE / validPoints) * 100 : 0;

        // Calculate RMSE (Root Mean Square Error)
        const mse = predicted.slice(0, n).reduce((sum, pred, i) =>
            sum + Math.pow(pred - actualValues[i], 2), 0) / n;
        const rmse = Math.sqrt(mse);

        const accuracy = {
            mape,
            rmse,
            accuracy: Math.max(0, 100 - mape), // Simple accuracy score
            evaluated: new Date(),
            dataPoints: n
        };

        this.accuracyMetrics.set(metric, accuracy);
        return accuracy;
    }

    /**
     * Get forecast accuracy metrics
     */
    getAccuracyMetrics(metric) {
        return this.accuracyMetrics.get(metric) || null;
    }

    /**
     * Get forecast insights and recommendations
     */
    getInsights(metric) {
        const forecast = this.getForecast(metric);
        const accuracy = this.getAccuracyMetrics(metric);

        if (!forecast) return null;

        const insights = {
            metric,
            trend: forecast.analysis.trend.direction,
            seasonality: forecast.analysis.seasonality,
            volatility: forecast.analysis.volatility,
            forecastQuality: accuracy ? this.interpretAccuracy(accuracy) : 'unknown',
            recommendations: this.generateRecommendations(forecast, accuracy)
        };

        return insights;
    }

    /**
     * Interpret forecast accuracy
     */
    interpretAccuracy(accuracy) {
        if (accuracy.mape <= 10) return 'excellent';
        if (accuracy.mape <= 20) return 'good';
        if (accuracy.mape <= 50) return 'fair';
        return 'poor';
    }

    /**
     * Generate forecast-based recommendations
     */
    generateRecommendations(forecast, accuracy) {
        const recommendations = [];

        // Trend-based recommendations
        if (forecast.analysis.trend.direction === 'increasing') {
            recommendations.push({
                type: 'capacity',
                priority: 'high',
                message: 'Usage trending upward - consider scaling resources',
                action: 'monitor_capacity'
            });
        }

        // Volatility recommendations
        if (forecast.analysis.volatility > forecast.analysis.mean * 0.5) {
            recommendations.push({
                type: 'stability',
                priority: 'medium',
                message: 'High usage volatility detected - implement buffering',
                action: 'add_buffering'
            });
        }

        // Accuracy-based recommendations
        if (accuracy && accuracy.accuracy < 70) {
            recommendations.push({
                type: 'model',
                priority: 'low',
                message: 'Forecast accuracy could be improved with more data',
                action: 'collect_more_data'
            });
        }

        return recommendations;
    }

    /**
     * Clean up old data
     */
    async cleanup(maxAge = this.options.retentionPeriod) {
        const cutoff = Date.now() - maxAge;
        let cleanedData = 0;
        let cleanedForecasts = 0;

        // Clean historical data
        for (const [metric, data] of this.historicalData) {
            const filtered = data.filter(point => point.timestamp.getTime() > cutoff);
            cleanedData += data.length - filtered.length;
            this.historicalData.set(metric, filtered);
        }

        // Clean old forecasts (older than 7 days)
        const forecastCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const [metric, forecast] of this.forecasts) {
            if (forecast.generated.getTime() < forecastCutoff) {
                this.forecasts.delete(metric);
                cleanedForecasts++;
            }
        }

        logger.info(`ForecastingEngine cleanup: removed ${cleanedData} data points and ${cleanedForecasts} old forecasts`);
        return { cleanedData, cleanedForecasts };
    }

    /**
     * Shutdown the forecasting engine
     */
    async shutdown() {
        if (this.forecastTimer) {
            clearInterval(this.forecastTimer);
            this.forecastTimer = null;
        }
        logger.info('ForecastingEngine shutdown complete');
    }
}

module.exports = ForecastingEngine;