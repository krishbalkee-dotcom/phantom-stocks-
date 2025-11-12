// Market Data Routes - Get stock prices and chart data
import express from 'express';
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
        
        // Calculate date range (1000 bars)
        const { from, to } = polygonService.calculateDateRange(timeframe, 1000);
        
        // Fetch from Polygon
        const ohlcvData = await polygonService.getAggregates(symbol, timeframe, from, to);
        
        if (!ohlcvData || ohlcvData.length === 0) {
            return res.status(404).json({ error: 'No data available for this symbol' });
        }
        
        // Calculate indicators
        const indicators = indicatorService.calculateAllIndicators(ohlcvData);
        
        // Prepare response
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
                latestPrice: ohlcvData[ohlcvData.length - 1].close
            }
        };
        
        // Cache for 15 minutes
        cacheService.cacheChartData(symbol, timeframe, chartData, 15 * 60000);
        
        res.json(chartData);
        
    } catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
});

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