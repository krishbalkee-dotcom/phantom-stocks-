// Portfolio Routes - Get portfolio data with corrected calculations + Intraday G/L
import express from 'express';
import fetch from 'node-fetch';
import { supabase } from '../config/supabase.js';
import cacheService from '../services/cacheService.js';

const router = express.Router();

/**
 * Check if market is currently open for trading
 */
function isMarketOpen() {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = etTime.getHours();
    const minutes = etTime.getMinutes();
    const timeDecimal = hours + minutes / 60;
    
    // Pre-market: 4:00 AM - 9:30 AM
    // Regular: 9:30 AM - 4:00 PM  
    // After-hours: 4:00 PM - 8:00 PM
    // Closed: 8:00 PM - 4:00 AM
    return timeDecimal >= 4 && timeDecimal < 20;
}

/**
 * Get most recent transaction for a symbol (within X minutes)
 */
async function getRecentTransaction(userId, symbol, minutesAgo = 5) {
    try {
        const cutoff = new Date(Date.now() - minutesAgo * 60 * 1000);
        
        const { data, error } = await supabase
            .from('transactions')
            .select('price, executed_at')
            .eq('user_id', userId)
            .eq('symbol', symbol)
            .gte('executed_at', cutoff.toISOString())
            .order('executed_at', { ascending: false })
            .limit(1);
        
        if (error || !data || data.length === 0) {
            return null;
        }
        
        return {
            price: parseFloat(data[0].price),
            executedAt: data[0].executed_at
        };
    } catch (error) {
        console.error(`Error fetching recent transaction for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get holding from database
 */
async function getHolding(userId, symbol) {
    try {
        const { data, error } = await supabase
            .from('holdings')
            .select('current_price, avg_purchase_price')
            .eq('user_id', userId)
            .eq('symbol', symbol)
            .single();
        
        if (error || !data) {
            return null;
        }
        
        return {
            currentPrice: data.current_price ? parseFloat(data.current_price) : null,
            avgPurchasePrice: parseFloat(data.avg_purchase_price)
        };
    } catch (error) {
        console.error(`Error fetching holding for ${symbol}:`, error);
        return null;
    }
}

/**
 * Helper function to fetch current prices
 * PRIORITY ORDER:
 * 1. Recent transactions (< 5 min) - Most accurate!
 * 2. Live market data (if market open 4 AM - 8 PM)
 * 3. Holdings table current_price (last known good)
 * 4. Polygon /prev (today's close)
 * 5. Holdings avg_purchase_price (last resort)
 */
async function fetchCurrentPrices(symbols, userId) {
    if (!symbols || symbols.length === 0) return {};
    
    const prices = {};
    const POLYGON_KEY = process.env.POLYGON_API_KEY;
    const marketOpen = isMarketOpen();
    
    console.log(`[Portfolio] Market status: ${marketOpen ? 'OPEN' : 'CLOSED'} at ${new Date().toISOString()}`);
    
    const promises = symbols.map(async (symbol) => {
        try {
            let currentPrice = null;
            let source = null;
            
            // PRIORITY 1: Check recent transactions (< 5 minutes)
            if (userId) {
                const recentTx = await getRecentTransaction(userId, symbol, 5);
                if (recentTx) {
                    currentPrice = recentTx.price;
                    source = 'recent_transaction';
                    console.log(`[Portfolio] ${symbol}: Using recent transaction price $${currentPrice} from ${recentTx.executedAt}`);
                }
            }
            
            // PRIORITY 2: Fetch live market data (only if market open and no recent transaction)
            if (!currentPrice && marketOpen) {
                try {
                    const now = new Date();
                    const twoHoursAgo = new Date(now.getTime() - (2 * 60 * 60 * 1000));
                    
                    const fromTimestamp = twoHoursAgo.getTime();
                    const toTimestamp = now.getTime();
                    
                    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${fromTimestamp}/${toTimestamp}?adjusted=true&sort=desc&limit=30&apiKey=${POLYGON_KEY}`;
                    const response = await fetch(url);
                    
                    if (response.ok) {
                        const data = await response.json();
                        
                        if (data.status === 'OK' && data.results && data.results.length > 0) {
                            const latestBar = data.results[0];
                            currentPrice = parseFloat(latestBar.c);
                            source = 'polygon_aggregates';
                            console.log(`[Portfolio] ${symbol}: Fetched live price $${currentPrice} from aggregates (${data.results.length} bars)`);
                        }
                    }
                } catch (error) {
                    console.log(`[Portfolio] ${symbol}: Aggregates fetch failed:`, error.message);
                }
            }
            
            // PRIORITY 3: Use holdings table current_price
            if (!currentPrice && userId) {
                const holding = await getHolding(userId, symbol);
                if (holding && holding.currentPrice) {
                    currentPrice = holding.currentPrice;
                    source = 'holdings_table';
                    console.log(`[Portfolio] ${symbol}: Using holdings.current_price $${currentPrice}`);
                }
            }
            
            // PRIORITY 4: Fetch from /prev (today's close)
            if (!currentPrice) {
                try {
                    const fallbackUrl = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
                    const fallbackResponse = await fetch(fallbackUrl);
                    const fallbackData = await fallbackResponse.json();
                    
                    if (fallbackData.status === 'OK' && fallbackData.results && fallbackData.results.length > 0) {
                        currentPrice = parseFloat(fallbackData.results[0].c);
                        source = 'polygon_prev';
                        console.log(`[Portfolio] ${symbol}: Using /prev close $${currentPrice}`);
                    }
                } catch (error) {
                    console.log(`[Portfolio] ${symbol}: /prev fetch failed:`, error.message);
                }
            }
            
            // PRIORITY 5: Last resort - avg_purchase_price
            if (!currentPrice && userId) {
                const holding = await getHolding(userId, symbol);
                if (holding && holding.avgPurchasePrice) {
                    currentPrice = holding.avgPurchasePrice;
                    source = 'avg_purchase_price';
                    console.log(`[Portfolio] ${symbol}: Fallback to avg_purchase_price $${currentPrice}`);
                }
            }
            
            if (currentPrice) {
                prices[symbol] = {
                    current: currentPrice,
                    source: source
                };
                console.log(`[Portfolio] ${symbol}: Final price $${currentPrice} (source: ${source})`);
            } else {
                console.error(`[Portfolio] ${symbol}: Could not determine price from any source!`);
            }
            
        } catch (error) {
            console.error(`[Portfolio] Error fetching price for ${symbol}:`, error);
        }
    });
    
    await Promise.all(promises);
    return prices;
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
            const currentPrices = await fetchCurrentPrices(symbols, user_id);
            
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
        


