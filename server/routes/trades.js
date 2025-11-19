// Trades Routes - Execute trades and search stocks
import express from 'express';
import fetch from 'node-fetch';
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
        
        // Get user's profile (cash_balance)
        const { data: userProfile, error: profileError } = await supabase
            .from('user_profiles')
            .select('cash_balance')
            .eq('user_id', user_id)
            .single();
        
        if (profileError || !userProfile) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        
        const totalAmount = quantity * price;
        
        // Handle BUY action
        if (action === 'BUY') {
            // Check if user has enough cash
            if (userProfile.cash_balance < totalAmount) {
                return res.status(400).json({ error: 'Insufficient funds' });
            }
            
            // Get or create holding
            const { data: existingHolding, error: holdingError } = await supabase
                .from('holdings')
                .select('*')
                .eq('user_id', user_id)
                .eq('symbol', symbol)
                .maybeSingle();
            
            if (existingHolding) {
                // Update existing holding
                const newQuantity = parseFloat(existingHolding.quantity) + parseFloat(quantity);
                const newTotalCost = (parseFloat(existingHolding.avg_purchase_price) * parseFloat(existingHolding.quantity)) + totalAmount;
                const newAvgPrice = newTotalCost / newQuantity;
                const newCurrentValue = newQuantity * price;
                
                const { error: updateError } = await supabase
                    .from('holdings')
                    .update({
                        quantity: newQuantity,
                        avg_purchase_price: newAvgPrice,
                        current_price: price,
                        current_value: newCurrentValue,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existingHolding.id);
                
                if (updateError) {
                    console.error('Error updating holding:', updateError);
                    return res.status(500).json({ error: 'Failed to update holding' });
                }
            } else {
                // Create new holding
                const { error: insertError } = await supabase
                    .from('holdings')
                    .insert({
                        user_id,
                        symbol,
                        quantity,
                        avg_purchase_price: price,
                        current_price: price,
                        current_value: totalAmount
                    });
                
                if (insertError) {
                    console.error('Error creating holding:', insertError);
                    return res.status(500).json({ error: 'Failed to create holding' });
                }
            }
            
            // Update user cash balance
            const { error: cashUpdateError } = await supabase
                .from('user_profiles')
                .update({
                    cash_balance: parseFloat(userProfile.cash_balance) - totalAmount,
                    last_active: new Date().toISOString()
                })
                .eq('user_id', user_id);
            
            if (cashUpdateError) {
                console.error('Error updating cash balance:', cashUpdateError);
                return res.status(500).json({ error: 'Failed to update cash balance' });
            }
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
            
            if (parseFloat(holding.quantity) < parseFloat(quantity)) {
                return res.status(400).json({ error: 'Insufficient shares' });
            }
            
            // Update or delete holding
            if (parseFloat(holding.quantity) === parseFloat(quantity)) {
                // Delete holding (selling all shares)
                const { error: deleteError } = await supabase
                    .from('holdings')
                    .delete()
                    .eq('id', holding.id);
                
                if (deleteError) {
                    console.error('Error deleting holding:', deleteError);
                    return res.status(500).json({ error: 'Failed to delete holding' });
                }
            } else {
                // Update holding (selling partial shares)
                const newQuantity = parseFloat(holding.quantity) - parseFloat(quantity);
                const newCurrentValue = newQuantity * price;
                
                const { error: updateError } = await supabase
                    .from('holdings')
                    .update({
                        quantity: newQuantity,
                        current_price: price,
                        current_value: newCurrentValue,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', holding.id);
                
                if (updateError) {
                    console.error('Error updating holding:', updateError);
                    return res.status(500).json({ error: 'Failed to update holding' });
                }
            }
            
            // Update user cash balance
            const { error: cashUpdateError } = await supabase
                .from('user_profiles')
                .update({
                    cash_balance: parseFloat(userProfile.cash_balance) + totalAmount,
                    last_active: new Date().toISOString()
                })
                .eq('user_id', user_id);
            
            if (cashUpdateError) {
                console.error('Error updating cash balance:', cashUpdateError);
                return res.status(500).json({ error: 'Failed to update cash balance' });
            }
        }
        
        // Get company name from Polygon (optional, for better UX)
        let companyName = symbol;
        try {
            const details = await polygonService.getTickerDetails(symbol);
            companyName = details.name || symbol;
        } catch (e) {
            console.warn('Could not fetch company name:', e.message);
        }
        
        // Record transaction
        const { data: transaction, error: transactionError } = await supabase
            .from('transactions')
            .insert({
                user_id,
                symbol,
                company_name: companyName,
                type: action, // Use 'type' column, not 'action'
                quantity,
                price,
                total_value: totalAmount
            })
            .select()
            .single();
        
        if (transactionError) {
            console.error('Error recording transaction:', transactionError);
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
        
        // Sort by relevance: name starts with → symbol starts with → name contains → alphabetical
        const sortedResults = results.sort((a, b) => {
            const aSymbol = a.symbol.toUpperCase();
            const bSymbol = b.symbol.toUpperCase();
            const aName = (a.name || '').toUpperCase();
            const bName = (b.name || '').toUpperCase();
            const queryUpper = q.toUpperCase();
            
            // Priority 1: Exact symbol match
            if (aSymbol === queryUpper) return -1;
            if (bSymbol === queryUpper) return 1;
            
            // Priority 2: Company name STARTS with query (e.g., "NVID" → "NVIDIA")
            const aNameStarts = aName.startsWith(queryUpper);
            const bNameStarts = bName.startsWith(queryUpper);
            if (aNameStarts && !bNameStarts) return -1;
            if (bNameStarts && !aNameStarts) return 1;
            
            // Priority 3: Symbol STARTS with query (e.g., "NV" → "NVDA")
            const aSymbolStarts = aSymbol.startsWith(queryUpper);
            const bSymbolStarts = bSymbol.startsWith(queryUpper);
            if (aSymbolStarts && !bSymbolStarts) return -1;
            if (bSymbolStarts && !aSymbolStarts) return 1;
            
            // Priority 4: Company name CONTAINS query (e.g., "NVI" → "NVIDIA")
            const aNameContains = aName.includes(queryUpper);
            const bNameContains = bName.includes(queryUpper);
            if (aNameContains && !bNameContains) return -1;
            if (bNameContains && !aNameContains) return 1;
            
            // Priority 5: Alphabetical by symbol
            return aSymbol.localeCompare(bSymbol);
        });
        
        // Cache results
        cacheService.cacheSearchResults(q, sortedResults);
        
        res.json(sortedResults);
        
    } catch (error) {
        console.error('Error searching tickers:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/trades/prices?symbols=AAPL,TSLA,MSFT
 * Get current prices for multiple symbols
 */
router.get('/prices', async (req, res) => {
    try {
        const { symbols } = req.query;
        
        if (!symbols) {
            return res.status(400).json({ error: 'symbols parameter required' });
        }
        
        const symbolArray = symbols.split(',').map(s => s.trim().toUpperCase());
        
        const prices = {};
        const POLYGON_KEY = process.env.POLYGON_API_KEY;
        
        // Fetch prices in parallel
        const promises = symbolArray.map(async (symbol) => {
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
        
        res.json(prices);
        
    } catch (error) {
        console.error('Error fetching prices:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;