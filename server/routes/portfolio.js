// Portfolio Routes - Get portfolio data
import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

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
        
        // Get portfolio
        const { data: portfolio, error: portfolioError } = await supabase
            .from('portfolios')
            .select('*')
            .eq('user_id', user_id)
            .single();
        
        if (portfolioError) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        // Get all holdings
        const { data: holdings, error: holdingsError } = await supabase
            .from('holdings')
            .select('*')
            .eq('user_id', user_id);
        
        if (holdingsError) {
            return res.status(500).json({ error: 'Failed to fetch holdings' });
        }
        
        // Calculate total value
        let totalHoldingsValue = 0;
        if (holdings && holdings.length > 0) {
            totalHoldingsValue = holdings.reduce((sum, holding) => {
                return sum + (holding.current_value || 0);
            }, 0);
        }
        
        const totalValue = portfolio.cash + totalHoldingsValue;
        const initialBalance = portfolio.initial_balance || 10000;
        const totalProfitLoss = totalValue - initialBalance;
        const totalProfitLossPercent = (totalProfitLoss / initialBalance) * 100;
        
        res.json({
            cash: portfolio.cash,
            total_value: totalValue,
            initial_balance: initialBalance,
            total_profit_loss: totalProfitLoss,
            total_profit_loss_percent: totalProfitLossPercent,
            holdings_value: totalHoldingsValue,
            num_holdings: holdings ? holdings.length : 0,
            updated_at: portfolio.updated_at
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
        
        // Calculate profit/loss for each holding
        const enrichedHoldings = holdings.map(holding => {
            const totalCost = holding.average_cost * holding.quantity;
            const currentValue = holding.current_value || 0;
            const profitLoss = currentValue - totalCost;
            const profitLossPercent = (profitLoss / totalCost) * 100;
            
            return {
                ...holding,
                total_cost: totalCost,
                profit_loss: profitLoss,
                profit_loss_percent: profitLossPercent
            };
        });
        
        res.json(enrichedHoldings);
        
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
            .order('created_at', { ascending: false })
            .limit(parseInt(limit));
        
        if (error) {
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }
        
        res.json(transactions);
        
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