/**
 * GET /api/portfolio/holdings?user_id=xxx
 * Get all holdings for a user with detailed calculations
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
        const currentPrices = await fetchCurrentPrices(symbols, user_id);
        
        // Enrich holdings with all calculations
        const enrichedHoldings = await Promise.all(holdings.map(async (holding) => {
            const priceData = currentPrices[holding.symbol];
            const currentPrice = priceData ? priceData.current : (holding.current_price || holding.avg_purchase_price);
            const todayOpen = await getTodayOpenPrice(holding.symbol);
            
            const currentValue = holding.quantity * currentPrice;
            const totalCost = holding.avg_purchase_price * holding.quantity;
            const totalProfitLoss = currentValue - totalCost;
            const totalProfitLossPercent = (totalProfitLoss / totalCost) * 100;
            
            // Today's gain/loss calculations
            let todayGainLoss = 0;
            let todayGainLossPercent = 0;
            let mostRecentChange = 0;
            let mostRecentChangePercent = 0;
            
            if (todayOpen) {
                todayGainLoss = (currentPrice - todayOpen) * holding.quantity;
                todayGainLossPercent = ((currentPrice - todayOpen) / todayOpen) * 100;
                mostRecentChange = currentPrice - todayOpen;
                mostRecentChangePercent = ((currentPrice - todayOpen) / todayOpen) * 100;
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
                total_profit_loss: totalProfitLoss,
                total_profit_loss_percent: totalProfitLossPercent,
                today_gain_loss: todayGainLoss,
                today_gain_loss_percent: todayGainLossPercent,
                most_recent_change: mostRecentChange,
                most_recent_change_percent: mostRecentChangePercent
            };
        }));
        
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