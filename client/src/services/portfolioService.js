/**
 * Portfolio Service
 * Client-side service for portfolio data management
 */

const API_BASE = 'https://phantom-stocks.onrender.com/api';

/**
 * Get portfolio summary (cash, holdings value, total, P&L)
 */
export async function getPortfolioSummary(userId) {
  try {
    const response = await fetch(`${API_BASE}/portfolio/summary?user_id=${userId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch portfolio summary');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[PortfolioService] getPortfolioSummary error:', error);
    throw error;
  }
}

/**
 * Get all holdings (stock positions)
 */
export async function getHoldings(userId) {
  try {
    const response = await fetch(`${API_BASE}/portfolio/holdings?user_id=${userId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch holdings');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[PortfolioService] getHoldings error:', error);
    throw error;
  }
}

/**
 * Get portfolio snapshots for performance chart
 * @param {string} userId - User ID
 * @param {string} timeframe - '1D', '1W', '1M', '3M', '1Y'
 */
export async function getPortfolioSnapshots(userId, timeframe = '1W') {
  try {
    const response = await fetch(`${API_BASE}/portfolio/snapshots?user_id=${userId}&period=${timeframe}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch portfolio snapshots');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[PortfolioService] getPortfolioSnapshots error:', error);
    throw error;
  }
}

/**
 * Get transaction history
 * @param {string} userId - User ID
 * @param {number} limit - Number of transactions to fetch (default: 10)
 */
export async function getTransactions(userId, limit = 10) {
  try {
    const response = await fetch(`${API_BASE}/portfolio/transactions?user_id=${userId}&limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch transactions');
    }
    
    return await response.json();
  } catch (error) {
    console.error('[PortfolioService] getTransactions error:', error);
    throw error;
  }
}

/**
 * Calculate asset allocation percentages
 * Used for donut chart
 */
export function calculateAssetAllocation(holdings) {
  if (!holdings || holdings.length === 0) {
    return [];
  }
  
  const totalValue = holdings.reduce((sum, h) => sum + (h.current_value || 0), 0);
  
  if (totalValue === 0) {
    return [];
  }
  
  return holdings.map(holding => ({
    symbol: holding.symbol,
    name: holding.name || holding.symbol,
    value: holding.current_value || 0,
    percentage: (((holding.current_value || 0) / totalValue) * 100).toFixed(2),
    quantity: holding.quantity
  })).sort((a, b) => b.value - a.value); // Sort by value descending
}

/**
 * Format currency
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

/**
 * Format percentage
 */
export function formatPercentage(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Format date/time
 */
export function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Get color for P&L display
 */
export function getPLColor(value) {
  if (value > 0) return '#10b981'; // green
  if (value < 0) return '#ef4444'; // red
  return '#6b7280'; // gray
}