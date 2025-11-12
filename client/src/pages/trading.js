// Trading Page Logic with Dropdown Handlers
import { requireAuth, logout } from '../auth/auth.js';
import { executeTrade, searchStocks } from '../services/tradingService.js';
import { getPortfolioSummary } from '../services/portfolioService.js';
import KlineChart from '../kline.js';

// Global state
let currentUser = null;
let currentSymbol = 'AAPL';
let currentTimeframe = '15m';
let currentChartType = 'candlestick';
let activeIndicators = new Set();
let klineChart = null;
let portfolioData = null;

// Initialize page
async function initializePage() {
    try {
        currentUser = await requireAuth();
        await loadPortfolioData();
        updateUserInfo();
        setupEventListeners();
        await loadChart(currentSymbol, currentTimeframe);
    } catch (error) {
        console.error('Failed to initialize trading page:', error);
        window.location.href = 'index.html';
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
    document.getElementById('username').textContent = username;
}

// Update cash display
function updateCashDisplay() {
    const cash = portfolioData?.cash || 0;
    document.getElementById('cashDisplay').textContent = `$${cash.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// Load chart
async function loadChart(symbol, timeframe) {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const tradeCard = document.getElementById('tradeCard');
    
    try {
        loadingOverlay.style.display = 'flex';
        tradeCard.style.display = 'none';
        
        // Initialize or update chart
        if (!klineChart) {
            klineChart = new KlineChart('chart-container');
        }
        
        await klineChart.loadSymbol(symbol, timeframe);
        
        // Apply active indicators
        activeIndicators.forEach(indicator => {
            klineChart.toggleIndicator(indicator, true);
        });
        
        // Apply chart type
        klineChart.setChartType(currentChartType);
        
        // Update trade card
        updateTradeCard(symbol);
        
        tradeCard.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading chart:', error);
        showError('Failed to load chart data');
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// Update trade card with stock data
function updateTradeCard(symbol) {
    if (!klineChart || !klineChart.currentData) return;
    
    const data = klineChart.currentData;
    const latest = data[data.length - 1];
    
    if (!latest) return;
    
    document.getElementById('tradeSymbol').textContent = symbol;
    document.getElementById('tradeName').textContent = klineChart.symbolName || symbol;
    
    const price = latest.close;
    const change = latest.close - latest.open;
    const changePercent = (change / latest.open) * 100;
    
    const priceElement = document.getElementById('tradePrice');
    priceElement.textContent = `$${price.toFixed(2)}`;
    
    const changeElement = document.getElementById('tradeChange');
    const sign = change >= 0 ? '+' : '';
    changeElement.textContent = `${sign}$${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
    changeElement.className = `stock-change ${change >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('tradeOpen').textContent = `$${latest.open.toFixed(2)}`;
    document.getElementById('tradeHigh').textContent = `$${latest.high.toFixed(2)}`;
    document.getElementById('tradeLow').textContent = `$${latest.low.toFixed(2)}`;
    document.getElementById('tradeClose').textContent = `$${latest.close.toFixed(2)}`;
    
    // Update total when quantity changes
    updateTotal();
}

// Update total amount
function updateTotal() {
    const quantityInput = document.getElementById('quantityInput');
    const quantity = parseFloat(quantityInput.value) || 0;
    
    if (!klineChart || !klineChart.currentData) return;
    
    const data = klineChart.currentData;
    const latest = data[data.length - 1];
    const price = latest ? latest.close : 0;
    const total = quantity * price;
    
    document.getElementById('totalAmount').textContent = `$${total.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// Setup event listeners
function setupEventListeners() {
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await logout();
        } catch (error) {
            console.error('Logout error:', error);
            window.location.href = 'index.html';
        }
    });
    
    // Timeframe buttons
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = btn.dataset.timeframe;
            loadChart(currentSymbol, currentTimeframe);
        });
    });
    
    // Search input
    const searchInput = document.getElementById('searchInput');
    const autocompleteDropdown = document.getElementById('autocompleteDropdown');
    
    let searchTimeout;
    searchInput.addEventListener('input', async (e) => {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim();
        
        if (query.length >= 1) {
            searchTimeout = setTimeout(async () => {
                try {
                    const results = await searchStocks(query);
                    displayAutocomplete(results);
                } catch (error) {
                    console.error('Search error:', error);
                }
            }, 300);
        } else {
            autocompleteDropdown.classList.remove('show');
        }
    });
    
    // Close autocomplete when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            autocompleteDropdown.classList.remove('show');
        }
    });
    
    // Chart Type Dropdown
    setupChartTypeDropdown();
    
    // Indicators Dropdown
    setupIndicatorsDropdown();
    
    // Quantity input
    document.getElementById('quantityInput').addEventListener('input', updateTotal);
    
    // Buy/Sell buttons
    document.getElementById('buyBtn').addEventListener('click', () => handleTrade('BUY'));
    document.getElementById('sellBtn').addEventListener('click', () => handleTrade('SELL'));
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown-container')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.classList.remove('show');
            });
            document.querySelectorAll('.dropdown-btn').forEach(btn => {
                btn.classList.remove('open');
            });
        }
    });
}

