// Portfolio Logic - Integrated with Supabase Backend
import { requireAuth } from './src/auth/authGuard.js';
import { logout } from './src/auth/auth.js';
import { supabase } from './src/auth/supabaseClient.js';
import { 
    getPortfolioSummary, 
    getHoldings, 
    getTransactions,
    getPortfolioSnapshots,
    calculateAssetAllocation
} from './src/services/portfolioService.js';
import { getMarketNews } from './src/services/newsService.js';

// Global state
let currentUser = null;
let portfolioData = null;
let holdingsData = [];
let transactionsData = [];
let snapshotsData = [];
let currentPeriod = '1D';
let assetAllocationChart = null;
let performanceChart = null;
let lastTransactionAmount = 0; // Track last transaction for indicator

// Initialize page
async function initializePage() {
    try {
        // Require authentication
        currentUser = await requireAuth();
        
        // Load user data
        await loadPortfolioData();
        
        // Update UI with user info
        updateUserInfo();
        
        // Setup event listeners
        setupEventListeners();
        
        // Initial render
        renderPortfolio();
        
    } catch (error) {
        console.error('Failed to initialize portfolio:', error);
        
        // Only redirect if not already in a redirect loop
        if (!sessionStorage.getItem('portfolioInitFailed')) {
            sessionStorage.setItem('portfolioInitFailed', 'true');
            window.location.href = 'index.html';
        } else {
            // Already tried once, show error instead
            document.body.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; color: white; background: #000;">
                    <h1>Failed to load portfolio</h1>
                    <p>${error.message}</p>
                    <button onclick="sessionStorage.removeItem('portfolioInitFailed'); location.reload();" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }
}

// Load all portfolio data
async function loadPortfolioData() {
    try {
        // Fetch all data in parallel (except snapshots - fetch separately)
        const [summary, holdings, transactions] = await Promise.all([
            getPortfolioSummary(currentUser.id),
            getHoldings(currentUser.id),
            getTransactions(currentUser.id, 100) // Get more for filtering
        ]);
        
        portfolioData = summary;
        holdingsData = holdings;
        transactionsData = transactions;
        
        // Calculate last transaction amount for indicator
        if (transactions && transactions.length > 0) {
            const lastTx = transactions[0];
            lastTransactionAmount = lastTx.type === 'BUY' 
                ? -parseFloat(lastTx.total_value || 0) 
                : parseFloat(lastTx.total_value || 0);
        }
        
        // Try to fetch snapshots, but don't fail if it errors
        try {
            snapshotsData = await getPortfolioSnapshots(currentUser.id, currentPeriod);
        } catch (snapshotError) {
            console.warn('Could not load portfolio snapshots:', snapshotError);
            snapshotsData = []; // Default to empty array
        }
        
    } catch (error) {
        console.error('Error loading portfolio data:', error);
        throw error;
    }
}

// Update user info in header
function updateUserInfo() {
    const { user_metadata } = currentUser;
    const username = user_metadata?.username || currentUser.email.split('@')[0];
    const firstName = username.split(' ')[0];
    
    // Update greeting with Eastern timezone
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = etTime.getHours();
    
    let greeting = 'Good Morning';
    if (hour >= 12 && hour < 17) greeting = 'Good Afternoon';
    if (hour >= 17) greeting = 'Good Evening';
    
    const welcomeEl = document.getElementById('welcomeMessage');
    if (welcomeEl) {
        welcomeEl.textContent = `${greeting}, ${firstName}`;
    }
    
    // Update avatar
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) {
        avatarEl.textContent = firstName.charAt(0).toUpperCase();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Time period buttons
    document.querySelectorAll('.time-period').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const period = e.target.dataset.period;
            
            // Update active state
            document.querySelectorAll('.time-period').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Update period and reload
            currentPeriod = period;
            try {
                snapshotsData = await getPortfolioSnapshots(currentUser.id, currentPeriod);
                renderPerformanceChart();
            } catch (error) {
                console.error('Error loading snapshots:', error);
            }
        });
    });
    
    // Transaction period dropdown
    const periodSelect = document.getElementById('transactionPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            updateTransactionsList(parseInt(e.target.value));
        });
    }
    
    // Modal buttons
    const summaryBtn = document.getElementById('portfolioSummaryBtn');
    if (summaryBtn) {
        summaryBtn.addEventListener('click', openPortfolioSummary);
    }
    
    const newsBtn = document.getElementById('newsBtn');
    if (newsBtn) {
        newsBtn.addEventListener('click', openNewsModal);
    }
    
    const avatarBtn = document.getElementById('userAvatar');
    if (avatarBtn) {
        avatarBtn.addEventListener('click', openAccountModal);
    }
    
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', handleChangePassword);
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// Render entire portfolio
function renderPortfolio() {
    renderSummaryCards();
    updateTransactionsList(10); // Default 10 days
    renderPerformanceChart();
    renderAssetAllocationChart();
}

// Render summary cards with transaction indicator
function renderSummaryCards() {
    const cashEl = document.getElementById('availableCash');
    
    if (cashEl) {
        const cash = portfolioData?.cash || 0;
        const cashFormatted = `$${cash.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })}`;
        
        // Check if there was a recent transaction (within 5 seconds)
        const showIndicator = Math.abs(lastTransactionAmount) > 0;
        
        if (showIndicator) {
            const isPositive = lastTransactionAmount > 0;
            const arrow = isPositive ? '↗' : '↘';
            const color = isPositive ? '#22c55e' : '#ef4444';
            const amountFormatted = `${isPositive ? '+' : ''}$${Math.abs(lastTransactionAmount).toLocaleString('en-US', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            })}`;
            
            cashEl.innerHTML = `
                ${cashFormatted}
                <div style="font-size: 0.7rem; color: ${color}; margin-top: 0.25rem;">
                    ${arrow} ${amountFormatted}
                </div>
            `;
        } else {
            cashEl.textContent = cashFormatted;
        }
    }
}

// Update transactions list with time formatting
function updateTransactionsList(days = 10) {
    const container = document.getElementById('transactionsList');
    
    if (!container) {
        console.warn('Element "transactionsList" not found');
        return;
    }
    
    if (!transactionsData || transactionsData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #9ca3af; font-size: 0.8rem; margin-top: 2rem;">No transactions yet - start trading to see your activity</p>';
        return;
    }
    
    // Filter by days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const filteredTransactions = transactionsData.filter(tx => {
        const txDate = new Date(tx.executed_at || tx.created_at);
        return txDate >= cutoffDate;
    });
    
    if (filteredTransactions.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: #9ca3af; font-size: 0.8rem; margin-top: 2rem;">No transactions in past ${days} days</p>`;
        return;
    }
    
    // Show transactions (max 5)
    const displayTransactions = filteredTransactions.slice(0, 5);
    
    container.innerHTML = `
        <div class="transaction-table">
            ${displayTransactions.map(tx => {
                const txType = (tx.type || tx.action || 'UNKNOWN').toUpperCase();
                const actionClass = txType === 'BUY' ? 'buy' : txType === 'SELL' ? 'sell' : '';
                
                // Format date and time: "Nov 18, 2025 | 2:45 PM"
                const txDate = new Date(tx.executed_at || tx.created_at || Date.now());
                const dateStr = txDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                });
                const timeStr = txDate.toLocaleTimeString('en-US', { 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true 
                });
                const formattedDateTime = `${dateStr} | ${timeStr}`;
                
                return `
                    <div class="transaction-row">
                        <div class="transaction-name">
                            <h4>${tx.symbol || 'N/A'}</h4>
                            <p>${tx.company_name || tx.symbol || 'Unknown'}</p>
                        </div>
                        <div class="transaction-action ${actionClass}">${txType}</div>
                        <div>${tx.quantity || 0} shares</div>
                        <div>$${parseFloat(tx.price || 0).toFixed(2)}</div>
                        <div>$${parseFloat(tx.total_amount || tx.total_value || 0).toFixed(2)}</div>
                        <div style="font-size: 0.7rem; color: #9ca3af;">
                            ${formattedDateTime}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Render performance chart using Chart.js
