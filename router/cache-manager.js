/**
 * Cache Manager for Intelligent Router
 * Handles caching of routing decisions and model responses
 * Provides cache hit evaluation and management
 */

const logger = require('../utils/logger');

class CacheManager {
    constructor(options = {}) {
        this.cache = new Map();
        this.config = {
            maxSize: options.maxSize || 10000,
            ttl: options.ttl || 24 * 60 * 60 * 1000, // 24 hours default
            cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1 hour
            enableCompression: options.enableCompression || false
        };

        // Cache statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            evictions: 0,
            size: 0,
            lastCleanup: new Date()
        };

        // Start cleanup interval
        this.startCleanupInterval();

        logger.info('CacheManager initialized', { config: this.config });
    }

    /**
     * Get cached value by key
     */
    async get(key) {
        try {
            const entry = this.cache.get(key);

            if (!entry) {
                this.stats.misses++;
                return null;
            }

            // Check if expired
            if (this.isExpired(entry)) {
                await this.delete(key);
                this.stats.misses++;
                return null;
            }

            this.stats.hits++;
            return entry.value;
        } catch (error) {
            logger.error('Cache get failed', { key, error: error.message });
            this.stats.misses++;
            return null;
        }
    }

    /**
     * Set cache value with key
     */
    async set(key, value, options = {}) {
        try {
            const ttl = options.ttl || this.config.ttl;
            const entry = {
                value,
                timestamp: Date.now(),
                expires: Date.now() + ttl,
                accessCount: 0,
                lastAccessed: Date.now()
            };

            // Check cache size limit
            if (this.cache.size >= this.config.maxSize) {
                await this.evictEntries();
            }

            this.cache.set(key, entry);
            this.stats.sets++;
            this.stats.size = this.cache.size;

            logger.debug('Cache set', { key, ttl });
        } catch (error) {
            logger.error('Cache set failed', { key, error: error.message });
        }
    }

    /**
     * Delete cache entry
     */
    async delete(key) {
        try {
            const deleted = this.cache.delete(key);
            if (deleted) {
                this.stats.deletes++;
                this.stats.size = this.cache.size;
            }
            return deleted;
        } catch (error) {
            logger.error('Cache delete failed', { key, error: error.message });
            return false;
        }
    }

    /**
     * Check if key exists and is not expired
     */
    async has(key) {
        const entry = this.cache.get(key);
        return entry && !this.isExpired(entry);
    }

    /**
     * Clear all cache entries
     */
    async clear() {
        this.cache.clear();
        this.stats.size = 0;
        this.stats.lastCleanup = new Date();
        logger.info('Cache cleared');
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? this.stats.hits / (this.stats.hits + this.stats.misses)
            : 0;

        return {
            ...this.stats,
            hitRate,
            totalRequests: this.stats.hits + this.stats.misses,
            utilization: this.cache.size / this.config.maxSize
        };
    }

    /**
     * Check if cache entry is expired
     */
    isExpired(entry) {
        return Date.now() > entry.expires;
    }

    /**
     * Evict entries when cache is full (LRU strategy)
     */
    async evictEntries() {
        try {
            // Sort entries by last accessed time (oldest first)
            const entries = Array.from(this.cache.entries())
                .map(([key, entry]) => ({ key, entry }))
                .sort((a, b) => a.entry.lastAccessed - b.entry.lastAccessed);

            // Remove oldest 10% of entries
            const toEvict = Math.ceil(this.config.maxSize * 0.1);
            for (let i = 0; i < toEvict && entries.length > 0; i++) {
                const { key } = entries.shift();
                this.cache.delete(key);
                this.stats.evictions++;
            }

            logger.debug('Cache eviction completed', { evicted: toEvict });
        } catch (error) {
            logger.error('Cache eviction failed', { error: error.message });
        }
    }

    /**
     * Start periodic cleanup of expired entries
     */
    startCleanupInterval() {
        this.cleanupTimer = setInterval(async () => {
            await this.cleanup();
        }, this.config.cleanupInterval);
    }

    /**
     * Stop cleanup interval
     */
    stopCleanupInterval() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Manual cleanup of expired entries
     */
    async cleanup() {
        try {
            const now = Date.now();
            let cleaned = 0;

            for (const [key, entry] of this.cache.entries()) {
                if (this.isExpired(entry)) {
                    this.cache.delete(key);
                    cleaned++;
                }
            }

            this.stats.size = this.cache.size;
            this.stats.lastCleanup = new Date();

            if (cleaned > 0) {
                logger.debug('Cache cleanup completed', { cleaned });
            }
        } catch (error) {
            logger.error('Cache cleanup failed', { error: error.message });
        }
    }

    /**
     * Generate routing cache key
     */
    generateRoutingKey(request, userContext = {}) {
        const keyData = {
            capabilities: (request.capabilities || []).sort(),
            modelPreferences: (request.modelPreferences || []).sort(),
            userId: userContext.userId || 'anonymous',
            plan: userContext.plan || 'free'
        };

        return `route:${JSON.stringify(keyData)}`;
    }

    /**
     * Generate response cache key
     */
    generateResponseKey(request, modelId) {
        const keyData = {
            modelId,
            prompt: this.hashPrompt(request.prompt),
            parameters: request.parameters || {}
        };

        return `response:${JSON.stringify(keyData)}`;
    }

    /**
     * Cache routing decision
     */
    async cacheRoutingDecision(request, decision, userContext = {}) {
        const key = this.generateRoutingKey(request, userContext);
        const value = {
            decision,
            timestamp: new Date().toISOString(),
            ttl: this.config.ttl
        };

        await this.set(key, value);
    }

    /**
     * Get cached routing decision
     */
    async getCachedRoutingDecision(request, userContext = {}) {
        const key = this.generateRoutingKey(request, userContext);
        return await this.get(key);
    }

    /**
     * Cache model response
     */
    async cacheResponse(request, modelId, response) {
        const key = this.generateResponseKey(request, modelId);
        const value = {
            response,
            timestamp: new Date().toISOString(),
            modelId,
            ttl: this.config.ttl
        };

        await this.set(key, value);
    }

    /**
     * Get cached response
     */
    async getCachedResponse(request, modelId) {
        const key = this.generateResponseKey(request, modelId);
        const cached = await this.get(key);

        if (cached) {
            // Update access statistics
            const entry = this.cache.get(key);
            if (entry) {
                entry.accessCount++;
                entry.lastAccessed = Date.now();
            }
        }

        return cached;
    }

    /**
     * Check if request should be cached
     */
    shouldCache(request) {
        // Don't cache requests with sensitive data
        if (request.containsSensitiveData) return false;

        // Don't cache very large prompts
        if (request.prompt && request.prompt.length > 10000) return false;

        // Don't cache requests with custom parameters that might vary
        if (request.parameters && Object.keys(request.parameters).length > 10) return false;

        return true;
    }

    /**
     * Hash prompt for cache key (simple hash for privacy)
     */
    hashPrompt(prompt) {
        if (!prompt) return '';

        // Simple hash function for cache key
        let hash = 0;
        for (let i = 0; i < prompt.length; i++) {
            const char = prompt.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        return hash.toString();
    }

    /**
     * Get cache performance metrics
     */
    getPerformanceMetrics() {
        const stats = this.getStats();
        const totalRequests = stats.totalRequests;

        return {
            hitRate: stats.hitRate,
            totalRequests,
            cacheSize: stats.size,
            maxSize: this.config.maxSize,
            utilizationPercent: (stats.size / this.config.maxSize) * 100,
            averageAccessTime: 0, // Would need timing measurements
            evictionRate: totalRequests > 0 ? stats.evictions / totalRequests : 0
        };
    }

    /**
     * Export cache data for backup
     */
    exportCache() {
        const data = {
            entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
                key,
                value: entry.value,
                timestamp: entry.timestamp,
                expires: entry.expires
            })),
            stats: this.stats,
            config: this.config,
            exported_at: new Date().toISOString()
        };

        return data;
    }

    /**
     * Import cache data from backup
     */
    async importCache(data) {
        try {
            if (!data.entries || !Array.isArray(data.entries)) {
                throw new Error('Invalid cache data format');
            }

            let imported = 0;
            const now = Date.now();

            for (const item of data.entries) {
                // Skip expired entries
                if (item.expires < now) continue;

                const entry = {
                    value: item.value,
                    timestamp: item.timestamp,
                    expires: item.expires,
                    accessCount: 0,
                    lastAccessed: now
                };

                this.cache.set(item.key, entry);
                imported++;
            }

            this.stats.size = this.cache.size;
            logger.info('Cache import completed', { imported });

            return { imported };
        } catch (error) {
            logger.error('Cache import failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Configure cache settings
     */
    configure(newConfig) {
        this.config = { ...this.config, ...newConfig };

        if (newConfig.cleanupInterval !== undefined) {
            this.stopCleanupInterval();
            this.startCleanupInterval();
        }

        logger.info('CacheManager configuration updated', this.config);
    }

    /**
     * Destroy cache manager
     */
    destroy() {
        this.stopCleanupInterval();
        this.clear();
        logger.info('CacheManager destroyed');
    }
}

module.exports = CacheManager;