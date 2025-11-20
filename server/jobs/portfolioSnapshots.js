/**
 * Portfolio Snapshots Cron Job
 * Runs every 30 minutes to create:
 * 1. Portfolio value snapshots (for performance chart)
 * 2. Holdings price snapshots (for Recent Change metric)
 */

import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Fetch current prices for multiple symbols from Polygon
 */
async function fetchCurrentPrices(symbols) {
  if (!symbols || symbols.length === 0) return {};
  
  const prices = {};
  const POLYGON_KEY = process.env.POLYGON_API_KEY;
  
  // Fetch in parallel
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
      console.error(`[Cron] Error fetching price for ${symbol}:`, error);
    }
  });
  
  await Promise.all(promises);
  
  return prices;
}

/**
 * Calculate portfolio value for a user
 */
async function calculatePortfolioValue(userId) {
  try {
    // Get user's cash balance
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('cash_balance')
      .eq('user_id', userId)
      .single();
    
    if (profileError || !profile) {
      console.error(`[Cron] Error fetching profile for ${userId}:`, profileError);
      return null;
    }
    
    const cashBalance = parseFloat(profile.cash_balance);
    
    // Get user's holdings
    const { data: holdings, error: holdingsError } = await supabase
      .from('holdings')
      .select('symbol, quantity')
      .eq('user_id', userId);
    
    if (holdingsError) {
      console.error(`[Cron] Error fetching holdings for ${userId}:`, holdingsError);
      return null;
    }
    
    if (!holdings || holdings.length === 0) {
      // No holdings, just cash
      return {
        totalValue: cashBalance,
        cashBalance: cashBalance,
        holdingsValue: 0,
        holdings: []
      };
    }
    
    // Fetch current prices for all held symbols
    const symbols = holdings.map(h => h.symbol);
    const prices = await fetchCurrentPrices(symbols);
    
    // Calculate total holdings value and prepare holdings data
    let holdingsValue = 0;
    const holdingsWithPrices = [];
    
    holdings.forEach(holding => {
      const currentPrice = prices[holding.symbol];
      if (currentPrice) {
        holdingsValue += parseFloat(holding.quantity) * currentPrice;
        holdingsWithPrices.push({
          symbol: holding.symbol,
          price: currentPrice
        });
      }
    });
    
    const totalValue = cashBalance + holdingsValue;
    
    return {
      totalValue,
      cashBalance,
      holdingsValue,
      holdings: holdingsWithPrices
    };
    
  } catch (error) {
    console.error(`[Cron] Exception calculating portfolio for ${userId}:`, error);
    return null;
  }
}

/**
 * Create portfolio and holdings snapshots for all users
 */
async function createSnapshots() {
  console.log('[Cron] Starting portfolio and holdings snapshot creation...');
  const startTime = Date.now();
  
  try {
    // Get all active users (active in last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('user_id')
      .gte('last_active', thirtyDaysAgo);
    
    if (usersError) {
      console.error('[Cron] Error fetching users:', usersError);
      return;
    }
    
    console.log(`[Cron] Found ${users.length} active users`);
    
    let portfolioSuccessCount = 0;
    let holdingsSuccessCount = 0;
    let errorCount = 0;
    
    // Process each user
    for (const user of users) {
      const portfolioData = await calculatePortfolioValue(user.user_id);
      
      if (!portfolioData) {
        errorCount++;
        continue;
      }
      
      // Insert portfolio snapshot
      const { error: portfolioError } = await supabase
        .from('portfolio_snapshots')
        .insert({
          user_id: user.user_id,
          total_value: portfolioData.totalValue,
          cash_balance: portfolioData.cashBalance,
          holdings_value: portfolioData.holdingsValue
        });
      
      if (portfolioError) {
        console.error(`[Cron] Error inserting portfolio snapshot for ${user.user_id}:`, portfolioError);
        errorCount++;
      } else {
        portfolioSuccessCount++;
      }
      
      // Insert holdings snapshots for each holding
      if (portfolioData.holdings && portfolioData.holdings.length > 0) {
        const holdingsSnapshots = portfolioData.holdings.map(holding => ({
          user_id: user.user_id,
          symbol: holding.symbol,
          price: holding.price
        }));
        
        const { error: holdingsError } = await supabase
          .from('holdings_snapshots')
          .insert(holdingsSnapshots);
        
        if (holdingsError) {
          console.error(`[Cron] Error inserting holdings snapshots for ${user.user_id}:`, holdingsError);
          errorCount++;
        } else {
          holdingsSuccessCount += holdingsSnapshots.length;
        }
      }
    }
    
    // Cleanup old snapshots (keep only last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    await supabase
      .from('holdings_snapshots')
      .delete()
      .lt('snapshot_at', sevenDaysAgo);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Cron] Snapshot creation complete:`);
    console.log(`  - Portfolio snapshots: ${portfolioSuccessCount} success`);
    console.log(`  - Holdings snapshots: ${holdingsSuccessCount} success`);
    console.log(`  - Errors: ${errorCount}`);
    console.log(`  - Duration: ${duration}s`);
    
  } catch (error) {
    console.error('[Cron] Exception during snapshot creation:', error);
  }
}

/**
 * Initialize cron job
 * Runs every 30 minutes
 */
export function startPortfolioSnapshotJob() {
  console.log('[Cron] Initializing portfolio and holdings snapshot job (every 30 minutes)');
  
  // Run immediately on startup
  createSnapshots();
  
  // Schedule to run every 30 minutes: */30 * * * *
  cron.schedule('*/30 * * * *', () => {
    console.log('[Cron] Triggered at:', new Date().toISOString());
    createSnapshots();
  });
  
  console.log('[Cron] Job scheduled successfully');
}

// If run directly (for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[Cron] Running snapshot job manually...');
  createSnapshots().then(() => {
    console.log('[Cron] Manual run complete');
    process.exit(0);
  });
}