function renderPerformanceChart() {
    const container = document.getElementById('chartContainer');
    
    if (!container) {
        console.warn('Element "chartContainer" not found');
        return;
    }
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create canvas for Chart.js
    const canvas = document.createElement('canvas');
    canvas.id = 'performanceChartCanvas';
    container.appendChild(canvas);
    
    // Destroy existing chart
    if (performanceChart) {
        performanceChart.destroy();
    }
    
    // Prepare data
    let chartData = [];
    let chartLabels = [];
    
    if (!snapshotsData || snapshotsData.length === 0) {
        // New account - show flat line at $10,000
        const now = new Date();
        chartLabels = ['Start', 'Now'];
        chartData = [10000, portfolioData?.total_value || 10000];
    } else {
        chartLabels = snapshotsData.map(s => new Date(s.snapshot_at));
        chartData = snapshotsData.map(s => parseFloat(s.total_value));
    }
    
    // Determine if profit or loss
    const startValue = chartData[0] || 10000;
    const endValue = chartData[chartData.length - 1] || 10000;
    const isProfitable = endValue >= startValue;
    const lineColor = isProfitable ? '#22c55e' : '#ef4444';
    
    // Create gradient for new accounts
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, container.clientHeight);
    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.3)');
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
    
    // Chart configuration
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Portfolio Value',
                data: chartData,
                borderColor: snapshotsData.length === 0 ? '#a855f7' : lineColor,
                backgroundColor: snapshotsData.length === 0 ? gradient : 'transparent',
                borderWidth: 2,
                fill: snapshotsData.length === 0,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: lineColor,
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(31, 41, 55, 0.95)',
                    titleColor: '#f9fafb',
                    bodyColor: '#f9fafb',
                    borderColor: 'rgba(55, 65, 81, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return `$${context.parsed.y.toLocaleString('en-US', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                            })}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: currentPeriod === '1D' ? 'hour' : currentPeriod === '1W' ? 'day' : 'day',
                        displayFormats: {
                            hour: 'h:mm a',
                            day: 'MMM d'
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(55, 65, 81, 0.2)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    position: 'right',
                    grid: {
                        display: true,
                        color: 'rgba(55, 65, 81, 0.2)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 10
                        },
                        callback: function(value) {
                            return '$' + value.toLocaleString('en-US', { 
                                minimumFractionDigits: 0, 
                                maximumFractionDigits: 0 
                            });
                        }
                    }
                }
            }
        }
    });
    
    // Render portfolio performance header below chart
    renderPerformanceHeader();
}

// Render performance header with total value and today's change
function renderPerformanceHeader() {
    const card = document.querySelector('.portfolio-performance-card');
    
    if (!card) return;
    
    // Remove existing header if present
    const existingHeader = card.querySelector('.portfolio-performance-header');
    if (existingHeader) {
        existingHeader.remove();
    }
    
    const totalValue = portfolioData?.total_value || 10000;
    const todayChange = portfolioData?.today_profit_loss || 0;
    const todayChangePercent = portfolioData?.today_profit_loss_percent || 0;
    
    const isPositive = todayChange >= 0;
    const arrow = isPositive ? '↗' : '↘';
    const color = isPositive ? '#22c55e' : '#ef4444';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'portfolio-performance-header';
    headerDiv.style.cssText = 'margin-top: 0.75rem; text-align: center;';
    
    headerDiv.innerHTML = `
        <div style="font-size: 1.5rem; font-weight: 400; margin-bottom: 0.25rem;">
            $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style="font-size: 0.75rem; color: ${color};">
            ${arrow} $${Math.abs(todayChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
            (${isPositive ? '+' : ''}${todayChangePercent.toFixed(2)}%) today
        </div>
    `;
    
    // Insert after chart container
    const chartContainer = card.querySelector('.chart-container');
    if (chartContainer && chartContainer.nextSibling) {
        card.insertBefore(headerDiv, chartContainer.nextSibling);
    } else if (chartContainer) {
        card.appendChild(headerDiv);
    }
}

// Render asset allocation donut chart
function renderAssetAllocationChart() {
    const canvas = document.getElementById('assetAllocationChart');
    const legend = document.getElementById('assetAllocationLegend');
    
    if (!canvas) {
        console.warn('Element "assetAllocationChart" not found');
        return;
    }
    
    // Destroy existing chart
    if (assetAllocationChart) {
        assetAllocationChart.destroy();
    }
    
    if (!holdingsData || holdingsData.length === 0) {
        if (legend) {
            legend.innerHTML = '<p style="text-align: center; color: #9ca3af; font-size: 0.75rem;">No holdings yet - start trading to see allocation</p>';
        }
        return;
    }
    
    const allocation = calculateAssetAllocation(holdingsData);
    
    // Generate colors
    const colors = [
        '#a855f7', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b',
        '#8b5cf6', '#ec4899', '#06b6d4', '#10b981', '#f97316'
    ];
    
    const ctx = canvas.getContext('2d');
    assetAllocationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: allocation.map(a => a.symbol),
            datasets: [{
                data: allocation.map(a => a.value),
                backgroundColor: colors.slice(0, allocation.length),
                borderColor: '#000000',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = allocation[context.dataIndex];
                            return `${item.symbol}: $${item.value.toLocaleString('en-US', { 
                                minimumFractionDigits: 2, 
                                maximumFractionDigits: 2 
                            })} (${item.percentage}%)`;
                        }
                    }
                }
            }
        }
    });
    
    // Update legend
    if (legend) {
        legend.innerHTML = allocation.map((item, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="width: 12px; height: 12px; border-radius: 2px; background: ${colors[index]};"></div>
                    <span>${item.symbol}</span>
                </div>
                <span style="color: #9ca3af;">${item.percentage}%</span>
            </div>
        `).join('');
    }
}

// Open account modal
async function openAccountModal() {
    const modal = document.getElementById('accountModal');
    const emailEl = document.getElementById('currentEmail');
    const usernameEl = document.getElementById('currentUsername');
    
    if (!modal) {
        console.warn('Account modal not found');
        return;
    }
    
    // Populate current info
    if (emailEl) emailEl.value = currentUser.email;
    if (usernameEl) {
        const username = currentUser.user_metadata?.username || currentUser.email.split('@')[0];
        usernameEl.value = username;
    }
    
    // Clear any previous messages
    const errorEl = document.getElementById('passwordError');
    const successEl = document.getElementById('passwordSuccess');
    if (errorEl) errorEl.classList.remove('show');
    if (successEl) successEl.classList.remove('show');
    
    modal.classList.add('show');
}

// Open news modal
async function openNewsModal() {
    const modal = document.getElementById('newsModal');
    const newsList = document.getElementById('newsList');
    
    if (!modal || !newsList) {
        console.warn('News modal elements not found');
        return;
    }
    
    newsList.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 2rem;">Loading news...</p>';
    modal.classList.add('show');
    
    try {
        const news = await getMarketNews(20);
        
        if (news.length === 0) {
            newsList.innerHTML = '<p style="text-align: center; color: #9ca3af; padding: 2rem;">No news available</p>';
            return;
        }
        
        newsList.innerHTML = news.map(article => `
            <div class="news-item" onclick="window.open('${article.url}', '_blank')">
                <div class="news-title">${article.title}</div>
                <div class="news-meta">
                    <span>${article.source || article.publisher?.name || 'Market News'}</span>
                    <span>${new Date(article.published_at).toLocaleDateString()}</span>
                </div>
                <div class="news-caption">${article.description || article.summary || ''}</div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading news:', error);
        newsList.innerHTML = '<p style="text-align: center; color: #ef4444; padding: 2rem;">Failed to load news</p>';
    }
}

// Open comprehensive portfolio summary modal
async function openPortfolioSummary() {
    const modal = document.getElementById('portfolioSummaryModal');
    const content = document.getElementById('portfolioSummaryContent');
    
    if (!modal || !content) {
        console.warn('Portfolio summary modal elements not found');
        return;
    }
    
    const totalValue = portfolioData?.total_value || 0;
    const cash = portfolioData?.cash || 0;
    const todayChange = portfolioData?.today_profit_loss || 0;
    const todayChangePercent = portfolioData?.today_profit_loss_percent || 0;
    
    // Calculate total invested
    const totalInvested = holdingsData.reduce((sum, h) => {
        return sum + (parseFloat(h.avg_purchase_price || 0) * parseFloat(h.quantity || 0));
    }, 0);
    
    const unrealizedGains = totalValue - 10000;
    const unrealizedGainsPercent = ((unrealizedGains / 10000) * 100).toFixed(2);
    
    const isTodayPositive = todayChange >= 0;
    const arrow = isTodayPositive ? '↗' : '↘';
    const todayColor = isTodayPositive ? '#22c55e' : '#ef4444';
    
    content.innerHTML = `
        <div style="margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid rgba(55, 65, 81, 0.3);">
            <div style="font-size: 1.75rem; font-weight: 400; margin-bottom: 0.5rem;">
                $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style="font-size: 0.9rem; color: ${todayColor};">
                ${arrow} $${Math.abs(todayChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                (${isTodayPositive ? '+' : ''}${todayChangePercent.toFixed(2)}%) today
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
            <div style="text-align: center; padding: 1rem; background: rgba(55, 65, 81, 0.2); border-radius: 0.5rem;">
                <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.25rem;">Available to Trade</div>
                <div style="font-size: 1.1rem; font-weight: 400;">$${cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: rgba(55, 65, 81, 0.2); border-radius: 0.5rem;">
                <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.25rem;">Total Invested</div>
                <div style="font-size: 1.1rem; font-weight: 400;">$${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div style="text-align: center; padding: 1rem; background: rgba(55, 65, 81, 0.2); border-radius: 0.5rem;">
                <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.25rem;">Unrealized Gains</div>
                <div style="font-size: 1.1rem; font-weight: 400; color: ${unrealizedGains >= 0 ? '#22c55e' : '#ef4444'};">
                    ${unrealizedGains >= 0 ? '+' : ''}$${Math.abs(unrealizedGains).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    (${unrealizedGains >= 0 ? '+' : ''}${unrealizedGainsPercent}%)
                </div>
            </div>
        </div>
        
        ${holdingsData.length > 0 ? `
        <div style="overflow-x: auto; max-height: 400px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                <thead style="position: sticky; top: 0; background: #000; border-bottom: 1px solid rgba(55, 65, 81, 0.3);">
                    <tr>
                        <th style="padding: 0.75rem; text-align: left; color: #9ca3af; font-weight: 400;">Symbol</th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Last Price</th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Recent Change</th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Today G/L ($)</th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Today G/L (%)</th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Total G/L ($)</th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Total G/L (%)</th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Quantity</th>
                    </tr>
                </thead>
                <tbody>
                    ${holdingsData.map(holding => {
                        const todayGL = holding.today_gain_loss || 0;
                        const todayGLPercent = holding.today_gain_loss_percent || 0;
                        const totalGL = holding.total_profit_loss || 0;
                        const totalGLPercent = holding.total_profit_loss_percent || 0;
                        const recentChange = holding.most_recent_change || 0;
                        const recentChangePercent = holding.most_recent_change_percent || 0;
                        
                        const todayColor = todayGL >= 0 ? '#22c55e' : '#ef4444';
                        const totalColor = totalGL >= 0 ? '#22c55e' : '#ef4444';
                        const recentColor = recentChange >= 0 ? '#22c55e' : '#ef4444';
                        
                        return `
                            <tr style="border-bottom: 1px solid rgba(55, 65, 81, 0.2);">
                                <td style="padding: 0.75rem;">
                                    <div style="font-weight: 400;">${holding.symbol}</div>
                                    <div style="font-size: 0.7rem; color: #9ca3af;">${holding.name || holding.symbol}</div>
                                </td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    $${parseFloat(holding.current_price || 0).toFixed(2)}
                                </td>
                                <td style="padding: 0.75rem; text-align: right; color: ${recentColor};">
                                    ${recentChange >= 0 ? '+' : ''}$${Math.abs(recentChange).toFixed(2)}
                                    (${recentChangePercent >= 0 ? '+' : ''}${recentChangePercent.toFixed(2)}%)
                                </td>
                                <td style="padding: 0.75rem; text-align: right; color: ${todayColor};">
                                    ${todayGL >= 0 ? '+' : ''}$${Math.abs(todayGL).toFixed(2)}
                                </td>
                                <td style="padding: 0.75rem; text-align: right; color: ${todayColor};">
                                    ${todayGLPercent >= 0 ? '+' : ''}${todayGLPercent.toFixed(2)}%
                                </td>
                                <td style="padding: 0.75rem; text-align: right; color: ${totalColor};">
                                    ${totalGL >= 0 ? '+' : ''}$${Math.abs(totalGL).toFixed(2)}
                                </td>
                                <td style="padding: 0.75rem; text-align: right; color: ${totalColor};">
                                    ${totalGLPercent >= 0 ? '+' : ''}${totalGLPercent.toFixed(2)}%
                                </td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    ${parseFloat(holding.quantity || 0).toFixed(4)}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ` : '<p style="text-align: center; color: #9ca3af; padding: 2rem;">No positions yet</p>'}
    `;
    
    modal.classList.add('show');
}

// Handle password change
async function handleChangePassword() {
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmNewPassword')?.value;
    
    const errorDiv = document.getElementById('passwordError');
    const successDiv = document.getElementById('passwordSuccess');
    
    if (!errorDiv || !successDiv) {
        console.warn('Password message elements not found');
        return;
    }
    
    // Hide previous messages
    errorDiv.classList.remove('show');
    successDiv.classList.remove('show');
    
    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
        errorDiv.textContent = 'Please fill in all password fields';
        errorDiv.classList.add('show');
        return;
    }
    
    if (newPassword.length < 6) {
        errorDiv.textContent = 'New password must be at least 6 characters';
        errorDiv.classList.add('show');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.classList.add('show');
        return;
    }
    
    const btn = document.getElementById('changePasswordBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Updating...';
    }
    
    try {
        // First, verify current password by attempting to sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email: currentUser.email,
            password: currentPassword
        });
        
        if (signInError) {
            throw new Error('Current password is incorrect');
        }
        
        // Update password
        const { error: updateError } = await supabase.auth.updateUser({
            password: newPassword
        });
        
        if (updateError) {
            throw updateError;
        }
        
        // Success
        successDiv.textContent = 'Password updated successfully!';
        successDiv.classList.add('show');
        
        // Clear form
        const fields = ['currentPassword', 'newPassword', 'confirmNewPassword'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Update Password';
        }
        
    } catch (error) {
        console.error('Error changing password:', error);
        errorDiv.textContent = error.message || 'Failed to update password';
        errorDiv.classList.add('show');
        
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Update Password';
        }
    }
}

// Handle logout
async function handleLogout() {
    try {
        await logout();
    } catch (error) {
        console.error('Logout error:', error);
        window.location.href = 'index.html';
    }
}

// Close modal
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
};

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});

// Initialize once when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

// Auto-refresh portfolio data every 30 seconds
setInterval(async () => {
    if (!currentUser) return; // Don't refresh if not initialized
    
    try {
        await loadPortfolioData();
        renderPortfolio();
    } catch (error) {
        console.error('Error refreshing portfolio:', error);
    }
}, 30000);