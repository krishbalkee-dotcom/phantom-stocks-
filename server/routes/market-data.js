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
 * Helper: Fetch the absolute latest price (SAME for all timeframes)
 * This is the TRADING PRICE that appears on buy/sell card
 */
async function fetchLatestTradingPrice(symbol) {
    const POLYGON_KEY = process.env.POLYGON_API_KEY;
    const now = Date.now();
    const fourHoursAgo = now - (4 * 60 * 60 * 1000);
    
    try {
        // Fetch last 50 1-minute bars to ensure we get the most recent price
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${fourHoursAgo}/${now}?adjusted=true&sort=desc&limit=50&apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        
        if (response.ok) {
            const data = await response.json();
            if (data.status === 'OK' && data.results && data.results.length > 0) {
                const latestBar = data.results[0];
                
                console.log(`[Market] ${symbol} Latest Trading Price: $${latestBar.c} at ${new Date(latestBar.t).toISOString()}`);
                
                return {
                    price: parseFloat(latestBar.c),
                    timestamp: new Date(latestBar.t).toISOString(),
                    barTime: latestBar.t
                };
            }
        }
    } catch (error) {
        console.warn(`[Market] Could not fetch latest 1-min price for ${symbol}:`, error.message);
    }
    
    // Fallback: Use /prev endpoint
    try {
        const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
        const prevResponse = await fetch(prevUrl);
        
        if (prevResponse.ok) {
            const prevData = await prevResponse.json();
            if (prevData.status === 'OK' && prevData.results && prevData.results.length > 0) {
                console.log(`[Market] ${symbol} Using /prev fallback: $${prevData.results[0].c}`);
                return {
                    price: parseFloat(prevData.results[0].c),
                    timestamp: new Date(prevData.results[0].t).toISOString(),
                    barTime: prevData.results[0].t
                };
            }
        }
    } catch (error) {
        console.warn(`[Market] /prev fallback also failed for ${symbol}:`, error.message);
    }
    
    return null;
}

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
        
        // STEP 1: Fetch the absolute latest trading price FIRST (SAME for all timeframes)
        const latestPriceData = await fetchLatestTradingPrice(symbol);
        
        if (!latestPriceData) {
            return res.status(404).json({ error: 'Could not fetch current price' });
        }
        
        const latestPrice = latestPriceData.price;
        const latestPriceTimestamp = latestPriceData.timestamp;
        
        console.log(`[Chart] ${symbol} ${timeframe}: Using consistent price $${latestPrice}`);
        
        // STEP 2: Calculate date range with timeframe-specific bar limits
        // CRITICAL FIX: Use 2000 bars for 1-hour, 3000 for others
        let barLimit;
        if (timeframe === '1h' || timeframe === '60m') {
            barLimit = 2000; // 2000 hours = ~83 days (more reasonable)
            console.log(`[Chart] ${symbol} 1-hour timeframe: Using barLimit=2000`);
        } else {
            barLimit = 3000; // Keep 3000 for other timeframes
        }
        
        const { from, to } = polygonService.calculateDateRange(timeframe, barLimit);
        
        console.log(`[Chart] ${symbol} ${timeframe}: Fetching from ${from} to ${to} (${barLimit} bars)`);
        
        // STEP 3: Fetch chart bars for the specific timeframe
        let ohlcvData = await polygonService.getAggregates(symbol, timeframe, from, to);
        
        console.log(`[Chart] ${symbol} ${timeframe}: Received ${ohlcvData.length} bars`);
        
        // Retry with extended range if insufficient data
        if (ohlcvData.length < 500) {
            console.log(`[Retry] Only ${ohlcvData.length} bars for ${symbol}, trying extended range...`);
            const extendedBarLimit = timeframe === '1h' || timeframe === '60m' ? 4000 : 6000;
            const { from: extendedFrom, to: extendedTo } = polygonService.calculateDateRange(timeframe, extendedBarLimit);
            ohlcvData = await polygonService.getAggregates(symbol, timeframe, extendedFrom, extendedTo);
            console.log(`[Retry] ${symbol} ${timeframe}: Now have ${ohlcvData.length} bars`);
        }
        
        if (!ohlcvData || ohlcvData.length === 0) {
            return res.status(404).json({ error: 'No data available for this symbol' });
        }
        
        // STEP 4: Special handling for 1-hour timeframe - append latest 1-min bar if last bar is old
        if (timeframe === '1h' || timeframe === '60m') {
            const lastBar = ohlcvData[ohlcvData.length - 1];
            const lastBarTime = lastBar.time * 1000; // Convert to milliseconds
            const now = Date.now();
            const hoursSinceLastBar = (now - lastBarTime) / (1000 * 60 * 60);
            
            console.log(`[Chart] ${symbol} 1-hour last bar: ${new Date(lastBarTime).toISOString()}`);
            console.log(`[Chart] ${symbol} Hours since last bar: ${hoursSinceLastBar.toFixed(2)}`);
            
            // If last 1-hour bar is more than 90 minutes old, append latest 1-min bar
            if (hoursSinceLastBar > 1.5) {
                console.log(`[Chart] ${symbol} 1-hour last bar is ${hoursSinceLastBar.toFixed(2)} hours old, fetching latest 1-min bar`);
                
                try {
                    const latestMinUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${now - 3600000}/${now}?adjusted=true&sort=desc&limit=1&apiKey=${process.env.POLYGON_API_KEY}`;
                    const latestMinResponse = await fetch(latestMinUrl);
                    const latestMinData = await latestMinResponse.json();
                    
                    if (latestMinData.status === 'OK' && latestMinData.results && latestMinData.results.length > 0) {
                        const latestMin = latestMinData.results[0];
                        
                        // Append as if it's a 1-hour bar
                        ohlcvData.push({
                            time: Math.floor(latestMin.t / 1000),
                            open: latestMin.o,
                            high: latestMin.h,
                            low: latestMin.l,
                            close: latestMin.c,
                            volume: latestMin.v,
                            timestamp: new Date(latestMin.t).toISOString()
                        });
                        
                        console.log(`[Chart] ${symbol} Appended latest 1-min bar: $${latestMin.c} at ${new Date(latestMin.t).toISOString()}`);
                        console.log(`[Chart] ${symbol} Chart now extends to: ${new Date(latestMin.t).toISOString()}`);
                    }
                } catch (error) {
                    console.warn(`[Chart] ${symbol} Could not append latest 1-min to 1-hour chart:`, error.message);
                }
            } else {
                console.log(`[Chart] ${symbol} 1-hour chart is recent enough (last bar ${hoursSinceLastBar.toFixed(2)} hours ago)`);
            }
        }
        
        // STEP 5: Fetch previous day's close for change calculation
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
            console.warn(`[Chart] ${symbol} Could not fetch previous close:`, error.message);
        }
        
        // STEP 6: Calculate indicators
        const indicators = indicatorService.calculateAllIndicators(ohlcvData);
        
        // STEP 7: Get OHLC from the most recent bar in the timeframe
        const lastBar = ohlcvData[ohlcvData.length - 1];
        
        console.log(`[Chart] ${symbol} ${timeframe} Final bar count: ${ohlcvData.length}`);
        console.log(`[Chart] ${symbol} ${timeframe} Last bar time: ${lastBar.timestamp}`);
        
        // STEP 8: Prepare response
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
                // CRITICAL: latestPrice is ALWAYS the same (from fetchLatestTradingPrice)
                latestPrice: latestPrice,
                latestPriceTimestamp: latestPriceTimestamp,
                // Previous close for change calculation (also always the same)
                previousClose: previousClose,
                change: change,
                changePercent: changePercent,
                // OHLC from the last bar of THIS timeframe (varies by timeframe)
                lastBarOpen: parseFloat(lastBar.open),
                lastBarHigh: parseFloat(lastBar.high),
                lastBarLow: parseFloat(lastBar.low),
                lastBarClose: parseFloat(lastBar.close),
                lastBarTimestamp: lastBar.timestamp,
                // Warnings
                hasLimitedData: ohlcvData.length < 500,
                timeframeLabel: getTimeframeLabel(timeframe)
            }
        };
        
        // Cache for 1 minute (shorter cache since we need fresh prices)
        cacheService.cacheChartData(symbol, timeframe, chartData, 60000);
        
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