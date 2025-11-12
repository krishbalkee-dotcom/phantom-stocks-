// Cache Service - In-memory caching for market data
class CacheService {
    constructor() {
        this.cache = new Map();
        this.ttl = 15 * 60 * 1000; // 15 minutes default TTL
    }

    /**
     * Generate cache key
     * @param {string} type - Cache type (e.g., 'chart', 'price', 'search')
     * @param {Object} params - Parameters to include in key
     * @returns {string} Cache key
     */
    generateKey(type, params) {
        const sortedParams = Object.keys(params)
            .sort()
            .map(key => `${key}:${params[key]}`)
            .join('|');
        return `${type}:${sortedParams}`;
    }

    /**
     * Set cache entry
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds (optional)
     */
    set(key, value, ttl = this.ttl) {
        const expiresAt = Date.now() + ttl;
        this.cache.set(key, {
            value,
            expiresAt
        });
    }

    /**
     * Get cache entry
     * @param {string} key - Cache key
     * @returns {*} Cached value or null if not found/expired
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            return null;
        }
        
        // Check if expired
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.value;
    }

    /**
     * Delete cache entry
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Clear expired entries
     */
    clearExpired() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        const now = Date.now();
        let activeEntries = 0;
        let expiredEntries = 0;
        
        for (const [, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                expiredEntries++;
            } else {
                activeEntries++;
            }
        }
        
        return {
            totalEntries: this.cache.size,
            activeEntries,
            expiredEntries
        };
    }

    /**
     * Cache chart data
     * @param {string} symbol - Stock symbol
     * @param {string} timeframe - Timeframe
     * @param {Array} data - Chart data
     * @param {number} ttl - TTL in milliseconds
     */
    cacheChartData(symbol, timeframe, data, ttl = this.ttl) {
        const key = this.generateKey('chart', { symbol, timeframe });
        this.set(key, data, ttl);
    }

    /**
     * Get cached chart data
     * @param {string} symbol - Stock symbol
     * @param {string} timeframe - Timeframe
     * @returns {Array|null} Cached chart data or null
     */
    getCachedChartData(symbol, timeframe) {
        const key = this.generateKey('chart', { symbol, timeframe });
        return this.get(key);
    }

    /**
     * Cache price data
     * @param {string} symbol - Stock symbol
     * @param {Object} priceData - Price data
     * @param {number} ttl - TTL in milliseconds (default: 1 minute)
     */
    cachePriceData(symbol, priceData, ttl = 60000) {
        const key = this.generateKey('price', { symbol });
        this.set(key, priceData, ttl);
    }

    /**
     * Get cached price data
     * @param {string} symbol - Stock symbol
     * @returns {Object|null} Cached price data or null
     */
    getCachedPriceData(symbol) {
        const key = this.generateKey('price', { symbol });
        return this.get(key);
    }

    /**
     * Cache search results
     * @param {string} query - Search query
     * @param {Array} results - Search results
     * @param {number} ttl - TTL in milliseconds (default: 30 minutes)
     */
    cacheSearchResults(query, results, ttl = 30 * 60000) {
        const key = this.generateKey('search', { query: query.toLowerCase() });
        this.set(key, results, ttl);
    }

    /**
     * Get cached search results
     * @param {string} query - Search query
     * @returns {Array|null} Cached search results or null
     */
    getCachedSearchResults(query) {
        const key = this.generateKey('search', { query: query.toLowerCase() });
        return this.get(key);
    }

    /**
     * Cache ticker details
     * @param {string} symbol - Stock symbol
     * @param {Object} details - Ticker details
     * @param {number} ttl - TTL in milliseconds (default: 24 hours)
     */
    cacheTickerDetails(symbol, details, ttl = 24 * 60 * 60000) {
        const key = this.generateKey('ticker', { symbol });
        this.set(key, details, ttl);
    }

    /**
     * Get cached ticker details
     * @param {string} symbol - Stock symbol
     * @returns {Object|null} Cached ticker details or null
     */
    getCachedTickerDetails(symbol) {
        const key = this.generateKey('ticker', { symbol });
        return this.get(key);
    }

    /**
     * Invalidate all cache entries for a symbol
     * @param {string} symbol - Stock symbol
     */
    invalidateSymbol(symbol) {
        const keysToDelete = [];
        
        for (const key of this.cache.keys()) {
            if (key.includes(`symbol:${symbol}`)) {
                keysToDelete.push(key);
            }
        }
        
        keysToDelete.forEach(key => this.cache.delete(key));
    }
}

// Create singleton instance
const cacheService = new CacheService();

// Clear expired entries every 5 minutes
setInterval(() => {
    cacheService.clearExpired();
}, 5 * 60 * 1000);

export default cacheService;