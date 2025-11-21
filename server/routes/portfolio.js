// Portfolio Routes - Get portfolio data with corrected calculations + Intraday G/L
import express from 'express';
import fetch from 'node-fetch';
import { supabase } from '../config/supabase.js';
import cacheService from '../services/cacheService.js';

const router = express.Router();

/**
 * Helper function to check if market is open (4 AM - 8 PM ET)
 */
function isMarketOpen() {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = etTime.getHours();
    const minutes = etTime.getMinutes();
    const timeDecimal = hours + minutes / 60;
    
    // Market hours: 4:00 AM - 8:00 PM ET
    return timeDecimal >= 4 && timeDecimal < 20;
}

/**
 * Helper function to fetch current prices from Polygon (including after-hours)
 * FIXED VERSION with 5-step priority logic:
 * 1. Recent transaction (< 5 min)
 * 2. Live market data (if market open)
 * 3. Holdings table current_price
 * 4. Polygon /prev
 * 5. Holdings avg_purchase_price
 */
async function fetchCurrentPrices(symbols, userId) {
    if (!symbols || symbols.length === 0) return {};
    
    const prices = {};
    const POLYGON_KEY = process.env.POLYGON_API_KEY;
    
    for (const symbol of symbols) {
        try {
            // STEP 1: Check for recent transaction (< 5 minutes)
            if (userId) {
                const cutoff = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
                
                const { data: recentTx } = await supabase
                    .from('transactions')
                    .select('price, executed_at')
                    .eq('user_id', userId)
                    .eq('symbol', symbol)
                    .gte('executed_at', cutoff.toISOString())
                    .order('executed_at', { ascending: false })
                    .limit(1);
                
                if (recentTx && recentTx.length > 0) {
                    const txPrice = parseFloat(recentTx[0].price);
                    console.log(`[Portfolio] ${symbol}: Using recent transaction price $${txPrice}`);
                    
                    prices[symbol] = {
                        current: txPrice,
                        open: txPrice,
                        high: txPrice,
                        low: txPrice,
                        previousClose: txPrice
                    };
                    continue;
                }
            }
            
            // STEP 2: Check if market is open
            const marketOpen = isMarketOpen();
            
            if (marketOpen) {
                // STEP 3: Fetch live market data (market is open)
                const now = new Date();
                const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
                const fromTimestamp = twoHoursAgo.getTime();
                const toTimestamp = now.getTime();
                
                console.log(`[Portfolio] ${symbol}: Market open, fetching live data`);
                
                const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${fromTimestamp}/${toTimestamp}?adjusted=true&sort=desc&limit=30&apiKey=${POLYGON_KEY}`;
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.status === 'OK' && data.results && data.results.length > 0) {
                        const latestBar = data.results[0];
                        
                        let dayHigh = latestBar.h;
                        let dayLow = latestBar.l;
                        let dayOpen = data.results[data.results.length - 1].o;
                        
                        data.results.forEach(bar => {
                            if (bar.h > dayHigh) dayHigh = bar.h;
                            if (bar.l < dayLow) dayLow = bar.l;
                        });
                        
                        console.log(`[Portfolio] ${symbol}: Using live price $${latestBar.c}`);
                        
                        prices[symbol] = {
                            current: parseFloat(latestBar.c),
                            open: parseFloat(dayOpen),
                            high: parseFloat(dayHigh),
                            low: parseFloat(dayLow),
                            previousClose: parseFloat(latestBar.c)
                        };
                        continue;
                    }
                }
            } else {
                console.log(`[Portfolio] ${symbol}: Market closed, using database fallback`);
            }
            
            // STEP 4: Use holdings table current_price (market closed or API failed)
            if (userId) {
                const { data: holding } = await supabase
                    .from('holdings')
                    .select('current_price, avg_purchase_price')
                    .eq('user_id', userId)
                    .eq('symbol', symbol)
                    .single();
                
                if (holding && holding.current_price) {
                    const holdingPrice = parseFloat(holding.current_price);
                    console.log(`[Portfolio] ${symbol}: Using holdings.current_price $${holdingPrice}`);
                    
                    prices[symbol] = {
                        current: holdingPrice,
                        open: holdingPrice,
                        high: holdingPrice,
                        low: holdingPrice,
                        previousClose: holdingPrice
                    };
                    continue;
                }
            }
            
            // STEP 5: Fallback to /prev (last resort)
            console.log(`[Portfolio] ${symbol}: Using /prev fallback`);
            const fallbackUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
            const fallbackResponse = await fetch(fallbackUrl);
            
            if (fallbackResponse.ok) {
                const fallbackData = await fallbackResponse.json();
                
                if (fallbackData.status === 'OK' && fallbackData.results && fallbackData.results.length > 0) {
                    const result = fallbackData.results[0];
                    console.log(`[Portfolio] ${symbol}: /prev price $${result.c}`);
                    
                    prices[symbol] = {
                        current: parseFloat(result.c),
                        open: parseFloat(result.o),
                        high: parseFloat(result.h),
                        low: parseFloat(result.l),
                        previousClose: parseFloat(result.c)
                    };
                }
            }
            
        } catch (error) {
            console.error(`[Portfolio] Error fetching price for ${symbol}:`, error);
        }
    }
    
    return prices;
}

/**
 * Get today's open price (cached per symbol per day)
 */
async function getTodayOpenPrice(symbol) {
    // Check cache first
    const cacheKey = `today_open:${symbol}`;
    const cached = cacheService.get(cacheKey);
    
    if (cached) {
        return cached;
    }
    
    // Fetch from Polygon - get today's data
    try {
        const POLYGON_KEY = process.env.POLYGON_API_KEY;
        const today = new Date().toISOString().split('T')[0];
        
        // Try to get today's bar first (if market has opened)
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${today}/${today}?adjusted=true&apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        let openPrice = null;
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
            openPrice = parseFloat(data.results[0].o);
        } else {
            // Market hasn't opened yet or no data - use previous close as fallback
            const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
            const prevResponse = await fetch(prevUrl);
            const prevData = await prevResponse.json();
            
            if (prevData.status === 'OK' && prevData.results && prevData.results.length > 0) {
                openPrice = parseFloat(prevData.results[0].c); // Use prev close
            }
        }
        
        if (openPrice) {
            // Cache until end of day (expires at midnight)
            const now = new Date();
            const midnight = new Date(now);
            midnight.setHours(24, 0, 0, 0);
            const ttl = midnight - now;
            
            cacheService.set(cacheKey, openPrice, ttl);
        }
        
        return openPrice;
    } catch (error) {
        console.error(`Error fetching today's open for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get most recent snapshot price for a holding (for Recent Change calculation)
 */
async function getRecentSnapshotPrice(userId, symbol) {
    try {
        // Get the most recent snapshot (within last 30 minutes)
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
        
        const { data: snapshots, error } = await supabase
            .from('holdings_snapshots')
            .select('price')
            .eq('user_id', userId)
            .eq('symbol', symbol)
            .gte('snapshot_at', thirtyMinutesAgo)
            .order('snapshot_at', { ascending: false })
            .limit(1);
        
        if (error || !snapshots || snapshots.length === 0) {
            return null;
        }
        
        return parseFloat(snapshots[0].price);
    } catch (error) {
        console.error(`Error fetching recent snapshot for ${symbol}:`, error);
        return null;
    }
}

/**
 * Check if holding was purchased today
 */
async function wasPurchasedToday(userId, symbol) {
    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('executed_at')
            .eq('user_id', userId)
            .eq('symbol', symbol)
            .eq('type', 'BUY')
            .gte('executed_at', todayStart.toISOString())
            .order('executed_at', { ascending: false })
            .limit(1);
        
        return !error && transactions && transactions.length > 0;
    } catch (error) {
        console.error(`Error checking if ${symbol} was purchased today:`, error);
        return false;
    }
}

/**
 * GET /api/portfolio/summary?user_id=xxx
 * Get portfolio summary (cash, total value, P&L)
 */
router.get('/summary', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        // Get user profile (cash_balance)
        const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('cash_balance')
            .eq('user_id', user_id)
            .single();
        
        if (profileError || !userProfile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        
        // Get all holdings
        const { data: holdings, error: holdingsError } = await supabase
            .from('holdings')
            .select('symbol, quantity, avg_purchase_price')
            .eq('user_id', user_id);
        
        if (holdingsError) {
            return res.status(500).json({ error: 'Failed to fetch holdings' });
        }
        
        const cashBalance = parseFloat(userProfile.cash_balance);
        let totalHoldingsValue = 0;
        let todayGainLoss = 0;
        
        // Calculate holdings value with current prices
        if (holdings && holdings.length > 0) {
            const symbols = holdings.map(h => h.symbol);
            const currentPrices = await fetchCurrentPrices(symbols, user_id); // Pass user_id
            
            for (const holding of holdings) {
                const priceData = currentPrices[holding.symbol];
                if (priceData) {
                    const currentPrice = priceData.current;
                    const currentValue = holding.quantity * currentPrice;
                    totalHoldingsValue += currentValue;
                    
                    // Get today's open for daily P&L calculation
                    const todayOpen = await getTodayOpenPrice(holding.symbol);
                    if (todayOpen) {
                        const dailyChange = (currentPrice - todayOpen) * holding.quantity;
                        todayGainLoss += dailyChange;
                    }
                    
                    // Update holding in database with current price
                    await supabase
                        .from('holdings')
                        .update({
                            current_price: currentPrice,
                            current_value: currentValue
                        })
                        .eq('user_id', user_id)
                        .eq('symbol', holding.symbol);
                }
            }
        }
        
        const totalValue = cashBalance + totalHoldingsValue;
        const initialBalance = 10000;
        const totalProfitLoss = totalValue - initialBalance;
        const totalProfitLossPercent = (totalProfitLoss / initialBalance) * 100;
        const todayPLPercent = totalValue > 0 ? (todayGainLoss / totalValue) * 100 : 0;
        
        res.json({
            cash: cashBalance,
            total_value: totalValue,
            initial_balance: initialBalance,
            total_profit_loss: totalProfitLoss,
            total_profit_loss_percent: totalProfitLossPercent,
            holdings_value: totalHoldingsValue,
            num_holdings: holdings ? holdings.length : 0,
            today_profit_loss: todayGainLoss,
            today_profit_loss_percent: todayPLPercent
        });
        
    } catch (error) {
        console.error('Error fetching portfolio summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/holdings?user_id=xxx
 * Get all holdings for a user with detailed calculations including Intraday G/L
 */
router.get('/holdings', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        const { data: holdings, error } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', user_id)
            .order('current_value', { ascending: false });
        
        if (error) {
            return res.status(500).json({ error: 'Failed to fetch holdings' });
        }
        
        if (!holdings || holdings.length === 0) {
            return res.json([]);
        }
        
        // Fetch current prices and today's opens
        const symbols = holdings.map(h => h.symbol);
        const currentPrices = await fetchCurrentPrices(symbols, user_id); // Pass user_id
        
        const enrichedHoldings = await Promise.all(holdings.map(async (holding) => {
            const priceData = currentPrices[holding.symbol];
            const currentPrice = priceData ? priceData.current : (holding.current_price || holding.avg_purchase_price);
            const todayOpen = await getTodayOpenPrice(holding.symbol);
            const recentSnapshotPrice = await getRecentSnapshotPrice(user_id, holding.symbol);
            const purchasedToday = await wasPurchasedToday(user_id, holding.symbol);
            
            // Today's high/low (from Polygon data)
            const todayHigh = priceData ? priceData.high : null;
            const todayLow = priceData ? priceData.low : null;
            
            const currentValue = holding.quantity * currentPrice;
            const totalCost = holding.avg_purchase_price * holding.quantity;
            
            // INTRADAY G/L - Profit/loss from purchase price (always available immediately)
            const intradayGL = currentValue - totalCost;
            const intradayGLPercent = (intradayGL / totalCost) * 100;
            
            // TOTAL G/L - Same as Intraday G/L (overall profit/loss)
            const totalProfitLoss = intradayGL;
            const totalProfitLossPercent = intradayGLPercent;
            
            // TODAY'S G/L - Only available if position was held at market open today
            let todayGainLoss = null;
            let todayGainLossPercent = null;
            
            if (todayOpen && !purchasedToday) {
                todayGainLoss = (currentPrice - todayOpen) * holding.quantity;
                todayGainLossPercent = ((currentPrice - todayOpen) / todayOpen) * 100;
            }
            
            // RECENT CHANGE - Only available after first snapshot is created
            let mostRecentChange = null;
            let mostRecentChangePercent = null;
            
            if (recentSnapshotPrice) {
                mostRecentChange = currentPrice - recentSnapshotPrice;
                mostRecentChangePercent = ((currentPrice - recentSnapshotPrice) / recentSnapshotPrice) * 100;
            } else if (purchasedToday) {
                // For brand new positions, use purchase price as "snapshot"
                mostRecentChange = currentPrice - holding.avg_purchase_price;
                mostRecentChangePercent = ((currentPrice - holding.avg_purchase_price) / holding.avg_purchase_price) * 100;
            }
            
            // Update database with latest values
            await supabase
                .from('holdings')
                .update({
                    current_price: currentPrice,
                    current_value: currentValue
                })
                .eq('id', holding.id);
            
            return {
                id: holding.id,
                symbol: holding.symbol,
                name: holding.name || holding.symbol,
                quantity: parseFloat(holding.quantity),
                avg_purchase_price: parseFloat(holding.avg_purchase_price),
                current_price: currentPrice,
                current_value: currentValue,
                total_cost: totalCost,
                // Day's range
                today_high: todayHigh,
                today_low: todayLow,
                // Four G/L metrics
                intraday_gain_loss: intradayGL,
                intraday_gain_loss_percent: intradayGLPercent,
                most_recent_change: mostRecentChange,
                most_recent_change_percent: mostRecentChangePercent,
                today_gain_loss: todayGainLoss,
                today_gain_loss_percent: todayGainLossPercent,
                total_profit_loss: totalProfitLoss,
                total_profit_loss_percent: totalProfitLossPercent,
                // Metadata flags
                is_new_position: purchasedToday,
                has_recent_snapshot: recentSnapshotPrice !== null
            };
        }));
        
        // Calculate % of portfolio for each holding
        const totalPortfolioValue = enrichedHoldings.reduce((sum, h) => sum + h.current_value, 0);
        
        enrichedHoldings.forEach(holding => {
            holding.portfolio_percentage = totalPortfolioValue > 0 
                ? (holding.current_value / totalPortfolioValue) * 100 
                : 0;
        });
        
        res.json(enrichedHoldings);
        
    } catch (error) {
        console.error('Error fetching holdings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/transactions?user_id=xxx&days=10
 * Get transaction history for a user (filtered by days)
 */
router.get('/transactions', async (req, res) => {
    try {
        const { user_id, days = 10 } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        const daysInt = parseInt(days);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysInt);
        
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user_id)
            .gte('executed_at', startDate.toISOString())
            .order('executed_at', { ascending: false });
        
        if (error) {
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }
        
        res.json(transactions || []);
        
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/snapshots?user_id=xxx&period=1D
 * Get portfolio snapshots for performance chart
 */
router.get('/snapshots', async (req, res) => {
    try {
        const { user_id, period = '1D' } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        // Calculate time range based on period
        const now = new Date();
        let startDate;
        
        switch (period) {
            case '1D':
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '1W':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '1M':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '3M':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case '1Y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        
        const { data: snapshots, error } = await supabase
            .from('portfolio_snapshots')
            .select('*')
            .eq('user_id', user_id)
            .gte('snapshot_at', startDate.toISOString())
            .order('snapshot_at', { ascending: true });
        
        if (error) {
            console.error('[Portfolio] Supabase error:', error);
            return res.status(500).json({ error: 'Failed to fetch snapshots' });
        }
        
        // If no snapshots exist, return current portfolio value as single point
        if (!snapshots || snapshots.length === 0) {
            // Get current portfolio value
            const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('cash_balance')
                .eq('user_id', user_id)
                .single();
            
            const { data: holdings } = await supabase
                .from('holdings')
                .select('current_value')
                .eq('user_id', user_id);
            
            const cashBalance = userProfile ? parseFloat(userProfile.cash_balance) : 10000;
            const holdingsValue = holdings ? holdings.reduce((sum, h) => sum + parseFloat(h.current_value || 0), 0) : 0;
            const totalValue = cashBalance + holdingsValue;
            
            // Return single snapshot at current time
            return res.json([{
                user_id,
                total_value: totalValue,
                cash_balance: cashBalance,
                holdings_value: holdingsValue,
                snapshot_at: now.toISOString()
            }]);
        }
        
        res.json(snapshots);
        
    } catch (error) {
        console.error('[Portfolio] Exception in snapshots route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/detailed-summary?user_id=xxx
 * Get comprehensive portfolio summary for modal
 */
router.get('/detailed-summary', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        // Get summary data
        const summaryResponse = await fetch(`${req.protocol}://${req.get('host')}/api/portfolio/summary?user_id=${user_id}`);
        const summary = await summaryResponse.json();
        
        // Get detailed holdings
        const holdingsResponse = await fetch(`${req.protocol}://${req.get('host')}/api/portfolio/holdings?user_id=${user_id}`);
        const holdings = await holdingsResponse.json();
        
        // Calculate total invested
        const totalInvested = holdings.reduce((sum, h) => sum + h.total_cost, 0);
        
        res.json({
            totalValue: summary.total_value,
            availableToTrade: summary.cash,
            totalInvested: totalInvested,
            unrealizedGains: summary.total_profit_loss,
            unrealizedGainsPercent: summary.total_profit_loss_percent,
            todayChange: summary.today_profit_loss,
            todayChangePercent: summary.today_profit_loss_percent,
            positions: holdings
        });
        
    } catch (error) {
        console.error('Error fetching detailed summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;