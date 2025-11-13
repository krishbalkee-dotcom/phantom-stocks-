// Portfolio Routes - Get portfolio data
import express from 'express';
import fetch from 'node-fetch';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/**
 * Helper function to fetch current prices from Polygon
 */
async function fetchCurrentPrices(symbols) {
    if (!symbols || symbols.length === 0) return {};
    
    const prices = {};
    const POLYGON_KEY = process.env.POLYGON_API_KEY;
    
    const promises = symbols.map(async (symbol) => {
        try {
            const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${POLYGON_KEY}`;
            const response = await fetch(url);
            
            if (!response.ok) return;
            
            const data = await response.json();
            
            if (data.status === 'OK' && data.results && data.results.length > 0) {
                prices[symbol] = parseFloat(data.results[0].c);
            }
        } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
        }
    });
    
    await Promise.all(promises);
    return prices;
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
            .select('symbol, quantity')
            .eq('user_id', user_id);
        
        if (holdingsError) {
            return res.status(500).json({ error: 'Failed to fetch holdings' });
        }
        
        // Calculate total holdings value using current prices
        let totalHoldingsValue = 0;
        if (holdings && holdings.length > 0) {
            const symbols = holdings.map(h => h.symbol);
            const currentPrices = await fetchCurrentPrices(symbols);
            
            // Update holdings with current prices
            for (const holding of holdings) {
                const currentPrice = currentPrices[holding.symbol];
                if (currentPrice) {
                    const currentValue = holding.quantity * currentPrice;
                    totalHoldingsValue += currentValue;
                    
                    // Update the holding's current_price and current_value in database
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
        
        const cashBalance = parseFloat(userProfile.cash_balance);
        const totalValue = cashBalance + totalHoldingsValue;
        const initialBalance = 10000; // Starting balance
        const totalProfitLoss = totalValue - initialBalance;
        const totalProfitLossPercent = (totalProfitLoss / initialBalance) * 100;
        
        res.json({
            cash: cashBalance,
            total_value: totalValue,
            initial_balance: initialBalance,
            total_profit_loss: totalProfitLoss,
            total_profit_loss_percent: totalProfitLossPercent,
            holdings_value: totalHoldingsValue,
            num_holdings: holdings ? holdings.length : 0
        });
        
    } catch (error) {
        console.error('Error fetching portfolio summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/holdings?user_id=xxx
 * Get all holdings for a user
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
        
        // Fetch current prices and update holdings
        if (holdings && holdings.length > 0) {
            const symbols = holdings.map(h => h.symbol);
            const currentPrices = await fetchCurrentPrices(symbols);
            
            // Enrich holdings with latest prices and calculations
            const enrichedHoldings = await Promise.all(holdings.map(async (holding) => {
                const currentPrice = currentPrices[holding.symbol] || holding.current_price || holding.avg_purchase_price;
                const currentValue = holding.quantity * currentPrice;
                const totalCost = holding.avg_purchase_price * holding.quantity;
                const profitLoss = currentValue - totalCost;
                const profitLossPercent = (profitLoss / totalCost) * 100;
                
                // Update database with latest price
                await supabase
                    .from('holdings')
                    .update({
                        current_price: currentPrice,
                        current_value: currentValue
                    })
                    .eq('id', holding.id);
                
                return {
                    ...holding,
                    current_price: currentPrice,
                    current_value: currentValue,
                    total_cost: totalCost,
                    profit_loss: profitLoss,
                    profit_loss_percent: profitLossPercent
                };
            }));
            
            return res.json(enrichedHoldings);
        }
        
        res.json([]);
        
    } catch (error) {
        console.error('Error fetching holdings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/portfolio/transactions?user_id=xxx&limit=10
 * Get transaction history for a user
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
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }
        
        // Transform type to action for frontend compatibility
        const transformedTransactions = transactions.map(tx => ({
            ...tx,
            action: tx.type, // Map 'type' to 'action' for frontend
            total_amount: tx.total_value, // Map 'total_value' to 'total_amount'
            created_at: tx.executed_at // Map 'executed_at' to 'created_at'
        }));
        
        res.json(transformedTransactions);
        
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
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });
        
        if (error) {
            return res.status(500).json({ error: 'Failed to fetch snapshots' });
        }
        
        res.json(snapshots || []);
        
    } catch (error) {
        console.error('Error fetching snapshots:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;