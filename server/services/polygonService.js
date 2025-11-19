// Polygon.io API Service
import fetch from 'node-fetch';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

class PolygonService {
    constructor() {
        if (!POLYGON_API_KEY) {
            throw new Error('POLYGON_API_KEY is required');
        }
    }

    /**
     * Get aggregated bars (OHLCV) for a stock
     * @param {string} symbol - Stock symbol (e.g., 'AAPL')
     * @param {string} timeframe - Timeframe (e.g., '1', '5', '15', '30', '60', 'day')
     * @param {string} from - Start date (YYYY-MM-DD)
     * @param {string} to - End date (YYYY-MM-DD)
     * @returns {Promise<Array>} Array of OHLCV bars
     */
    async getAggregates(symbol, timeframe, from, to) {
        try {
            // Parse timeframe
            let multiplier = 1;
            let timespan = 'minute';
            
            if (timeframe.includes('m')) {
                multiplier = parseInt(timeframe.replace('m', ''));
                timespan = 'minute';
            } else if (timeframe.includes('h')) {
                multiplier = parseInt(timeframe.replace('h', '')) * 60;
                timespan = 'minute';
            } else if (timeframe.includes('d') || timeframe === 'day') {
                multiplier = 1;
                timespan = 'day';
            }
            
            const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'ERROR') {
                throw new Error(data.error || 'Polygon API error');
            }
            
            if (!data.results || data.results.length === 0) {
                return [];
            }
            
            // Transform to standardized format
            return data.results.map(bar => ({
                time: Math.floor(bar.t / 1000), // Convert to seconds
                open: bar.o,
                high: bar.h,
                low: bar.l,
                close: bar.c,
                volume: bar.v,
                timestamp: new Date(bar.t).toISOString()
            }));
            
        } catch (error) {
            console.error('Error fetching aggregates from Polygon:', error);
            throw error;
        }
    }

    /**
     * Get current price for a stock
     * @param {string} symbol - Stock symbol
     * @returns {Promise<Object>} Current price data
     */
    async getCurrentPrice(symbol) {
        try {
            const url = `${POLYGON_BASE_URL}/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'ERROR') {
                throw new Error(data.error || 'Polygon API error');
            }
            
            if (!data.results || data.results.length === 0) {
                throw new Error('No price data available');
            }
            
            const result = data.results[0];
            
            return {
                symbol: data.ticker,
                price: result.c,
                open: result.o,
                high: result.h,
                low: result.l,
                close: result.c,
                volume: result.v,
                change: result.c - result.o,
                changePercent: ((result.c - result.o) / result.o) * 100,
                timestamp: new Date(result.t).toISOString()
            };
            
        } catch (error) {
            console.error('Error fetching current price from Polygon:', error);
            throw error;
        }
    }

    /**
     * Search for stock tickers
     * @param {string} query - Search query
     * @returns {Promise<Array>} Array of matching tickers
     */
    async searchTickers(query) {
        try {
            const url = `${POLYGON_BASE_URL}/v3/reference/tickers?search=${encodeURIComponent(query)}&active=true&limit=10&apiKey=${POLYGON_API_KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'ERROR') {
                throw new Error(data.error || 'Polygon API error');
            }
            
            if (!data.results || data.results.length === 0) {
                return [];
            }
            
            return data.results.map(ticker => ({
                symbol: ticker.ticker,
                name: ticker.name,
                market: ticker.market,
                type: ticker.type,
                primary_exchange: ticker.primary_exchange
            }));
            
        } catch (error) {
            console.error('Error searching tickers from Polygon:', error);
            throw error;
        }
    }

    /**
     * Get ticker details
     * @param {string} symbol - Stock symbol
     * @returns {Promise<Object>} Ticker details
     */
    async getTickerDetails(symbol) {
        try {
            const url = `${POLYGON_BASE_URL}/v3/reference/tickers/${symbol}?apiKey=${POLYGON_API_KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.status === 'ERROR') {
                throw new Error(data.error || 'Polygon API error');
            }
            
            if (!data.results) {
                throw new Error('Ticker not found');
            }
            
            const result = data.results;
            
            return {
                symbol: result.ticker,
                name: result.name,
                market: result.market,
                locale: result.locale,
                primary_exchange: result.primary_exchange,
                type: result.type,
                currency_name: result.currency_name,
                description: result.description,
                homepage_url: result.homepage_url,
                total_employees: result.total_employees,
                list_date: result.list_date,
                market_cap: result.market_cap
            };
            
        } catch (error) {
            console.error('Error fetching ticker details from Polygon:', error);
            throw error;
        }
    }

    /**
     * Get market status
     * @returns {Promise<Object>} Market status
     */
    async getMarketStatus() {
        try {
            const url = `${POLYGON_BASE_URL}/v1/marketstatus/now?apiKey=${POLYGON_API_KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            return {
                market: data.market,
                serverTime: data.serverTime,
                exchanges: {
                    nasdaq: data.exchanges?.nasdaq || 'closed',
                    nyse: data.exchanges?.nyse || 'closed'
                },
                currencies: {
                    crypto: data.currencies?.crypto || 'closed',
                    fx: data.currencies?.fx || 'closed'
                }
            };
            
        } catch (error) {
            console.error('Error fetching market status from Polygon:', error);
            throw error;
        }
    }

    /**
     * Calculate date range for chart data
     * @param {string} timeframe - Timeframe (e.g., '1m', '5m', '1h', '1d')
     * @param {number} bars - Number of bars to fetch (default: 1000)
     * @returns {Object} From and to dates
     */
    calculateDateRange(timeframe, bars = 3000) {
        const now = new Date();
        let minutesBack;
        
        if (timeframe.includes('m')) {
            const minutes = parseInt(timeframe.replace('m', ''));
            minutesBack = minutes * bars;
        } else if (timeframe.includes('h')) {
            const hours = parseInt(timeframe.replace('h', ''));
            minutesBack = hours * 60 * bars;
        } else if (timeframe.includes('d') || timeframe === 'day') {
            minutesBack = 24 * 60 * bars;
        } else {
            minutesBack = 60 * bars; // Default to 1 hour
        }
        
        const from = new Date(now.getTime() - minutesBack * 60 * 1000);
        
        return {
            from: from.toISOString().split('T')[0],
            to: now.toISOString().split('T')[0]
        };
    }
}

export default new PolygonService();