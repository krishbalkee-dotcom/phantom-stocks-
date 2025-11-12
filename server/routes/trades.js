// Trades Routes - Execute trades and search stocks
import express from 'express';
import { supabase } from '../config/supabase.js';
import polygonService from '../services/polygonService.js';
import cacheService from '../services/cacheService.js';

const router = express.Router();

/**
 * POST /api/trades/execute
 * Execute a buy or sell trade
 */
router.post('/execute', async (req, res) => {
    try {
        const { user_id, symbol, action, quantity, price } = req.body;
        
        // Validate inputs
        if (!user_id || !symbol || !action || !quantity || !price) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (action !== 'BUY' && action !== 'SELL') {
            return res.status(400).json({ error: 'Invalid action. Must be BUY or SELL' });
        }
        
        if (quantity <= 0) {
            return res.status(400).json({ error: 'Quantity must be greater than 0' });
        }
        
        // Get user's portfolio
        const { data: portfolio, error: portfolioError } = await supabase
            .from('portfolios')
            .select('*')
            .eq('user_id', user_id)
            .single();
        
        if (portfolioError) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }
        
        const totalAmount = quantity * price;
        
        // Handle BUY action
        if (action === 'BUY') {
            // Check if user has enough cash
            if (portfolio.cash < totalAmount) {
                return res.status(400).json({ error: 'Insufficient funds' });
            }
            
            // Get or create holding
            const { data: existingHolding, error: holdingError } = await supabase
                .from('holdings')
                .select('*')
                .eq('user_id', user_id)
                .eq('symbol', symbol)
                .single();
            
            if (existingHolding) {
                // Update existing holding
                const newQuantity = existingHolding.quantity + quantity;
                const newTotalCost = (existingHolding.average_cost * existingHolding.quantity) + totalAmount;
                const newAverageCost = newTotalCost / newQuantity;
                
                await supabase
                    .from('holdings')
                    .update({
                        quantity: newQuantity,
                        average_cost: newAverageCost,
                        current_price: price,
                        current_value: newQuantity * price,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingHolding.id);
            } else {
                // Create new holding
                await supabase
                    .from('holdings')
                    .insert({
                        user_id,
                        symbol,
                        quantity,
                        average_cost: price,
                        current_price: price,
                        current_value: totalAmount
                    });
            }
            
            // Update portfolio cash
            await supabase
                .from('portfolios')
                .update({
                    cash: portfolio.cash - totalAmount,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user_id);
        }
        
        // Handle SELL action
        if (action === 'SELL') {
            // Check if user has the holding
            const { data: holding, error: holdingError } = await supabase
                .from('holdings')
                .select('*')
                .eq('user_id', user_id)
                .eq('symbol', symbol)
                .single();
            
            if (!holding) {
                return res.status(400).json({ error: 'You do not own this stock' });
            }
            
            if (holding.quantity < quantity) {
                return res.status(400).json({ error: 'Insufficient shares' });
            }
            
            // Update or delete holding
            if (holding.quantity === quantity) {
                // Delete holding (selling all shares)
                await supabase
                    .from('holdings')
                    .delete()
                    .eq('id', holding.id);
            } else {
                // Update holding (selling partial shares)
                const newQuantity = holding.quantity - quantity;
                
                await supabase
                    .from('holdings')
                    .update({
                        quantity: newQuantity,
                        current_price: price,
                        current_value: newQuantity * price,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', holding.id);
            }
            
            // Update portfolio cash
            await supabase
                .from('portfolios')
                .update({
                    cash: portfolio.cash + totalAmount,
                    updated_at: new Date().toISOString()
                })
                .eq('user_id', user_id);
        }
        
        // Record transaction
        const { data: transaction, error: transactionError } = await supabase
            .from('transactions')
            .insert({
                user_id,
                symbol,
                action,
                quantity,
                price,
                total_amount: totalAmount
            })
            .select()
            .single();
        
        if (transactionError) {
            return res.status(500).json({ error: 'Failed to record transaction' });
        }
        
        res.json({
            success: true,
            transaction,
            message: `${action} order executed successfully`
        });
        
    } catch (error) {
        console.error('Error executing trade:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/trades/search?q=AAPL
 * Search for stock tickers
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 1) {
            return res.status(400).json({ error: 'Search query required' });
        }
        
        // Check cache first
        const cachedResults = cacheService.getCachedSearchResults(q);
        if (cachedResults) {
            return res.json(cachedResults);
        }
        
        // Search Polygon API
        const results = await polygonService.searchTickers(q);
        
        // Cache results
        cacheService.cacheSearchResults(q, results);
        
        res.json(results);
        
    } catch (error) {
        console.error('Error searching tickers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;