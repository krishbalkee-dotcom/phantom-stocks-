// News Route - Complete implementation using Polygon API
import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Simple in-memory cache for news
const newsCache = new Map();
const NEWS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/news
 * Get general market news
 * Query params:
 *   - limit: Number of articles (default: 20, max: 50)
 *   - order: Sort order 'desc' or 'asc' (default: 'desc')
 */
router.get('/', async (req, res) => {
    try {
        const { limit = 20, order = 'desc' } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 20, 50);
        
        // Check cache
        const cacheKey = `market_news_${parsedLimit}_${order}`;
        const cached = newsCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < NEWS_CACHE_TTL) {
            return res.json(cached.data);
        }
        
        // Fetch from Polygon
        const url = `${POLYGON_BASE_URL}/v2/reference/news?limit=${parsedLimit}&order=${order}&apiKey=${POLYGON_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'ERROR' || data.status === 'error') {
            return res.status(500).json({ 
                error: data.error || 'Failed to fetch news from Polygon' 
            });
        }
        
        if (!data.results || data.results.length === 0) {
            return res.json([]);
        }
        
        // Transform to consistent format
        const articles = data.results.map(article => ({
            id: article.id,
            title: article.title,
            description: article.description || '',
            summary: article.description || '',
            url: article.article_url,
            source: article.publisher?.name || 'Market News',
            publisher: {
                name: article.publisher?.name || 'Unknown',
                homepage_url: article.publisher?.homepage_url || '',
                logo_url: article.publisher?.logo_url || ''
            },
            author: article.author || 'Unknown',
            published_at: article.published_utc,
            image_url: article.image_url || '',
            amp_url: article.amp_url || '',
            tickers: article.tickers || [],
            keywords: article.keywords || [],
            insights: article.insights || []
        }));
        
        // Cache the results
        newsCache.set(cacheKey, {
            data: articles,
            timestamp: Date.now()
        });
        
        res.json(articles);
        
    } catch (error) {
        console.error('Error fetching market news:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

/**
 * GET /api/news/ticker/:symbol
 * Get news for a specific stock symbol
 * Query params:
 *   - limit: Number of articles (default: 10, max: 50)
 */
router.get('/ticker/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { limit = 10 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 10, 50);
        
        if (!symbol || symbol.length === 0) {
            return res.status(400).json({ error: 'Symbol is required' });
        }
        
        const upperSymbol = symbol.toUpperCase();
        
        // Check cache
        const cacheKey = `ticker_news_${upperSymbol}_${parsedLimit}`;
        const cached = newsCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < NEWS_CACHE_TTL) {
            return res.json(cached.data);
        }
        
        // Fetch from Polygon
        const url = `${POLYGON_BASE_URL}/v2/reference/news?ticker=${upperSymbol}&limit=${parsedLimit}&order=desc&apiKey=${POLYGON_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'ERROR' || data.status === 'error') {
            return res.status(500).json({ 
                error: data.error || 'Failed to fetch news from Polygon' 
            });
        }
        
        if (!data.results || data.results.length === 0) {
            return res.json([]);
        }
        
        // Transform to consistent format
        const articles = data.results.map(article => ({
            id: article.id,
            title: article.title,
            description: article.description || '',
            summary: article.description || '',
            url: article.article_url,
            source: article.publisher?.name || upperSymbol,
            publisher: {
                name: article.publisher?.name || 'Unknown',
                homepage_url: article.publisher?.homepage_url || '',
                logo_url: article.publisher?.logo_url || ''
            },
            author: article.author || 'Unknown',
            published_at: article.published_utc,
            image_url: article.image_url || '',
            amp_url: article.amp_url || '',
            tickers: article.tickers || [],
            keywords: article.keywords || [],
            insights: article.insights || []
        }));
        
        // Cache the results
        newsCache.set(cacheKey, {
            data: articles,
            timestamp: Date.now()
        });
        
        res.json(articles);
        
    } catch (error) {
        console.error(`Error fetching news for ${req.params.symbol}:`, error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

/**
 * GET /api/news/search
 * Search news by keyword
 * Query params:
 *   - q: Search query (required)
 *   - limit: Number of articles (default: 10, max: 50)
 */
router.get('/search', async (req, res) => {
    try {
        const { q, limit = 10 } = req.query;
        const parsedLimit = Math.min(parseInt(limit) || 10, 50);
        
        if (!q || q.trim().length === 0) {
            return res.status(400).json({ error: 'Search query (q) is required' });
        }
        
        const searchQuery = q.trim();
        
        // Check cache
        const cacheKey = `search_news_${searchQuery}_${parsedLimit}`;
        const cached = newsCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < NEWS_CACHE_TTL) {
            return res.json(cached.data);
        }
        
        // Fetch from Polygon (using keyword search via ticker or general news)
        // Note: Polygon doesn't have direct keyword search, so we fetch general news
        // and filter client-side or use ticker search if query matches a symbol
        const url = `${POLYGON_BASE_URL}/v2/reference/news?limit=${parsedLimit}&order=desc&apiKey=${POLYGON_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'ERROR' || data.status === 'error') {
            return res.status(500).json({ 
                error: data.error || 'Failed to fetch news from Polygon' 
            });
        }
        
        if (!data.results || data.results.length === 0) {
            return res.json([]);
        }
        
        // Filter articles that match search query in title, description, or keywords
        const queryLower = searchQuery.toLowerCase();
        const filteredResults = data.results.filter(article => {
            const titleMatch = article.title?.toLowerCase().includes(queryLower);
            const descriptionMatch = article.description?.toLowerCase().includes(queryLower);
            const keywordMatch = article.keywords?.some(kw => kw.toLowerCase().includes(queryLower));
            const tickerMatch = article.tickers?.some(t => t.toLowerCase().includes(queryLower));
            
            return titleMatch || descriptionMatch || keywordMatch || tickerMatch;
        });
        
        // Transform to consistent format
        const articles = filteredResults.map(article => ({
            id: article.id,
            title: article.title,
            description: article.description || '',
            summary: article.description || '',
            url: article.article_url,
            source: article.publisher?.name || 'Market News',
            publisher: {
                name: article.publisher?.name || 'Unknown',
                homepage_url: article.publisher?.homepage_url || '',
                logo_url: article.publisher?.logo_url || ''
            },
            author: article.author || 'Unknown',
            published_at: article.published_utc,
            image_url: article.image_url || '',
            amp_url: article.amp_url || '',
            tickers: article.tickers || [],
            keywords: article.keywords || [],
            insights: article.insights || []
        }));
        
        // Cache the results
        newsCache.set(cacheKey, {
            data: articles,
            timestamp: Date.now()
        });
        
        res.json(articles);
        
    } catch (error) {
        console.error('Error searching news:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

/**
 * GET /api/news/latest
 * Get the single latest news article
 */
router.get('/latest', async (req, res) => {
    try {
        // Check cache
        const cacheKey = 'latest_news';
        const cached = newsCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < NEWS_CACHE_TTL) {
            return res.json(cached.data);
        }
        
        // Fetch from Polygon
        const url = `${POLYGON_BASE_URL}/v2/reference/news?limit=1&order=desc&apiKey=${POLYGON_API_KEY}`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'ERROR' || data.status === 'error') {
            return res.status(500).json({ 
                error: data.error || 'Failed to fetch news from Polygon' 
            });
        }
        
        if (!data.results || data.results.length === 0) {
            return res.json(null);
        }
        
        const article = data.results[0];
        
        // Transform to consistent format
        const latestArticle = {
            id: article.id,
            title: article.title,
            description: article.description || '',
            summary: article.description || '',
            url: article.article_url,
            source: article.publisher?.name || 'Market News',
            publisher: {
                name: article.publisher?.name || 'Unknown',
                homepage_url: article.publisher?.homepage_url || '',
                logo_url: article.publisher?.logo_url || ''
            },
            author: article.author || 'Unknown',
            published_at: article.published_utc,
            image_url: article.image_url || '',
            amp_url: article.amp_url || '',
            tickers: article.tickers || [],
            keywords: article.keywords || [],
            insights: article.insights || []
        };
        
        // Cache the result
        newsCache.set(cacheKey, {
            data: latestArticle,
            timestamp: Date.now()
        });
        
        res.json(latestArticle);
        
    } catch (error) {
        console.error('Error fetching latest news:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            message: error.message 
        });
    }
});

/**
 * DELETE /api/news/cache
 * Clear news cache (admin/debug endpoint)
 */
router.delete('/cache', (req, res) => {
    try {
        newsCache.clear();
        res.json({ 
            success: true, 
            message: 'News cache cleared' 
        });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

/**
 * GET /api/news/cache/stats
 * Get cache statistics (admin/debug endpoint)
 */
router.get('/cache/stats', (req, res) => {
    try {
        const stats = {
            totalEntries: newsCache.size,
            entries: Array.from(newsCache.keys()),
            ttl: NEWS_CACHE_TTL,
            ttlMinutes: NEWS_CACHE_TTL / (60 * 1000)
        };
        
        res.json(stats);
    } catch (error) {
        console.error('Error getting cache stats:', error);
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});

// Clear expired cache entries every 15 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of newsCache.entries()) {
        if ((now - value.timestamp) >= NEWS_CACHE_TTL) {
            newsCache.delete(key);
        }
    }
}, 15 * 60 * 1000);

export default router;