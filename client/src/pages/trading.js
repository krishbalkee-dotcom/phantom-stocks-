// Trading Page Logic with Dropdown Handlers
import { requireAuth } from '../auth/authGuard.js';
import { logout } from '../auth/auth.js';
import { executeTrade, searchStocks } from '../services/tradingService.js';
import { getPortfolioSummary } from '../services/portfolioService.js';
import { initChart, loadChartData, toggleIndicator } from '../kline.js';

// Global state
let currentUser = null;
let currentSymbol = 'AAPL';
let currentTimeframe = '15m';
let currentChartType = 'candlestick';
let activeIndicators = new Set();
let portfolioData = null;
let currentPrice = 0;
let currentHolding = 0;

// Initialize page
async function initializePage() {
    try {
        currentUser = await requireAuth();
        await loadPortfolioData();
        updateUserInfo();
        setupEventListeners();
        
        // Initialize chart with correct container ID
        initChart('chart-container');
        
        // Load initial chart
        await loadChart(currentSymbol, currentTimeframe);
        
        // Update trade card with initial symbol
        await updateTradeCard(currentSymbol);
        
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

// Load chart
async function loadChart(symbol, timeframe) {
    try {
        console.log(`Loading chart: ${symbol} ${timeframe}`);
        
        // Show loading
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        
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
        
        showError('Failed to load chart data');
    }
}

// Update trade card with current symbol info
async function updateTradeCard(symbol) {
    try {
        // Fetch full price data with OHLC from backend
        const response = await fetch(`https://phantom-stocks.onrender.com/api/market-data/price?symbol=${symbol}`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch price data');
        }
        
        const priceData = await response.json();
        
        // Store current price
        currentPrice = parseFloat(priceData.price) || parseFloat(priceData.close) || 0;
        
        // Update price display
        const priceEl = document.getElementById('currentPrice');
        if (priceEl) {
            priceEl.textContent = `$${currentPrice.toFixed(2)}`;
        }
        
        // Update OHLC data
        const openEl = document.getElementById('stockOpen');
        if (openEl) {
            openEl.textContent = `$${parseFloat(priceData.open || 0).toFixed(2)}`;
        }
        
        const highEl = document.getElementById('stockHigh');
        if (highEl) {
            highEl.textContent = `$${parseFloat(priceData.high || 0).toFixed(2)}`;
        }
        
        const lowEl = document.getElementById('stockLow');
        if (lowEl) {
            lowEl.textContent = `$${parseFloat(priceData.low || 0).toFixed(2)}`;
        }
        
        const closeEl = document.getElementById('stockClose');
        if (closeEl) {
            closeEl.textContent = `$${parseFloat(priceData.close || currentPrice).toFixed(2)}`;
        }
        
        // Update change display
        const change = parseFloat(priceData.change || 0);
        const changePercent = parseFloat(priceData.changePercent || 0);
        
        const changeEl = document.getElementById('stockChange');
        if (changeEl) {
            const sign = change >= 0 ? '+' : '';
            changeEl.textContent = `${sign}$${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
            changeEl.className = change >= 0 ? 'stock-change positive' : 'stock-change negative';
        }
        
        // Update symbol display
        const symbolEl = document.getElementById('tradeSymbol');
        if (symbolEl) {
            symbolEl.textContent = symbol;
        }
        
        // Fetch and update company name
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
        
        // Check if user has holding
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
        showError('Failed to load stock data');
    }
}

// Update total amount based on quantity
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
    // Search functionality with live results
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
        
        // Live search as user types
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            
            console.log('[Search] Query:', query);
            
            if (query.length < 1) {
                if (searchResults) searchResults.style.display = 'none';
                return;
            }
            
            try {
                const url = `https://phantom-stocks.onrender.com/api/trades/search?q=${encodeURIComponent(query)}`;
                console.log('[Search] Fetching:', url);
                
                const response = await fetch(url);
                const results = await response.json();
                
                console.log('[Search] Results:', results);
                
                if (results && results.length > 0 && searchResults) {
                    const html = results.slice(0, 5).map(stock => `
                        <div class="search-result-item" data-symbol="${stock.symbol}">
                            <strong>${stock.name || stock.symbol}</strong>
                            <span class="stock-symbol">${stock.symbol}</span>
                        </div>
                    `).join('');
                    
                    searchResults.innerHTML = html;
                    searchResults.style.display = 'block';
                    
                    // Add click handlers
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
                // Chart type change would be implemented here
                console.log(`Chart type changed to: ${type}`);
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
            console.log('Indicators menu toggled');
        });
        
        // Use .indicator-item instead of .dropdown-item
        document.querySelectorAll('.indicator-item[data-indicator]').forEach(item => {
            item.addEventListener('click', () => {
                const indicator = item.dataset.indicator;
                const isActive = activeIndicators.has(indicator);
                
                console.log(`Indicator ${indicator} clicked, active: ${isActive}`);
                
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
        // Close chart type menu if clicking outside
        const chartTypeMenu = document.getElementById('chartTypeMenu');
        const chartTypeBtn = document.getElementById('chartTypeBtn');
        if (chartTypeMenu && !chartTypeBtn?.contains(e.target) && !chartTypeMenu.contains(e.target)) {
            chartTypeMenu.classList.remove('show');
        }
        
        // Close indicators menu if clicking outside
        const indicatorsMenu = document.getElementById('indicatorsMenu');
        const indicatorsBtn = document.getElementById('indicatorsBtn');
        if (indicatorsMenu && !indicatorsBtn?.contains(e.target) && !indicatorsMenu.contains(e.target)) {
            indicatorsMenu.classList.remove('show');
        }
        
        // Close search results if clicking outside
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('searchInput');
        if (searchResults && !searchInput?.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
    
    // Quantity input - update total on change
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
    
    if (!query) return;
    
    try {
        console.log(`Searching for: ${query}`);
        
        // Update current symbol
        currentSymbol = query;
        
        // Load new chart
        await loadChart(currentSymbol, currentTimeframe);
        
        // Update trade card
        await updateTradeCard(currentSymbol);
        
        showSuccess(`Loaded ${currentSymbol}`);
        
    } catch (error) {
        console.error('Search error:', error);
        showError(`Could not find symbol: ${query}`);
    }
}

// Handle trade execution
async function handleTrade(action) {
    const quantityInput = document.getElementById('quantityInput');
    const quantity = parseFloat(quantityInput?.value || 0);
    
    if (quantity <= 0) {
        showError('Please enter a valid quantity');
        return;
    }
    
    // Validate trade
    if (action === 'BUY') {
        const totalCost = quantity * currentPrice;
        if (totalCost > portfolioData.cash) {
            showError(`Insufficient funds. Need $${totalCost.toFixed(2)}, have $${portfolioData.cash.toFixed(2)}`);
            return;
        }
    } else if (action === 'SELL') {
        if (quantity > currentHolding) {
            showError(`Insufficient shares. Trying to sell ${quantity}, have ${currentHolding}`);
            return;
        }
    }
    
    try {
        console.log(`Executing ${action}: ${quantity} ${currentSymbol} @ $${currentPrice}`);
        
        const result = await executeTrade(currentUser.id, currentSymbol, action, quantity, currentPrice);
        
        showSuccess(`${action} order executed: ${quantity} ${currentSymbol}`);
        
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
        showError(error.message || 'Trade failed');
    }
}

// Show success message
function showSuccess(message) {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Show error message
function showError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializePage);