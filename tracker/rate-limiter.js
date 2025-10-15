/**
 * Rate Limit Tracker
 * Tracks rate limits per provider and manages quota usage
 * Implements adaptive throttling and quota management
 */

const logger = require('../utils/logger');

class RateLimiter {
    constructor(providerManager) {
        this.providerManager = providerManager;

        // Rate limit storage
        this.rateLimits = new Map(); // providerName -> rateLimitConfig
        this.usageHistory = new Map(); // providerName -> usageRecords[]
        this.currentUsage = new Map(); // providerName -> currentUsage

        // Configuration
        this.config = {
            defaultLimits: {
                requests_per_minute: 60,
                tokens_per_minute: 100000,
                concurrent_requests: 5
            },
            safetyBuffer: 0.8, // 80% of limit
            backoffMultiplier: 2,
            minBackoffDelay: 1000, // 1 second
            maxBackoffDelay: 300000, // 5 minutes
            historyRetention: 24 * 60 * 60 * 1000, // 24 hours
            enableAdaptiveThrottling: true
        };

        // Statistics
        this.stats = {
            totalRequests: 0,
            throttledRequests: 0,
            rateLimitHits: 0,
            quotaExhaustions: 0,
            averageRequestRate: 0,
            providersLimited: 0
        };

        logger.info('RateLimiter initialized');
    }