// Setup chart type dropdown
function setupChartTypeDropdown() {
    const btn = document.getElementById('chartTypeBtn');
    const menu = document.getElementById('chartTypeMenu');
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
        btn.classList.toggle('open');
        
        // Close indicators menu
        document.getElementById('indicatorsMenu').classList.remove('show');
        document.getElementById('indicatorsBtn').classList.remove('open');
    });
    
    document.querySelectorAll('#chartTypeMenu .dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const chartType = item.dataset.chartType;
            
            // Update active state
            document.querySelectorAll('#chartTypeMenu .dropdown-item').forEach(i => {
                i.classList.remove('active');
            });
            item.classList.add('active');
            
            // Update button label
            const label = item.textContent;
            document.getElementById('chartTypeLabel').textContent = `Chart Type: ${label}`;
            
            // Update chart
            currentChartType = chartType;
            if (klineChart) {
                klineChart.setChartType(chartType);
            }
            
            // Close menu
            menu.classList.remove('show');
            btn.classList.remove('open');
        });
    });
}

// Setup indicators dropdown
function setupIndicatorsDropdown() {
    const btn = document.getElementById('indicatorsBtn');
    const menu = document.getElementById('indicatorsMenu');
    
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
        btn.classList.toggle('open');
        
        // Close chart type menu
        document.getElementById('chartTypeMenu').classList.remove('show');
        document.getElementById('chartTypeBtn').classList.remove('open');
        
        // Update button state
        updateIndicatorsButtonState();
    });
    
    document.querySelectorAll('.indicator-item').forEach(item => {
        item.addEventListener('click', () => {
            const indicator = item.dataset.indicator;
            
            // Toggle active state
            item.classList.toggle('active');
            
            // Update active indicators set
            if (item.classList.contains('active')) {
                activeIndicators.add(indicator);
            } else {
                activeIndicators.delete(indicator);
            }
            
            // Update chart
            if (klineChart) {
                klineChart.toggleIndicator(indicator, item.classList.contains('active'));
            }
            
            // Update button state
            updateIndicatorsButtonState();
        });
    });
}

// Update indicators button state
function updateIndicatorsButtonState() {
    const btn = document.getElementById('indicatorsBtn');
    
    if (activeIndicators.size > 0) {
        btn.classList.add('active');
    } else {
        btn.classList.remove('active');
    }
}

// Display autocomplete results
function displayAutocomplete(results) {
    const dropdown = document.getElementById('autocompleteDropdown');
    
    if (!results || results.length === 0) {
        dropdown.classList.remove('show');
        return;
    }
    
    dropdown.innerHTML = results.map(stock => `
        <div class="autocomplete-item" data-symbol="${stock.symbol}">
            <div class="autocomplete-symbol">${stock.symbol}</div>
            <div class="autocomplete-name">${stock.name}</div>
        </div>
    `).join('');
    
    dropdown.classList.add('show');
    
    // Add click handlers to items
    dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
        item.addEventListener('click', () => {
            const symbol = item.dataset.symbol;
            currentSymbol = symbol;
            document.getElementById('searchInput').value = symbol;
            dropdown.classList.remove('show');
            loadChart(symbol, currentTimeframe);
        });
    });
}

// Handle trade execution
async function handleTrade(action) {
    const quantityInput = document.getElementById('quantityInput');
    const quantity = parseFloat(quantityInput.value);
    
    if (!quantity || quantity <= 0) {
        showError('Please enter a valid quantity');
        return;
    }
    
    if (!klineChart || !klineChart.currentData) {
        showError('No price data available');
        return;
    }
    
    const data = klineChart.currentData;
    const latest = data[data.length - 1];
    const price = latest.close;
    
    const buyBtn = document.getElementById('buyBtn');
    const sellBtn = document.getElementById('sellBtn');
    
    try {
        buyBtn.disabled = true;
        sellBtn.disabled = true;
        hideMessages();
        
        await executeTrade({
            user_id: currentUser.id,
            symbol: currentSymbol,
            action: action,
            quantity: quantity,
            price: price
        });
        
        showSuccess(`${action} order executed successfully!`);
        quantityInput.value = '';
        updateTotal();
        
        // Reload portfolio data
        await loadPortfolioData();
        
    } catch (error) {
        console.error('Trade error:', error);
        showError(error.message || 'Trade failed');
    } finally {
        buyBtn.disabled = false;
        sellBtn.disabled = false;
    }
}

// Show error message
function showError(message) {
    const errorDiv = document.getElementById('tradeError');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 5000);
}

// Show success message
function showSuccess(message) {
    const successDiv = document.getElementById('tradeSuccess');
    successDiv.textContent = message;
    successDiv.classList.add('show');
    
    setTimeout(() => {
        successDiv.classList.remove('show');
    }, 5000);
}

// Hide messages
function hideMessages() {
    document.getElementById('tradeError').classList.remove('show');
    document.getElementById('tradeSuccess').classList.remove('show');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializePage);