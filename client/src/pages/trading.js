// Trading Page Logic with Market Hours Detection and Consistent Pricing
import { requireAuth } from '../auth/authGuard.js';
import { logout } from '../auth/auth.js';
import { executeTrade, searchStocks } from '../services/tradingService.js';
import { getPortfolioSummary } from '../services/portfolioService.js';
import { initChart, loadChartData, toggleIndicator, changeChartType } from '../kline.js';

// Global state
let currentUser = null;
let currentSymbol = 'AAPL';
let currentTimeframe = '15m';
let currentChartType = 'candlestick';
let activeIndicators = new Set();
let portfolioData = null;
let currentPrice = 0;
let currentHolding = 0;

// Show sliding notification
function showNotification(message) {
    if (!document.querySelector('style[data-notification-animations]')) {
        const style = document.createElement('style');
        style.setAttribute('data-notification-animations', 'true');
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes fadeOut {
                to {
                    opacity: 0;
                    transform: translateX(400px);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    const existing = document.querySelector('.order-notification');
    if (existing) {
        existing.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'order-notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: rgba(0, 0, 0, 0.95);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        z-index: 10000;
        font-size: 14px;
        font-weight: 300;
        animation: slideInRight 0.3s ease, fadeOut 0.3s ease 2.7s forwards;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

/**
 * Trading Session Detection
 */
function getTradingSession() {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = etTime.getHours();
    const minutes = etTime.getMinutes();
    const timeDecimal = hours + minutes / 60;
    
    if (timeDecimal >= 4 && timeDecimal < 9.5) {
        return 'PRE_MARKET';
    } else if (timeDecimal >= 9.5 && timeDecimal < 16) {
        return 'REGULAR';
    } else if (timeDecimal >= 16 && timeDecimal < 20) {
        return 'AFTER_HOURS';
    } else {
        return 'CLOSED';
    }
}

function isMarketOpen() {
    const session = getTradingSession();
    return session !== 'CLOSED';
}

function getSessionInfo() {
    const session = getTradingSession();
    
    const sessionConfig = {
        'PRE_MARKET': {
            label: 'PRE-MARKET TRADING',
            message: 'Limited liquidity. Prices may be volatile.',
            tradingEnabled: true
        },
        'REGULAR': {
            label: 'MARKET OPEN',
            message: '',
            tradingEnabled: true
        },
        'AFTER_HOURS': {
            label: 'AFTER-HOURS TRADING',
            message: 'Lower volume. Wider spreads possible.',
            tradingEnabled: true
        },
        'CLOSED': {
            label: 'MARKET CLOSED',
            message: 'Trading resumes at 4:00 AM ET (Pre-Market)',
            tradingEnabled: false
        }
    };
    
    return sessionConfig[session];
}

/**
 * Update trading UI based on market session
 */
function updateTradingUI() {
    const sessionInfo = getSessionInfo();
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    const quantityInput = document.getElementById('quantity');
    
    if (!sessionInfo.tradingEnabled) {
        // DISABLE trading
        if (buyBtn) {
            buyBtn.disabled = true;
            buyBtn.style.opacity = '0.5';
            buyBtn.style.cursor = 'not-allowed';
        }
        if (sellBtn) {
            sellBtn.disabled = true;
            sellBtn.style.opacity = '0.5';
            sellBtn.style.cursor = 'not-allowed';
        }
        if (quantityInput) {
            quantityInput.disabled = true;
            quantityInput.style.opacity = '0.5';
        }
        
        // Show market closed message
        showNotification(`${sessionInfo.label}: ${sessionInfo.message}`);
    } else {
        // ENABLE trading
        if (buyBtn) {
            buyBtn.disabled = false;
            buyBtn.style.opacity = '1';
            buyBtn.style.cursor = 'pointer';
        }
        if (sellBtn) {
            sellBtn.disabled = false;
            sellBtn.style.opacity = '1';
            sellBtn.style.cursor = 'pointer';
        }
        if (quantityInput) {
            quantityInput.disabled = false;
            quantityInput.style.opacity = '1';
        }
        
        // Show session warning if not regular hours
        const session = getTradingSession();
        if (session !== 'REGULAR' && sessionInfo.message) {
            showNotification(`${sessionInfo.label}: ${sessionInfo.message}`);
        }
    }
}

// Initialize page
async function initializePage() {
    try {
        currentUser = await requireAuth();
        await loadPortfolioData();
        updateUserInfo();
        setupEventListeners();
        
        // Initialize chart
        initChart('chart-container');
        
        // Load initial chart
        await loadChart(currentSymbol, currentTimeframe);
        
        // Update trade card
        await updateTradeCard(currentSymbol);
        
        // Update trading UI based on market hours
        updateTradingUI();
        
        // Update trading UI every minute
        setInterval(updateTradingUI, 60000);
        
    } catch (error) {
        console.error('Failed to initialize trading page:', error);
        window.location.href = '../index.html';
    }
}

// Load portfolio data
async function loadPortfolioData() {
    try {
        portfolioData = await getPortfolioSummary(currentUser.id);
        updateCashDisplay();
    } catch (error) {
        console.error('Error loading portfolio:', error);
    }
}

// Update user info
function updateUserInfo() {
    const { user_metadata } = currentUser;
    const username = user_metadata?.username || currentUser.email.split('@')[0];
    const usernameEl = document.getElementById('username');
    if (usernameEl) {
        usernameEl.textContent = username;
    }
}

// Update cash display
function updateCashDisplay() {
    const cash = portfolioData?.cash || 0;
    const cashEl = document.getElementById('cashDisplay');
    if (cashEl) {
        cashEl.textContent = `$${cash.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }
}

// Load chart - SILENT
async function loadChart(symbol, timeframe) {
    try {
        console.log(`Loading chart: ${symbol} ${timeframe}`);
        
        // Show loading
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
        // Fetch chart data
        const response = await fetch(`https://phantom-stocks.onrender.com/api/market-data/chart?symbol=${symbol}&timeframe=${timeframe}`);
        const chartData = await response.json();
        
        // Check for warnings
        if (chartData.metadata?.hasLimitedData) {
            showNotification(`Limited trading data for ${symbol} (${chartData.metadata.barCount} bars). Switch to Line/Baseline chart recommended`);
        }
        
        // Check for after-hours 1-minute warning
        if (timeframe === '1m') {
            const now = new Date();
            const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
            const etHours = etTime.getHours();
            
            const isAfterHours = (etHours >= 16 && etHours < 20) || (etHours >= 4 && etHours < 9.5);
            
            if (isAfterHours) {
                showNotification('After-hours 1-minute data may appear sparse due to low trading volume. This is normal.');
            }
        }
        
        await loadChartData(symbol, timeframe);
        
        // Hide loading
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        
        // Show trade card
        const tradeCard = document.getElementById('tradeCard');
        if (tradeCard) tradeCard.style.display = 'block';
        
        // Update trade card with symbol info
        await updateTradeCard(symbol);
        
        console.log('Chart loaded successfully');
    } catch (error) {
        console.error('Error loading chart:', error);
        
        // Hide loading on error
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

// Update trade card - USES METADATA.LATESTPRICE (ALWAYS CONSISTENT)
async function updateTradeCard(symbol) {
    try {
        // Fetch chart data
        const chartResponse = await fetch(`https://phantom-stocks.onrender.com/api/market-data/chart?symbol=${symbol}&timeframe=${currentTimeframe}`);
        const chartData = await chartResponse.json();
        
        // CRITICAL: Use metadata.latestPrice (SAME for all timeframes)
        // NO FALLBACK to latestCandle.close! That varies by timeframe!
        if (!chartData.metadata || !chartData.metadata.latestPrice) {
            console.error('ERROR: metadata.latestPrice is missing!');
            showNotification('Failed to fetch current price');
            return;
        }
        
        currentPrice = parseFloat(chartData.metadata.latestPrice);
        
        console.log(`[Trade Card] ${symbol} ${currentTimeframe}: Price = $${currentPrice} (from metadata.latestPrice)`);
        
        // Update price display (SAME for all timeframes)
        const priceEl = document.getElementById('currentPrice');
        if (priceEl) {
            priceEl.textContent = `$${currentPrice.toFixed(2)}`;
        }
        
        // Update change display (SAME for all timeframes)
        const change = parseFloat(chartData.metadata.change || 0);
        const changePercent = parseFloat(chartData.metadata.changePercent || 0);
        
        const changeEl = document.getElementById('stockChange');
        if (changeEl) {
            const sign = change >= 0 ? '+' : '';
            changeEl.textContent = `${sign}$${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
            changeEl.className = change >= 0 ? 'stock-change positive' : 'stock-change negative';
        }
        
        // Update timeframe label for OHLC card
        const timeframeLabelEl = document.getElementById('timeframeLabel');
        if (timeframeLabelEl) {
            timeframeLabelEl.textContent = chartData.metadata.timeframeLabel || 'Last Candle';
        }
        
        // Update OHLC data (DIFFERENT for each timeframe - from last bar)
        const openEl = document.getElementById('stockOpen');
        if (openEl) {
            openEl.textContent = `$${parseFloat(chartData.metadata.lastBarOpen || 0).toFixed(2)}`;
        }
        
        const highEl = document.getElementById('stockHigh');
        if (highEl) {
            highEl.textContent = `$${parseFloat(chartData.metadata.lastBarHigh || 0).toFixed(2)}`;
        }
        
        const lowEl = document.getElementById('stockLow');
        if (lowEl) {
            lowEl.textContent = `$${parseFloat(chartData.metadata.lastBarLow || 0).toFixed(2)}`;
        }
        
        const closeEl = document.getElementById('stockClose');
        if (closeEl) {
            closeEl.textContent = `$${parseFloat(chartData.metadata.lastBarClose || 0).toFixed(2)}`;
        }
        
        // Update symbol display
        const symbolEl = document.getElementById('tradeSymbol');
        if (symbolEl) {
            symbolEl.textContent = symbol;
        }
        
        // Fetch company name
        try {
            const searchResponse = await fetch(`https://phantom-stocks.onrender.com/api/trades/search?q=${symbol}`);
            const searchResults = await searchResponse.json();
            
            if (searchResults && searchResults.length > 0) {
                const stock = searchResults.find(s => s.symbol === symbol) || searchResults[0];
                const nameEl = document.getElementById('tradeName');
                if (nameEl && stock.name) {
                    nameEl.textContent = stock.name;
                }
            }
        } catch (nameError) {
            console.warn('Could not fetch company name:', nameError);
        }
        
        // Check holdings
        const holdingsResponse = await fetch(`https://phantom-stocks.onrender.com/api/portfolio/holdings?user_id=${currentUser.id}`);
        const holdings = await holdingsResponse.json();
        
        const holding = holdings.find(h => h.symbol === symbol);
        currentHolding = holding ? parseFloat(holding.quantity) : 0;
        
        // Update holdings display
        const holdingEl = document.getElementById('currentHolding');
        if (holdingEl) {
            holdingEl.textContent = `You own: ${currentHolding} shares`;
        }
        
        // Update total calculation
        updateTotal();
        
    } catch (error) {
        console.error('Error updating trade card:', error);
    }
}

// Update total amount
function updateTotal() {
    const quantityInput = document.getElementById('quantity');
    const totalEl = document.getElementById('totalAmount');
    
    if (quantityInput && totalEl) {
        const quantity = parseFloat(quantityInput.value) || 0;
        const total = quantity * currentPrice;
        totalEl.textContent = `$${total.toFixed(2)}`;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }
    
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });
        
        // Live search
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            
            if (query.length < 1) {
                if (searchResults) searchResults.style.display = 'none';
                return;
            }
            
            try {
                const url = `https://phantom-stocks.onrender.com/api/trades/search?q=${encodeURIComponent(query)}`;
                const response = await fetch(url);
                const results = await response.json();
                
                if (results && results.length > 0 && searchResults) {
                    const html = results.slice(0, 5).map(stock => `
                        <div class="search-result-item" data-symbol="${stock.symbol}">
                            <strong>${stock.name || stock.symbol}</strong>
                            <span class="stock-symbol">${stock.symbol}</span>
                        </div>
                    `).join('');
                    
                    searchResults.innerHTML = html;
                    searchResults.style.display = 'block';
                    
                    searchResults.querySelectorAll('.search-result-item').forEach(item => {
                        item.addEventListener('click', async () => {
                            const symbol = item.dataset.symbol;
                            searchInput.value = symbol;
                            searchResults.style.display = 'none';
                            currentSymbol = symbol;
                            await loadChart(symbol, currentTimeframe);
                        });
                    });
                } else if (searchResults) {
                    searchResults.style.display = 'none';
                }
            } catch (error) {
                console.error('Search error:', error);
            }
        });
    }
    
    // Timeframe buttons
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = btn.dataset.timeframe;
            await loadChart(currentSymbol, currentTimeframe);
        });
    });
    
    // Chart type dropdown
    const chartTypeBtn = document.getElementById('chartTypeBtn');
    const chartTypeMenu = document.getElementById('chartTypeMenu');
    
    if (chartTypeBtn && chartTypeMenu) {
        chartTypeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            chartTypeMenu.classList.toggle('show');
        });
        
        document.querySelectorAll('.dropdown-item[data-chart-type]').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.chartType;
                currentChartType = type;
                chartTypeMenu.classList.remove('show');
                
                document.querySelectorAll('.dropdown-item[data-chart-type]').forEach(i => {
                    i.classList.remove('active');
                });
                
                item.classList.add('active');
                
                const label = document.getElementById('chartTypeLabel');
                if (label) {
                    const typeNames = {
                        'candlestick': 'Candlestick',
                        'bars': 'Bars',
                        'baseline': 'Baseline'
                    };
                    label.textContent = `Chart Type: ${typeNames[type] || type}`;
                }
                
                changeChartType(type);
            });
        });
    }
    
    // Indicators dropdown
    const indicatorsBtn = document.getElementById('indicatorsBtn');
    const indicatorsMenu = document.getElementById('indicatorsMenu');
    
    if (indicatorsBtn && indicatorsMenu) {
        indicatorsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            indicatorsMenu.classList.toggle('show');
        });
        
        document.querySelectorAll('.indicator-item[data-indicator]').forEach(item => {
            item.addEventListener('click', () => {
                const indicator = item.dataset.indicator;
                const isActive = activeIndicators.has(indicator);
                
                if (isActive) {
                    activeIndicators.delete(indicator);
                    item.classList.remove('active');
                } else {
                    activeIndicators.add(indicator);
                    item.classList.add('active');
                }
                
                toggleIndicator(indicator, !isActive);
            });
        });
    }
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        const chartTypeMenu = document.getElementById('chartTypeMenu');
        const chartTypeBtn = document.getElementById('chartTypeBtn');
        if (chartTypeMenu && !chartTypeBtn?.contains(e.target) && !chartTypeMenu.contains(e.target)) {
            chartTypeMenu.classList.remove('show');
        }
        
        const indicatorsMenu = document.getElementById('indicatorsMenu');
        const indicatorsBtn = document.getElementById('indicatorsBtn');
        if (indicatorsMenu && !indicatorsBtn?.contains(e.target) && !indicatorsMenu.contains(e.target)) {
            indicatorsMenu.classList.remove('show');
        }
        
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('searchInput');
        if (searchResults && !searchInput?.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
    
    // Quantity input
    const quantityInput = document.getElementById('quantity');
    if (quantityInput) {
        quantityInput.addEventListener('input', updateTotal);
    }
    
    // Buy/Sell buttons
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    
    if (buyBtn) {
        buyBtn.addEventListener('click', () => handleTrade('BUY'));
    }
    
    if (sellBtn) {
        sellBtn.addEventListener('click', () => handleTrade('SELL'));
    }
}

// Handle search
async function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const query = searchInput?.value?.trim().toUpperCase();
    
    if (!query || query.length === 0) {
        showNotification('Please enter a valid stock symbol');
        return;
    }
    
    try {
        currentSymbol = query;
        await loadChart(currentSymbol, currentTimeframe);
        await updateTradeCard(currentSymbol);
    } catch (error) {
        console.error('Search error:', error);
        showNotification(`Could not find symbol: ${query}`);
    }
}

// Handle trade execution
async function handleTrade(action) {
    const quantityInput = document.getElementById('quantity');
    const quantity = parseFloat(quantityInput?.value || 0);
    
    if (quantity <= 0) {
        showNotification('Please enter a valid quantity');
        return;
    }
    
    // Validate trade
    if (action === 'BUY') {
        const totalCost = quantity * currentPrice;
        if (totalCost > portfolioData.cash) {
            showNotification(`Insufficient funds. Need $${totalCost.toFixed(2)}, have $${portfolioData.cash.toFixed(2)}`);
            return;
        }
    } else if (action === 'SELL') {
        if (quantity > currentHolding) {
            showNotification(`Insufficient shares. Trying to sell ${quantity}, have ${currentHolding}`);
            return;
        }
    }
    
    try {
        console.log(`Executing ${action}: ${quantity} ${currentSymbol} @ $${currentPrice}`);
        
        const result = await executeTrade(currentUser.id, currentSymbol, action, quantity, currentPrice);
        
        showNotification(`${action} order executed: ${quantity} ${currentSymbol}`);
        
        // Reload portfolio data
        await loadPortfolioData();
        
        // Update trade card
        await updateTradeCard(currentSymbol);
        
        // Clear quantity input
        if (quantityInput) {
            quantityInput.value = '';
        }
        
    } catch (error) {
        console.error('Trade execution error:', error);
        showNotification(error.message || 'Trade failed');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializePage);