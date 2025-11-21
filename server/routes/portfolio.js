// Portfolio Routes - Get user portfolio, holdings, and transactions
import express from 'express';
import fetch from 'node-fetch';
import { supabase } from '../config/supabase.js';
import polygonService from '../services/polygonService.js';

const router = express.Router();

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Check if market is currently open (4 AM - 8 PM ET)
 */
function isMarketOpen() {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = etTime.getHours();
    const minutes = etTime.getMinutes();
    const timeDecimal = hours + minutes / 60;
    
    // Market hours: 4:00 AM - 8:00 PM ET (pre-market through after-hours)
    return timeDecimal >= 4 && timeDecimal < 20;
}

/**
 * Get recent transaction price for a symbol (within last 5 minutes)
 */
async function getRecentTransactionPrice(userId, symbol, minutesAgo = 5) {
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
        
        return parseFloat(data[0].price);
    } catch (error) {
        console.error(`Error fetching recent transaction for ${symbol}:`, error);
        return null;
    }
}

/**
 * Fetch current prices for multiple symbols with priority-based logic
 * Priority:
 * 1. Recent transaction (< 5 min)
 * 2. Live market data (if market open)
 * 3. Holdings table current_price
 * 4. Polygon /prev endpoint
 * 5. Holdings avg_purchase_price
 */
async function fetchCurrentPrices(symbols, userId) {
    const prices = {};
    const POLYGON_KEY = process.env.POLYGON_API_KEY;
    
    for (const symbol of symbols) {
        try {
            // STEP 1: Check for recent transaction (< 5 minutes)
            const recentTxPrice = await getRecentTransactionPrice(userId, symbol, 5);
            if (recentTxPrice !== null) {
                console.log(`[Portfolio] ${symbol}: Using recent transaction price $${recentTxPrice}`);
                prices[symbol] = recentTxPrice;
                continue;
            }
            
            // STEP 2: Check if market is open
            const marketOpen = isMarketOpen();
            
            if (marketOpen) {
                // STEP 3: Try to fetch live market data
                try {
                    const now = Date.now();
                    const twoHoursAgo = now - (2 * 60 * 60 * 1000);
                    
                    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/minute/${twoHoursAgo}/${now}?adjusted=true&sort=desc&limit=1&apiKey=${POLYGON_KEY}`;
                    const response = await fetch(url);
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (data.status === 'OK' && data.results && data.results.length > 0) {
                            const livePrice = parseFloat(data.results[0].c);
                            console.log(`[Portfolio] ${symbol}: Using live market price $${livePrice}`);
                            prices[symbol] = livePrice;
                            continue;
                        }
                    }
                } catch (error) {
                    console.warn(`[Portfolio] ${symbol}: Could not fetch live price:`, error.message);
                }
            } else {
                console.log(`[Portfolio] ${symbol}: Market closed, skipping live data fetch`);
            }
            
            // STEP 4: Use holdings table current_price
            const { data: holding, error: holdingError } = await supabase
                .from('holdings')
                .select('current_price, avg_purchase_price')
                .eq('user_id', userId)
                .eq('symbol', symbol)
                .single();
            
            if (!holdingError && holding && holding.current_price) {
                const holdingPrice = parseFloat(holding.current_price);
                console.log(`[Portfolio] ${symbol}: Using holdings.current_price $${holdingPrice}`);
                prices[symbol] = holdingPrice;
                continue;
            }
            
            // STEP 5: Fetch from Polygon /prev endpoint (last resort)
            try {
                const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'OK' && data.results && data.results.length > 0) {
                        const prevPrice = parseFloat(data.results[0].c);
                        console.log(`[Portfolio] ${symbol}: Using /prev price $${prevPrice}`);
                        prices[symbol] = prevPrice;
                        continue;
                    }
                }
            } catch (error) {
                console.warn(`[Portfolio] ${symbol}: Could not fetch /prev price:`, error.message);
            }
            
            // STEP 6: Ultimate fallback - use avg_purchase_price
            if (holding && holding.avg_purchase_price) {
                const avgPrice = parseFloat(holding.avg_purchase_price);
                console.log(`[Portfolio] ${symbol}: Using avg_purchase_price $${avgPrice} as fallback`);
                prices[symbol] = avgPrice;
            } else {
                console.error(`[Portfolio] ${symbol}: No price available from any source`);
                prices[symbol] = 0;
            }
            
        } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
            prices[symbol] = 0;
        }
    }
    
    return prices;
}

/**
 * Get today's opening price for a symbol (9:30 AM ET price)
 */
async function getTodayOpenPrice(symbol) {
    try {
        const POLYGON_KEY = process.env.POLYGON_API_KEY;
        
        // Get today's date in ET timezone
        const now = new Date();
        const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const today = etDate.toISOString().split('T')[0];
        
        // Fetch 1-day bar for today
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${today}/${today}?adjusted=true&apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
            return parseFloat(data.results[0].o); // Return open price
        }
        
        return null;
    } catch (error) {
        console.error(`Error fetching today's open price for ${symbol}:`, error);
        return null;
    }
}

/**
 * Get previous close price for a symbol
 */
async function getPreviousClosePrice(symbol) {
    try {
        const POLYGON_KEY = process.env.POLYGON_API_KEY;
        
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        
        if (data.status === 'OK' && data.results && data.results.length > 0) {
            return parseFloat(data.results[0].c);
        }
        
        return null;
    } catch (error) {
        console.error(`Error fetching previous close for ${symbol}:`, error);
        return null;
    }
}

// ========================================
// ROUTES
// ========================================

/**
 * GET /api/portfolio/summary
 * Get portfolio summary (total value, cash, P&L, etc.)
 */
router.get('/summary', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        // Get user profile (cash balance)
        const { data: profile, error: profileError } = await supabase
            .from('user_profiles')
            .select('cash_balance, starting_balance, created_at')
            .eq('user_id', user_id)
            .single();
        
        if (profileError || !profile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        
        // Get all holdings
        const { data: holdings, error: holdingsError } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', user_id);
        
        if (holdingsError) {
            console.error('Error fetching holdings:', holdingsError);
            return res.status(500).json({ error: 'Failed to fetch holdings' });
        }
        
        // Calculate holdings value
        let holdingsValue = 0;
        
        if (holdings && holdings.length > 0) {
            const symbols = holdings.map(h => h.symbol);
            const currentPrices = await fetchCurrentPrices(symbols, user_id);
            
            // Update holdings with current prices and calculate total
            for (const holding of holdings) {
                const currentPrice = currentPrices[holding.symbol] || parseFloat(holding.current_price) || 0;
                const quantity = parseFloat(holding.quantity);
                const currentValue = quantity * currentPrice;
                
                holdingsValue += currentValue;
                
                // Update holding in database
                await supabase
                    .from('holdings')
                    .update({
                        current_price: currentPrice,
                        current_value: currentValue,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', holding.id);
            }
        }
        
        const cashBalance = parseFloat(profile.cash_balance);
        const totalPortfolioValue = cashBalance + holdingsValue;
        const startingBalance = parseFloat(profile.starting_balance);
        
        // Calculate overall P&L
        const overallPnL = totalPortfolioValue - startingBalance;
        const overallPnLPercent = (overallPnL / startingBalance) * 100;
        
        // Calculate today's P&L (compare to most recent snapshot or starting balance)
        const { data: latestSnapshot } = await supabase
            .from('portfolio_snapshots')
            .select('total_value, cash_balance, holdings_value, created_at')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        let todayPnL = 0;
        let todayPnLPercent = 0;
        
        if (latestSnapshot) {
            const previousTotal = parseFloat(latestSnapshot.total_value);
            todayPnL = totalPortfolioValue - previousTotal;
            todayPnLPercent = (todayPnL / previousTotal) * 100;
        }
        
        res.json({
            totalValue: totalPortfolioValue,
            cashBalance: cashBalance,
            holdingsValue: holdingsValue,
            startingBalance: startingBalance,
            overallPnL: overallPnL,
            overallPnLPercent: overallPnLPercent,
            todayPnL: todayPnL,
            todayPnLPercent: todayPnLPercent,
            lastUpdated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Error fetching portfolio summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/holdings
 * Get all user holdings with current prices
 */
router.get('/holdings', async (req, res) => {
    try {
        const { user_id } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        // Get holdings from database
        const { data: holdings, error: holdingsError } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', user_id)
            .order('created_at', { ascending: false });
        
        if (holdingsError) {
            console.error('Error fetching holdings:', holdingsError);
            return res.status(500).json({ error: 'Failed to fetch holdings' });
        }
        
        if (!holdings || holdings.length === 0) {
            return res.json([]);
        }
        
        // Fetch current prices for all symbols
        const symbols = holdings.map(h => h.symbol);
        const currentPrices = await fetchCurrentPrices(symbols, user_id);
        
        // Fetch today's open prices for all symbols
        const todayOpenPrices = {};
        for (const symbol of symbols) {
            const openPrice = await getTodayOpenPrice(symbol);
            if (openPrice) {
                todayOpenPrices[symbol] = openPrice;
            }
        }
        
        // Enrich holdings with calculated values
        const enrichedHoldings = holdings.map(holding => {
            const symbol = holding.symbol;
            const quantity = parseFloat(holding.quantity);
            const avgPurchasePrice = parseFloat(holding.avg_purchase_price);
            const currentPrice = currentPrices[symbol] || parseFloat(holding.current_price) || 0;
            
            const currentValue = quantity * currentPrice;
            const totalCost = quantity * avgPurchasePrice;
            
            // Overall P&L (since purchase)
            const overallPnL = currentValue - totalCost;
            const overallPnLPercent = (overallPnL / totalCost) * 100;
            
            // Today's P&L (since today's open)
            let todayPnL = 0;
            let todayPnLPercent = 0;
            
            if (todayOpenPrices[symbol]) {
                const todayOpenValue = quantity * todayOpenPrices[symbol];
                todayPnL = currentValue - todayOpenValue;
                todayPnLPercent = (todayPnL / todayOpenValue) * 100;
            }
            
            return {
                id: holding.id,
                symbol: symbol,
                name: holding.name,
                quantity: quantity,
                avgPurchasePrice: avgPurchasePrice,
                currentPrice: currentPrice,
                currentValue: currentValue,
                totalCost: totalCost,
                overallPnL: overallPnL,
                overallPnLPercent: overallPnLPercent,
                todayPnL: todayPnL,
                todayPnLPercent: todayPnLPercent,
                createdAt: holding.created_at,
                updatedAt: holding.updated_at
            };
        });
        
        res.json(enrichedHoldings);
        
    } catch (error) {
        console.error('Error fetching holdings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/transactions
 * Get user transaction history
 */
router.get('/transactions', async (req, res) => {
    try {
        const { user_id, limit = 50 } = req.query;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', user_id)
            .order('executed_at', { ascending: false })
            .limit(parseInt(limit));
        
        if (error) {
            console.error('Error fetching transactions:', error);
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }
        
        res.json(transactions || []);
        
    } catch (error) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * POST /api/portfolio/snapshot
 * Create a portfolio snapshot (for tracking daily P&L)
 */
router.post('/snapshot', async (req, res) => {
    try {
        const { user_id } = req.body;
        
        if (!user_id) {
            return res.status(400).json({ error: 'user_id required' });
        }
        
        // Get current portfolio summary
        const summaryResponse = await fetch(`${req.protocol}://${req.get('host')}/api/portfolio/summary?user_id=${user_id}`);
        const summary = await summaryResponse.json();
        
        // Create snapshot
        const { data: snapshot, error } = await supabase
            .from('portfolio_snapshots')
            .insert({
                user_id: user_id,
                total_value: summary.totalValue,
                cash_balance: summary.cashBalance,
                holdings_value: summary.holdingsValue
            })
            .select()
            .single();
        
        if (error) {
            console.error('Error creating snapshot:', error);
            return res.status(500).json({ error: 'Failed to create snapshot' });
        }
        
        res.json(snapshot);
        
    } catch (error) {
        console.error('Error creating snapshot:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;