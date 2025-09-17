const logger = require('./logger');

/**
 * Performance optimization utilities
 */

/**
 * HTTP Client with connection pooling and caching
 */
class HttpClient {
    constructor(options = {}) {
        this.timeout = options.timeout || 30000;
        this.maxConcurrent = options.maxConcurrent || 10;
        this.cache = new Map();
        this.cacheTimeout = options.cacheTimeout || 300000; // 5 minutes
        this.activeRequests = 0;
        this.requestQueue = [];
        
        // Cache node-fetch import
        this.fetch = null;
        this.initFetch();
    }
    
    /**
     * Initialize fetch with caching
     */
    async initFetch() {
        if (!this.fetch) {
            try {
                const { default: fetch } = await import('node-fetch');
                this.fetch = fetch;
            } catch (error) {
                logger.error('Failed to import node-fetch', { error: error.message });
                throw error;
            }
        }
    }
    
    /**
     * Make HTTP request with connection pooling
     */
    async request(url, options = {}) {
        await this.initFetch();
        
        // Check cache first
        const cacheKey = this.getCacheKey(url, options);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            return cached;
        }
        
        // Queue request if at max concurrency
        if (this.activeRequests >= this.maxConcurrent) {
            return new Promise((resolve, reject) => {
                this.requestQueue.push({ url, options, resolve, reject });
            });
        }
        
        return this.executeRequest(url, options, cacheKey);
    }
    
    /**
     * Execute HTTP request
     */
    async executeRequest(url, options, cacheKey) {
        this.activeRequests++;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);
            
            const response = await this.fetch(url, {
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Cache successful responses
            this.setCache(cacheKey, data);
            
            return data;
        } catch (error) {
            logger.error('HTTP request failed', { url, error: error.message });
            throw error;
        } finally {
            this.activeRequests--;
            this.processQueue();
        }
    }
    
    /**
     * Process queued requests
     */
    processQueue() {
        if (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrent) {
            const { url, options, resolve, reject } = this.requestQueue.shift();
            const cacheKey = this.getCacheKey(url, options);
            
            this.executeRequest(url, options, cacheKey)
                .then(resolve)
                .catch(reject);
        }
    }
    
    /**
     * Generate cache key
     */
    getCacheKey(url, options) {
        const key = `${url}:${JSON.stringify(options.method || 'GET')}:${JSON.stringify(options.body || '')}`;
        return Buffer.from(key).toString('base64');
    }
    
    /**
     * Get from cache
     */
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        
        if (cached) {
            this.cache.delete(key);
        }
        
        return null;
    }
    
    /**
     * Set cache
     */
    setCache(key, data) {
        // Implement LRU eviction if cache is too large
        if (this.cache.size >= 1000) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
    
    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
    }
}

/**
 * Request batching utility
 */
class RequestBatcher {
    constructor(options = {}) {
        this.batchSize = options.batchSize || 10;
        this.batchTimeout = options.batchTimeout || 100;
        this.batches = new Map();
    }
    
    /**
     * Add request to batch
     */
    batch(key, request) {
        return new Promise((resolve, reject) => {
            if (!this.batches.has(key)) {
                this.batches.set(key, {
                    requests: [],
                    timeout: null
                });
            }
            
            const batch = this.batches.get(key);
            batch.requests.push({ request, resolve, reject });
            
            // Clear existing timeout
            if (batch.timeout) {
                clearTimeout(batch.timeout);
            }
            
            // Execute batch if full or set timeout
            if (batch.requests.length >= this.batchSize) {
                this.executeBatch(key);
            } else {
                batch.timeout = setTimeout(() => this.executeBatch(key), this.batchTimeout);
            }
        });
    }
    
    /**
     * Execute batch of requests
     */
    async executeBatch(key) {
        const batch = this.batches.get(key);
        if (!batch || batch.requests.length === 0) {
            return;
        }
        
        this.batches.delete(key);
        
        if (batch.timeout) {
            clearTimeout(batch.timeout);
        }
        
        try {
            const results = await Promise.allSettled(
                batch.requests.map(({ request }) => request())
            );
            
            results.forEach((result, index) => {
                const { resolve, reject } = batch.requests[index];
                
                if (result.status === 'fulfilled') {
                    resolve(result.value);
                } else {
                    reject(result.reason);
                }
            });
        } catch (error) {
            batch.requests.forEach(({ reject }) => reject(error));
        }
    }
}

// Create singleton instances
const httpClient = new HttpClient();
const requestBatcher = new RequestBatcher();

module.exports = {
    HttpClient,
    RequestBatcher,
    httpClient,
    requestBatcher
};