/**
 * Trading Service
 * Client-side service for trade execution and price fetching
 */

const API_BASE = 'http://localhost:3001/api';

/**
 * Execute a trade (buy or sell)
 * @param {string} userId - User ID
 * @param {string} symbol - Stock symbol
 * @param {string} type - 'BUY' or 'SELL'
 * @param {number} quantity - Number of shares (can be fractional)
 * @returns {Promise<Object>} Trade result with updated portfolio
 */
export async function executeTrade(userId, symbol, type, quantity) {
  try {
    const response = await fetch(`${API_BASE}/trades/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        symbol: symbol.toUpperCase(),
        type,
        quantity: parseFloat(quantity)
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Trade execution failed');
    }
    
    console.log(`[TradingService] ${type} ${quantity} ${symbol} @ $${data.price}`);
    
    return data;
    
  } catch (error) {
    console.error('[TradingService] executeTrade error:', error);
    throw error;
  }
}

/**
 * Get current prices for multiple symbols
 * @param {string[]} symbols - Array of stock symbols
 * @returns {Promise<Object>} Object mapping symbol to price
 */
export async function getCurrentPrices(symbols) {
  try {
    if (!symbols || symbols.length === 0) {
      return {};
    }
    
    const symbolsParam = symbols.join(',');
    const response = await fetch(`${API_BASE}/trades/prices?symbols=${symbolsParam}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch prices');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[TradingService] getCurrentPrices error:', error);
    throw error;
  }
}

/**
 * Search for stocks by symbol or company name
 * @param {string} query - Search query
 * @returns {Promise<Array>} Array of matching stocks
 */
export async function searchStocks(query) {
  try {
    if (!query || query.trim().length < 1) {
      return [];
    }
    
    const response = await fetch(`${API_BASE}/trades/search?query=${encodeURIComponent(query)}`);
    
    if (!response.ok) {
      throw new Error('Search failed');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[TradingService] searchStocks error:', error);
    return [];
  }
}

/**
 * Validate trade before execution
 * @param {string} type - 'BUY' or 'SELL'
 * @param {number} quantity - Number of shares
 * @param {number} price - Current price per share
 * @param {number} cashBalance - User's cash balance
 * @param {number} currentHolding - User's current holding quantity (for sell)
 * @returns {Object} { valid: boolean, error?: string }
 */
export function validateTrade(type, quantity, price, cashBalance, currentHolding = 0) {
  // Validate quantity
  if (!quantity || quantity <= 0) {
    return { valid: false, error: 'Quantity must be greater than 0' };
  }
  
  const totalCost = quantity * price;
  
  if (type === 'BUY') {
    // Check if user has enough cash
    if (totalCost > cashBalance) {
      return { 
        valid: false, 
        error: `Insufficient funds. Need $${totalCost.toFixed(2)}, have $${cashBalance.toFixed(2)}` 
      };
    }
  } else if (type === 'SELL') {
    // Check if user has enough shares
    if (quantity > currentHolding) {
      return { 
        valid: false, 
        error: `Insufficient shares. Trying to sell ${quantity}, have ${currentHolding}` 
      };
    }
  }
  
  return { valid: true };
}

/**
 * Calculate total cost/proceeds for a trade
 * @param {string} type - 'BUY' or 'SELL'
 * @param {number} quantity - Number of shares
 * @param {number} price - Price per share
 * @returns {Object} { total: number, formatted: string }
 */
export function calculateTradeTotal(type, quantity, price) {
  const total = quantity * price;
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(total);
  
  return {
    total,
    formatted,
    type // Include type for UI display
  };
}

/**
 * Format stock quote data for display
 */
export function formatQuoteData(quote) {
  return {
    symbol: quote.symbol,
    name: quote.name || quote.symbol,
    price: parseFloat(quote.price || quote.close || 0),
    open: parseFloat(quote.open || 0),
    high: parseFloat(quote.high || 0),
    low: parseFloat(quote.low || 0),
    close: parseFloat(quote.close || quote.price || 0),
    change: parseFloat(quote.change || 0),
    changePercent: parseFloat(quote.changePercent || 0)
  };
}