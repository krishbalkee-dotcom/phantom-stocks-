// Market Data Routes - Get stock prices and chart data
import express from 'express';
import fetch from 'node-fetch';
import polygonService from '../services/polygonService.js';
import indicatorService from '../services/indicatorService.js';
import cacheService from '../services/cacheService.js';

const router = express.Router();

/**
 * GET /api/market-data/price?symbol=AAPL
 * Get current price for a stock
 */
router.get('/price', async (req, res) => {
    try {
        const { symbol } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ error: 'symbol required' });
        }
        
        // Check cache first
        const cachedPrice = cacheService.getCachedPriceData(symbol);
        if (cachedPrice) {
            return res.json(cachedPrice);
        }
        
        // Fetch from Polygon
        const priceData = await polygonService.getCurrentPrice(symbol);
        
        // Cache for 1 minute
        cacheService.cachePriceData(symbol, priceData, 60000);
        
        res.json(priceData);
        
    } catch (error) {
        console.error('Error fetching price:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * GET /api/market-data/chart?symbol=AAPL&timeframe=15m
 * Get chart data with indicators for a stock
 */
router.get('/chart', async (req, res) => {
    try {
        const { symbol, timeframe = '15m' } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ error: 'symbol required' });
        }
        
        // Check cache first
        const cachedChart = cacheService.getCachedChartData(symbol, timeframe);
        if (cachedChart) {
            return res.json(cachedChart);
        }
        
        // Calculate date range (3000 bars)
        const { from, to } = polygonService.calculateDateRange(timeframe, 3000);
        
        // Fetch from Polygon
        let ohlcvData = await polygonService.getAggregates(symbol, timeframe, from, to);
        
        // Retry with extended range if insufficient data
        if (ohlcvData.length < 500) {
            console.log(`[Retry] Only ${ohlcvData.length} bars for ${symbol}, trying extended range...`);
            const { from: extendedFrom, to: extendedTo } = polygonService.calculateDateRange(timeframe, 6000);
            ohlcvData = await polygonService.getAggregates(symbol, timeframe, extendedFrom, extendedTo);
        }
        
        if (!ohlcvData || ohlcvData.length === 0) {
            return res.status(404).json({ error: 'No data available for this symbol' });
        }
        
        // Fetch latest 1-minute price for current price (consistent across all timeframes)
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
        const latestPriceFrom = twoHoursAgo.toISOString().split('T')[0];
        const latestPriceTo = now.toISOString().split('T')[0];
        
        let latestPrice = ohlcvData[ohlcvData.length - 1].close; // Default to timeframe's latest
        let latestPriceTimestamp = ohlcvData[ohlcvData.length - 1].timestamp;
        
        try {
            const latestPriceData = await polygonService.getAggregates(symbol, '1m', latestPriceFrom, latestPriceTo);
            if (latestPriceData && latestPriceData.length > 0) {
                latestPrice = latestPriceData[latestPriceData.length - 1].close;
                latestPriceTimestamp = latestPriceData[latestPriceData.length - 1].timestamp;
            }
        } catch (error) {
            console.warn('[Chart] Could not fetch latest 1-minute price, using timeframe latest:', error.message);
        }
        
        // Fetch previous day's close for change calculation
        let previousClose = latestPrice; // Default (no change)
        let change = 0;
        let changePercent = 0;
        
        try {
            const prevDayUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${process.env.POLYGON_API_KEY}`;
            const prevResponse = await fetch(prevDayUrl);
            const prevData = await prevResponse.json();
            
            if (prevData.status === 'OK' && prevData.results && prevData.results.length > 0) {
                previousClose = parseFloat(prevData.results[0].c);
                change = latestPrice - previousClose;
                changePercent = (change / previousClose) * 100;
            }
        } catch (error) {
            console.warn('[Chart] Could not fetch previous close:', error.message);
        }
        
        // Calculate indicators
        const indicators = indicatorService.calculateAllIndicators(ohlcvData);
        
        // Prepare response with warning flag
        const chartData = {
            symbol,
            timeframe,
            bars: ohlcvData,
            indicators: {
                sma20: indicators.sma20,
                sma50: indicators.sma50,
                ema12: indicators.ema12,
                ema26: indicators.ema26,
                rsi: indicators.rsi,
                macd: indicators.macd,
                bollingerBands: indicators.bollingerBands
            },
            metadata: {
                barCount: ohlcvData.length,
                from,
                to,
                latestPrice: latestPrice,  // Always latest 1-minute price
                latestPriceTimestamp: latestPriceTimestamp,
                previousClose: previousClose,
                change: change,
                changePercent: changePercent,
                hasLimitedData: ohlcvData.length < 500, // Warning flag for frontend
                timeframeLabel: getTimeframeLabel(timeframe) // Label for OHLC card
            }
        };
        
        // Cache for 30 minutes
        cacheService.cacheChartData(symbol, timeframe, chartData, 30 * 60000);
        
        res.json(chartData);
        
    } catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * Helper: Get user-friendly timeframe label
 */
function getTimeframeLabel(timeframe) {
    const labels = {
        '1m': 'Last 1-Min Candle',
        '5m': 'Last 5-Min Candle',
        '15m': 'Last 15-Min Candle',
        '30m': 'Last 30-Min Candle',
        '1h': 'Last 1-Hour Candle',
        '4h': 'Last 4-Hour Candle',
        '1d': "Today's Trading Day",
        'day': "Today's Trading Day"
    };
    return labels[timeframe] || `Last ${timeframe} Candle`;
}

/**
 * GET /api/market-data/details?symbol=AAPL
 * Get ticker details (company info)
 */
router.get('/details', async (req, res) => {
    try {
        const { symbol } = req.query;
        
        if (!symbol) {
            return res.status(400).json({ error: 'symbol required' });
        }
        
        // Check cache first
        const cachedDetails = cacheService.getCachedTickerDetails(symbol);
        if (cachedDetails) {
            return res.json(cachedDetails);
        }
        
        // Fetch from Polygon
        const details = await polygonService.getTickerDetails(symbol);
        
        // Cache for 24 hours
        cacheService.cacheTickerDetails(symbol, details, 24 * 60 * 60000);
        
        res.json(details);
        
    } catch (error) {
        console.error('Error fetching ticker details:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

/**
 * GET /api/market-data/status
 * Get market status (open/closed)
 */
router.get('/status', async (req, res) => {
    try {
        const status = await polygonService.getMarketStatus();
        res.json(status);
    } catch (error) {
        console.error('Error fetching market status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;