    /**
     * Initialize rate limits for all providers
     */
    async initialize() {
        try {
            const providers = this.providerManager.getFilteredProviders();

            for (const provider of providers) {
                const providerName = provider.name || provider.provider_name;
                this.initializeProviderLimits(provider);
            }

            this.stats.providersLimited = providers.length;
            logger.info(`Initialized rate limits for ${providers.length} providers`);

        } catch (error) {
            logger.error(`RateLimiter initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Initialize rate limits for a specific provider
     */
    initializeProviderLimits(provider) {
        const providerName = provider.name || provider.provider_name;

        // Get provider-specific rate limits
        const providerLimits = provider.rate_limit || {};

        const rateLimitConfig = {
            provider: providerName,
            limits: {
                requests_per_minute: providerLimits.requests_per_minute || this.config.defaultLimits.requests_per_minute,
                tokens_per_minute: providerLimits.tokens_per_minute || this.config.defaultLimits.tokens_per_minute,
                concurrent_requests: providerLimits.concurrent_requests || this.config.defaultLimits.concurrent_requests
            },
            current: {
                requests_this_minute: 0,
                tokens_this_minute: 0,
                active_requests: 0,
                minute_start: Date.now()
            },
            backoff: {
                delay: 0,
                until: null,
                consecutive_hits: 0
            },
            adaptive: {
                enabled: this.config.enableAdaptiveThrottling,
                adjustment_factor: 1.0,
                last_adjustment: null
            }
        };

        this.rateLimits.set(providerName, rateLimitConfig);
        this.currentUsage.set(providerName, {
            requests_this_minute: 0,
            tokens_this_minute: 0,
            active_requests: 0,
            minute_start: Date.now()
        });

        logger.debug(`Initialized rate limits for ${providerName}`);
    }

    /**
     * Check if a request can be made to a provider
     */
    async canMakeRequest(providerName, estimatedTokens = 0) {
        const limits = this.rateLimits.get(providerName);
        if (!limits) {
            logger.warn(`No rate limits configured for provider: ${providerName}`);
            return { allowed: true, reason: 'no_limits_configured' };
        }

        // Check backoff
        if (limits.backoff.until && Date.now() < limits.backoff.until) {
            const remaining = Math.ceil((limits.backoff.until - Date.now()) / 1000);
            return {
                allowed: false,
                reason: 'backoff_active',
                retryAfter: remaining,
                backoffDelay: limits.backoff.delay
            };
        }

        // Reset counters if minute has passed
        this.resetMinuteCountersIfNeeded(providerName);

        const current = this.currentUsage.get(providerName);

        // Check concurrent requests
        if (current.active_requests >= limits.limits.concurrent_requests) {
            return {
                allowed: false,
                reason: 'concurrent_limit_exceeded',
                current: current.active_requests,
                limit: limits.limits.concurrent_requests
            };
        }

        // Check requests per minute (with safety buffer)
        const requestLimit = Math.floor(limits.limits.requests_per_minute * this.config.safetyBuffer);
        if (current.requests_this_minute >= requestLimit) {
            return {
                allowed: false,
                reason: 'request_limit_exceeded',
                current: current.requests_this_minute,
                limit: requestLimit
            };
        }

        // Check tokens per minute (with safety buffer)
        const tokenLimit = Math.floor(limits.limits.tokens_per_minute * this.config.safetyBuffer);
        if (current.tokens_this_minute + estimatedTokens > tokenLimit) {
            return {
                allowed: false,
                reason: 'token_limit_exceeded',
                current: current.tokens_this_minute,
                requested: estimatedTokens,
                limit: tokenLimit
            };
        }

        return { allowed: true };
    }

    /**
     * Record a request attempt
     */
    async recordRequest(providerName, tokensUsed = 0, success = true) {
        const limits = this.rateLimits.get(providerName);
        if (!limits) return;

        this.stats.totalRequests++;

        // Reset counters if needed
        this.resetMinuteCountersIfNeeded(providerName);

        const current = this.currentUsage.get(providerName);

        if (success) {
            current.requests_this_minute++;
            current.tokens_this_minute += tokensUsed;
            current.active_requests = Math.max(0, current.active_requests + 1);

            // Record usage history
            this.recordUsageHistory(providerName, {
                timestamp: new Date(),
                tokens_used: tokensUsed,
                success: true
            });
        } else {
            // Handle rate limit hit
            this.handleRateLimitHit(providerName);
        }
    }

    /**
     * Record request completion
     */
    async recordRequestCompletion(providerName, tokensUsed = 0) {
        const current = this.currentUsage.get(providerName);
        if (current) {
            current.active_requests = Math.max(0, current.active_requests - 1);
            current.tokens_this_minute += tokensUsed;

            // Record usage history
            this.recordUsageHistory(providerName, {
                timestamp: new Date(),
                tokens_used: tokensUsed,
                success: true,
                completion: true
            });
        }
    }

    /**
     * Handle rate limit hit
     */
    handleRateLimitHit(providerName) {
        const limits = this.rateLimits.get(providerName);
        if (!limits) return;

        this.stats.rateLimitHits++;
        limits.backoff.consecutive_hits++;

        // Calculate backoff delay
        const baseDelay = this.config.minBackoffDelay;
        const multiplier = Math.pow(this.config.backoffMultiplier, limits.backoff.consecutive_hits - 1);
        const backoffDelay = Math.min(
            baseDelay * multiplier,
            this.config.maxBackoffDelay
        );

        limits.backoff.delay = backoffDelay;
        limits.backoff.until = Date.now() + backoffDelay;

        logger.warn(`Rate limit hit for ${providerName}, backing off for ${Math.round(backoffDelay/1000)}s`);

        // Record in history
        this.recordUsageHistory(providerName, {
            timestamp: new Date(),
            success: false,
            rate_limit_hit: true,
            backoff_delay: backoffDelay
        });
    }

    /**
     * Reset backoff for a provider
     */
    resetBackoff(providerName) {
        const limits = this.rateLimits.get(providerName);
        if (limits) {
            limits.backoff.delay = 0;
            limits.backoff.until = null;
            limits.backoff.consecutive_hits = 0;
            logger.info(`Reset backoff for ${providerName}`);
        }
    }

    /**
     * Reset minute counters if needed
     */
    resetMinuteCountersIfNeeded(providerName) {
        const current = this.currentUsage.get(providerName);
        if (!current) return;

        const now = Date.now();
        const minutesElapsed = (now - current.minute_start) / (60 * 1000);

        if (minutesElapsed >= 1) {
            // Reset counters
            current.requests_this_minute = 0;
            current.tokens_this_minute = 0;
            current.minute_start = now;

            // Reset backoff if successful requests were made
            const limits = this.rateLimits.get(providerName);
            if (limits && limits.backoff.consecutive_hits > 0) {
                // Gradually reduce consecutive hits
                limits.backoff.consecutive_hits = Math.max(0, limits.backoff.consecutive_hits - 1);
            }
        }
    }

    /**
     * Record usage history
     */
    recordUsageHistory(providerName, record) {
        if (!this.usageHistory.has(providerName)) {
            this.usageHistory.set(providerName, []);
        }

        const history = this.usageHistory.get(providerName);
        history.push(record);

        // Maintain history size (keep last 1000 records per provider)
        if (history.length > 1000) {
            history.shift();
        }
    }

    /**
     * Get current rate limit status for a provider
     */
    getProviderStatus(providerName) {
        const limits = this.rateLimits.get(providerName);
        const current = this.currentUsage.get(providerName);

        if (!limits || !current) {
            return null;
        }

        // Reset counters if needed
        this.resetMinuteCountersIfNeeded(providerName);

        const now = Date.now();
        const backoffActive = limits.backoff.until && now < limits.backoff.until;

        return {
            provider: providerName,
            limits: limits.limits,
            current: {
                requests_this_minute: current.requests_this_minute,
                tokens_this_minute: current.tokens_this_minute,
                active_requests: current.active_requests
            },
            utilization: {
                request_utilization: current.requests_this_minute / limits.limits.requests_per_minute,
                token_utilization: current.tokens_this_minute / limits.limits.tokens_per_minute,
                concurrent_utilization: current.active_requests / limits.limits.concurrent_requests
            },
            backoff: {
                active: backoffActive,
                delay: limits.backoff.delay,
                until: limits.backoff.until,
                consecutive_hits: limits.backoff.consecutive_hits
            },
            adaptive: limits.adaptive
        };
    }

    /**
     * Get usage history for a provider
     */
    getUsageHistory(providerName, hours = 1) {
        const history = this.usageHistory.get(providerName) || [];
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);

        return history.filter(record => record.timestamp.getTime() > cutoff);
    }

    /**
     * Get usage statistics for a provider
     */
    getProviderStats(providerName, hours = 24) {
        const history = this.getUsageHistory(providerName, hours);

        if (history.length === 0) {
            return {
                provider: providerName,
                period_hours: hours,
                total_requests: 0,
                successful_requests: 0,
                failed_requests: 0,
                rate_limit_hits: 0,
                total_tokens: 0,
                average_tokens_per_request: 0
            };
        }

        const successful = history.filter(h => h.success).length;
        const failed = history.filter(h => !h.success).length;
        const rateLimitHits = history.filter(h => h.rate_limit_hit).length;
        const totalTokens = history.reduce((sum, h) => sum + (h.tokens_used || 0), 0);
        const avgTokens = successful > 0 ? totalTokens / successful : 0;

        return {
            provider: providerName,
            period_hours: hours,
            total_requests: history.length,
            successful_requests: successful,
            failed_requests: failed,
            rate_limit_hits: rateLimitHits,
            total_tokens: totalTokens,
            average_tokens_per_request: avgTokens,
            success_rate: history.length > 0 ? successful / history.length : 0
        };
    }

    /**
     * Get global rate limiter statistics
     */
    getStats() {
        const providers = Array.from(this.rateLimits.keys());
        const providerStats = providers.map(p => this.getProviderStats(p, 1)); // Last hour

        const totalRequests = providerStats.reduce((sum, s) => sum + s.total_requests, 0);
        const totalRateLimitHits = providerStats.reduce((sum, s) => sum + s.rate_limit_hits, 0);
        const averageSuccessRate = providerStats.length > 0 ?
            providerStats.reduce((sum, s) => sum + s.success_rate, 0) / providerStats.length : 0;

        return {
            ...this.stats,
            providersTracked: providers.length,
            totalRequestsLastHour: totalRequests,
            rateLimitHitsLastHour: totalRateLimitHits,
            averageSuccessRate,
            providersWithBackoff: providers.filter(p => {
                const status = this.getProviderStatus(p);
                return status && status.backoff.active;
            }).length
        };
    }

    /**
     * Update rate limits for a provider
     */
    updateProviderLimits(providerName, newLimits) {
        const limits = this.rateLimits.get(providerName);
        if (!limits) {
            throw new Error(`Provider not found: ${providerName}`);
        }

        // Update limits
        Object.assign(limits.limits, newLimits);

        // Reset backoff if limits increased
        if (newLimits.requests_per_minute > limits.limits.requests_per_minute ||
            newLimits.tokens_per_minute > limits.limits.tokens_per_minute) {
            this.resetBackoff(providerName);
        }

        logger.info(`Updated rate limits for ${providerName}`, newLimits);
    }

    /**
     * Clean up old usage history
     */
    cleanup(maxAge = this.config.historyRetention) {
        const cutoff = Date.now() - maxAge;
        let cleaned = 0;

        for (const [provider, history] of this.usageHistory) {
            const filtered = history.filter(record => record.timestamp.getTime() > cutoff);
            cleaned += history.length - filtered.length;
            this.usageHistory.set(provider, filtered);
        }

        logger.info(`Cleaned up ${cleaned} old usage records`);
        return cleaned;
    }

    /**
     * Configure rate limiter settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('RateLimiter configuration updated', this.config);
    }

    /**
     * Reset rate limiter state
     */
    reset() {
        this.rateLimits.clear();
        this.usageHistory.clear();
        this.currentUsage.clear();
        this.stats = {
            totalRequests: 0,
            throttledRequests: 0,
            rateLimitHits: 0,
            quotaExhaustions: 0,
            averageRequestRate: 0,
            providersLimited: 0
        };
        logger.info('RateLimiter state reset');
    }
}

module.exports = RateLimiter;