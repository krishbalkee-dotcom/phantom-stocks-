/**
 * Price Updater
 * Real-time price polling for portfolio updates
 * Updates every 30 seconds during market hours
 */

import { getCurrentPrices } from './tradingService.js';

let updateInterval = null;
let isMarketHours = false;
let subscribers = [];

/**
 * Check if current time is during market hours
 * Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
 */
function checkMarketHours() {
  const now = new Date();
  
  // Convert to ET (UTC-5 or UTC-4 depending on DST)
  const etOffset = isDST(now) ? -4 : -5;
  const etHours = now.getUTCHours() + etOffset;
  const etMinutes = now.getUTCMinutes();
  
  // Check if weekend
  const day = now.getUTCDay();
  if (day === 0 || day === 6) {
    return false;
  }
  
  // Check if within 9:30 AM - 4:00 PM ET
  const currentTimeInMinutes = etHours * 60 + etMinutes;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return currentTimeInMinutes >= marketOpen && currentTimeInMinutes < marketClose;
}

/**
 * Check if date is in DST
 */
function isDST(date) {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  return date.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
}

/**
 * Subscribe to price updates
 * @param {Function} callback - Called with updated prices object
 * @returns {Function} Unsubscribe function
 */
export function subscribe(callback) {
  subscribers.push(callback);
  
  console.log(`[PriceUpdater] Subscriber added (${subscribers.length} total)`);
  
  // Return unsubscribe function
  return () => {
    subscribers = subscribers.filter(cb => cb !== callback);
    console.log(`[PriceUpdater] Subscriber removed (${subscribers.length} remaining)`);
  };
}

/**
 * Notify all subscribers with new prices
 */
function notifySubscribers(prices) {
  subscribers.forEach(callback => {
    try {
      callback(prices);
    } catch (error) {
      console.error('[PriceUpdater] Subscriber callback error:', error);
    }
  });
}

/**
 * Start price updates
 * @param {string[]} symbols - Array of symbols to track
 * @param {number} intervalMs - Update interval in milliseconds (default: 30000 = 30 seconds)
 */
export function startPriceUpdates(symbols, intervalMs = 30000) {
  if (updateInterval) {
    console.log('[PriceUpdater] Already running, stopping previous interval');
    stopPriceUpdates();
  }
  
  if (!symbols || symbols.length === 0) {
    console.log('[PriceUpdater] No symbols to track');
    return;
  }
  
  isMarketHours = checkMarketHours();
  
  console.log(`[PriceUpdater] Starting updates for ${symbols.length} symbols`);
  console.log(`[PriceUpdater] Market hours: ${isMarketHours ? 'YES' : 'NO'}`);
  console.log(`[PriceUpdater] Update interval: ${intervalMs / 1000}s`);
  
  // Fetch immediately
  fetchAndNotify(symbols);
  
  // Then fetch on interval
  updateInterval = setInterval(() => {
    // Recheck market hours each interval
    isMarketHours = checkMarketHours();
    
    fetchAndNotify(symbols);
  }, intervalMs);
}

/**
 * Fetch prices and notify subscribers
 */
async function fetchAndNotify(symbols) {
  try {
    const prices = await getCurrentPrices(symbols);
    
    if (Object.keys(prices).length > 0) {
      console.log(`[PriceUpdater] Fetched ${Object.keys(prices).length} prices`);
      notifySubscribers(prices);
    }
    
  } catch (error) {
    console.error('[PriceUpdater] Fetch error:', error);
  }
}

/**
 * Stop price updates
 */
export function stopPriceUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('[PriceUpdater] Stopped');
  }
}

/**
 * Update tracking symbols (replaces current list)
 * @param {string[]} symbols - New array of symbols to track
 */
export function updateSymbols(symbols, intervalMs = 30000) {
  stopPriceUpdates();
  startPriceUpdates(symbols, intervalMs);
}

/**
 * Get current market status
 */
export function getMarketStatus() {
  return {
    isOpen: checkMarketHours(),
    isRunning: updateInterval !== null,
    subscriberCount: subscribers.length
  };
}

/**
 * Format market hours message for UI
 */
export function getMarketHoursMessage() {
  const status = getMarketStatus();
  
  if (status.isOpen) {
    return '🟢 Market is open';
  } else {
    return '🔴 Market is closed';
  }
}