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
let isPageVisible = true; // Track page visibility to prevent unnecessary animations

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
            <div class="transaction-header">
                <div>Stock Name</div>
                <div>Order Type</div>
                <div>Quantity</div>
                <div>Price/Share</div>
                <div>Total Price</div>
                <div>Date & Time</div>
            </div>
            ${displayTransactions.map(tx => {
                const txType = (tx.type || tx.action || 'UNKNOWN').toUpperCase();
                const actionClass = txType === 'BUY' ? 'buy' : txType === 'SELL' ? 'sell' : '';
                
                // Format date and time on one line: "Nov 18, 2025 | 2:45 PM"
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
                        <div style="font-size: 0.65rem; color: #9ca3af; white-space: nowrap;">
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
    
    // Purple line with purple gradient
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, container.clientHeight);
    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
    
    // Chart configuration with NO animation on data refresh
    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Portfolio Value',
                data: chartData,
                borderColor: '#a855f7',
                backgroundColor: gradient,
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#a855f7',
                pointHoverBorderColor: '#fff',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: isPageVisible ? 1000 : 0 // Animate only on page load/visibility change
            },
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
                    backgroundColor: '#000000',
                    titleColor: '#f9fafb',
                    bodyColor: '#f9fafb',
                    borderColor: 'rgba(55, 65, 81, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    titleFont: {
                        family: 'Inter',
                        size: 11,
                        weight: '300'
                    },
                    bodyFont: {
                        family: 'Inter',
                        size: 13,
                        weight: '400'
                    },
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
                            hour: 'h a',
                            day: 'MMM d'
                        }
                    },
                    grid: {
                        display: true,
                        color: 'rgba(55, 65, 81, 0.15)',
                        lineWidth: 1
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            family: 'Inter',
                            size: 9,
                            weight: '300'
                        },
                        maxTicksLimit: 8, // More ticks for better visibility
                        maxRotation: 0,
                        autoSkip: true,
                        padding: 8 // Add padding so labels aren't cut off
                    },
                    border: {
                        display: false
                    }
                },
                y: {
                    position: 'left', // MOVED TO LEFT
                    grid: {
                        display: true,
                        color: 'rgba(55, 65, 81, 0.15)',
                        lineWidth: 1
                    },
                    ticks: {
                        color: '#6b7280',
                        font: {
                            family: 'Inter',
                            size: 9,
                            weight: '300'
                        },
                        maxTicksLimit: 5, // Cleaner Y-axis
                        padding: 8,
                        callback: function(value) {
                            return '$' + value.toLocaleString('en-US', { 
                                minimumFractionDigits: 0, 
                                maximumFractionDigits: 0 
                            });
                        }
                    },
                    border: {
                        display: false
                    }
                }
            }
        }
    });
    
    // After first render, disable animation for subsequent updates
    isPageVisible = false;
    
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
    // Use Intraday G/L (total_profit_loss) for immediate feedback on new positions
    const intradayChange = portfolioData?.total_profit_loss || 0;
    const intradayChangePercent = portfolioData?.total_profit_loss_percent || 0;
    
    // Color logic: green for positive, purple for zero, red for negative
    let color;
    if (intradayChange > 0) {
        color = '#22c55e'; // Green
    } else if (intradayChange < 0) {
        color = '#ef4444'; // Red
    } else {
        color = '#a855f7'; // Purple for zero
    }
    
    const arrow = intradayChange > 0 ? '↗' : intradayChange < 0 ? '↘' : '→';
    
    // Check if market is closed (after 4:00 PM ET or before 9:30 AM ET on weekdays)
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const etHours = etTime.getHours();
    const etMinutes = etTime.getMinutes();
    const etDay = etTime.getDay();
    
    const isWeekday = etDay >= 1 && etDay <= 5;
    const afterClose = (etHours > 16) || (etHours === 16 && etMinutes >= 0);
    const beforeOpen = (etHours < 9) || (etHours === 9 && etMinutes < 30);
    const isAfterHours = isWeekday && (afterClose || beforeOpen);
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'portfolio-performance-header';
    
    headerDiv.innerHTML = `
        <div class="total-value">
            $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div class="today-change" style="color: ${color}; display: flex; align-items: center; gap: 0.5rem;">
            <span>${arrow} $${Math.abs(intradayChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
            (${intradayChange > 0 ? '+' : ''}${intradayChangePercent.toFixed(2)}%) today</span>
            ${isAfterHours ? '<span style="color: #9ca3af; font-size: 0.65rem; font-weight: 300;">After Hours Trading</span>' : ''}
        </div>
    `;
    
    // Insert at the beginning of card (positioned absolutely via CSS)
    card.appendChild(headerDiv);
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
    
    // Professional color palette - purple AND red shades for variety
    const colors = [
        '#a855f7', // Purple
        '#ef4444', // Red
        '#8b5cf6', // Violet
        '#dc2626', // Dark red
        '#7c3aed', // Deep purple
        '#f87171', // Light red
        '#6366f1', // Indigo
        '#b91c1c', // Deeper red
        '#c026d3', // Fuchsia
        '#991b1b'  // Darkest red
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
                borderWidth: 3, // Thinner, sleeker border
                hoverBorderColor: '#a855f7',
                hoverBorderWidth: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: {
                duration: isPageVisible ? 800 : 0 // Only animate on page load
            },
            cutout: '70%', // Thinner donut (was default 50%)
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: '#000000',
                    titleColor: '#f9fafb',
                    bodyColor: '#f9fafb',
                    borderColor: 'rgba(55, 65, 81, 0.5)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    boxWidth: 12,
                    boxHeight: 12,
                    titleFont: {
                        family: 'Inter',
                        size: 12,
                        weight: '400'
                    },
                    bodyFont: {
                        family: 'Inter',
                        size: 11,
                        weight: '300'
                    },
                    callbacks: {
                        title: function(context) {
                            const item = allocation[context[0].dataIndex];
                            return item.name || item.symbol;
                        },
                        label: function(context) {
                            const item = allocation[context.dataIndex];
                            return [
                                `Value: $${item.value.toLocaleString('en-US', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                })}`,
                                `Allocation: ${item.percentage}%`,
                                `Quantity: ${parseFloat(item.quantity).toFixed(4)} shares`
                            ];
                        }
                    }
                }
            }
        }
    });
    
    // Update legend with professional styling
    if (legend) {
        legend.innerHTML = allocation.map((item, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; padding: 0.4rem 0.5rem; border-radius: 0.25rem; transition: background 0.2s;" 
                 onmouseover="this.style.background='rgba(55, 65, 81, 0.2)'" 
                 onmouseout="this.style.background='transparent'">
                <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
                    <div style="width: 10px; height: 10px; border-radius: 2px; background: ${colors[index]}; flex-shrink: 0;"></div>
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                        <span style="font-weight: 400; font-size: 0.75rem;">${item.symbol}</span>
                        <span style="font-size: 0.65rem; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.name}</span>
                    </div>
                </div>
                <div style="text-align: right; flex-shrink: 0; margin-left: 0.5rem;">
                    <div style="font-size: 0.75rem; font-weight: 400;">${item.percentage}%</div>
                    <div style="font-size: 0.65rem; color: #6b7280;">$${item.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                </div>
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
    
    // Use Intraday G/L instead of Today's change for immediate feedback
    const intradayChange = portfolioData?.total_profit_loss || 0;
    const intradayChangePercent = portfolioData?.total_profit_loss_percent || 0;
    
    // Calculate total invested
    const totalInvested = holdingsData.reduce((sum, h) => {
        return sum + (parseFloat(h.avg_purchase_price || 0) * parseFloat(h.quantity || 0));
    }, 0);
    
    const unrealizedGains = totalValue - 10000;
    const unrealizedGainsPercent = ((unrealizedGains / 10000) * 100).toFixed(2);
    
    // Color logic for unrealized gains
    let unrealizedColor;
    if (unrealizedGains > 0) {
        unrealizedColor = '#22c55e';
    } else if (unrealizedGains < 0) {
        unrealizedColor = '#ef4444';
    } else {
        unrealizedColor = '#a855f7';
    }
    
    // Color logic for intraday change
    let intradayColor;
    if (intradayChange > 0) {
        intradayColor = '#22c55e';
    } else if (intradayChange < 0) {
        intradayColor = '#ef4444';
    } else {
        intradayColor = '#a855f7';
    }
    
    const arrow = intradayChange > 0 ? '↗' : intradayChange < 0 ? '↘' : '→';
    
    // Check if after hours
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const etHours = etTime.getHours();
    const etMinutes = etTime.getMinutes();
    const etDay = etTime.getDay();
    
    const isWeekday = etDay >= 1 && etDay <= 5;
    const afterClose = (etHours > 16) || (etHours === 16 && etMinutes >= 0);
    const beforeOpen = (etHours < 9) || (etHours === 9 && etMinutes < 30);
    const isAfterHours = isWeekday && (afterClose || beforeOpen);
    
    // Helper function to format G/L with proper handling of null values
    const formatGL = (value, percent, isNewPosition = false, label = '') => {
        if (value === null || value === undefined) {
            return `<span style="color: #6b7280; font-size: 0.7rem;">${isNewPosition ? label : 'N/A'}</span>`;
        }
        const color = value > 0 ? '#22c55e' : value < 0 ? '#ef4444' : '#a855f7';
        return `
            <span style="color: ${color};">
                ${value > 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}
            </span>
            <div style="font-size: 0.7rem; color: ${color};">
                ${percent > 0 ? '+' : ''}${percent.toFixed(2)}%
            </div>
        `;
    };
    
    content.innerHTML = `
        <div style="margin-bottom: 2rem; padding-bottom: 2rem; border-bottom: 1px solid rgba(55, 65, 81, 0.2);">
            <div style="font-size: 2rem; font-weight: 400; margin-bottom: 0.75rem;">
                $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style="font-size: 1rem; color: ${intradayColor}; display: flex; align-items: center; gap: 0.5rem;">
                <span>${arrow} $${Math.abs(intradayChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                (${intradayChange > 0 ? '+' : ''}${intradayChangePercent.toFixed(2)}%) today</span>
                ${isAfterHours ? '<span style="color: #9ca3af; font-size: 0.75rem; font-weight: 300;">After Hours Trading</span>' : ''}
            </div>
        </div>
        
        <div class="grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; margin-bottom: 2rem;">
            <div style="text-align: center; padding: 1.5rem; background: rgba(55, 65, 81, 0.15); border-radius: 8px; border: 1px solid rgba(55, 65, 81, 0.2);">
                <div style="font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Available to Trade</div>
                <div style="font-size: 1.25rem; font-weight: 400;">$${cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div style="text-align: center; padding: 1.5rem; background: rgba(55, 65, 81, 0.15); border-radius: 8px; border: 1px solid rgba(55, 65, 81, 0.2);">
                <div style="font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Total Invested</div>
                <div style="font-size: 1.25rem; font-weight: 400;">$${totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div style="text-align: center; padding: 1.5rem; background: rgba(55, 65, 81, 0.15); border-radius: 8px; border: 1px solid rgba(55, 65, 81, 0.2);">
                <div style="font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">Unrealized Gains</div>
                <div style="font-size: 1.25rem; font-weight: 400; color: ${unrealizedColor};">
                    ${unrealizedGains > 0 ? '+' : unrealizedGains < 0 ? '' : ''}$${Math.abs(unrealizedGains).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span style="font-size: 0.9rem; margin-left: 0.25rem;">(${unrealizedGains > 0 ? '+' : unrealizedGains < 0 ? '' : ''}${unrealizedGainsPercent}%)</span>
                </div>
            </div>
        </div>
        
        ${holdingsData.length > 0 ? `
        <div style="overflow-x: auto; max-height: 500px; overflow-y: auto; border-radius: 8px;">
            <table id="portfolioTable" style="width: 100%; font-size: 0.85rem;">
                <thead style="position: sticky; top: 0; background: rgba(55, 65, 81, 0.15); z-index: 10;">
                    <tr>
                        <th class="sortable" data-sort="symbol" style="padding: 1rem 0.75rem; text-align: left; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Symbol <span class="sort-indicator">↕</span>
                        </th>
                        <th class="sortable" data-sort="price_bought" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Price Bought <span class="sort-indicator">↕</span>
                        </th>
                        <th class="sortable" data-sort="current_price" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Last Price <span class="sort-indicator">↕</span>
                        </th>
                        <th style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Day's Range
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 3px; text-transform: none; letter-spacing: normal;">Low - High</div>
                        </th>
                        <th class="sortable" data-sort="portfolio_pct" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            % Portfolio <span class="sort-indicator">↕</span>
                        </th>
                        <th class="sortable" data-sort="intraday" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Intraday G/L <span class="sort-indicator">↕</span>
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 3px; text-transform: none; letter-spacing: normal;">Since Purchase</div>
                        </th>
                        <th class="sortable" data-sort="recent" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Recent Change <span class="sort-indicator">↕</span>
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 3px; text-transform: none; letter-spacing: normal;">Last 30min</div>
                        </th>
                        <th class="sortable" data-sort="today" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Today G/L <span class="sort-indicator">↕</span>
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 3px; text-transform: none; letter-spacing: normal;">Since Market Open</div>
                        </th>
                        <th class="sortable" data-sort="total" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Total G/L <span class="sort-indicator">↕</span>
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 3px; text-transform: none; letter-spacing: normal;">Overall P&L</div>
                        </th>
                        <th class="sortable" data-sort="quantity" style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af; font-weight: 400; cursor: pointer; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em;">
                            Quantity <span class="sort-indicator">↕</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    ${holdingsData.map(holding => {
                        const intradayGL = holding.intraday_gain_loss;
                        const intradayGLPercent = holding.intraday_gain_loss_percent;
                        const recentChange = holding.most_recent_change;
                        const recentChangePercent = holding.most_recent_change_percent;
                        const todayGL = holding.today_gain_loss;
                        const todayGLPercent = holding.today_gain_loss_percent;
                        const totalGL = holding.total_profit_loss;
                        const totalGLPercent = holding.total_profit_loss_percent;
                        const portfolioPct = holding.portfolio_percentage || 0;
                        const dayHigh = holding.today_high;
                        const dayLow = holding.today_low;
                        
                        return `
                            <tr style="border-bottom: 1px solid rgba(55, 65, 81, 0.15);"
                                data-symbol="${holding.symbol}"
                                data-price-bought="${holding.avg_purchase_price}"
                                data-current-price="${holding.current_price}"
                                data-portfolio-pct="${portfolioPct}"
                                data-intraday="${intradayGL || 0}"
                                data-recent="${recentChange || 0}"
                                data-today="${todayGL || 0}"
                                data-total="${totalGL || 0}"
                                data-quantity="${holding.quantity}">
                                <td style="padding: 1rem 0.75rem;">
                                    <div style="font-weight: 500; font-size: 0.9rem;">${holding.symbol}</div>
                                    <div style="font-size: 0.75rem; color: #6b7280; margin-top: 2px;">${holding.name || holding.symbol}</div>
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af;">
                                    $${parseFloat(holding.avg_purchase_price || 0).toFixed(2)}
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right; font-weight: 500;">
                                    $${parseFloat(holding.current_price || 0).toFixed(2)}
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right; font-size: 0.8rem; color: #9ca3af;">
                                    ${dayLow && dayHigh ? 
                                        `$${dayLow.toFixed(2)} - $${dayHigh.toFixed(2)}` : 
                                        '<span style="color: #6b7280;">N/A</span>'}
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right; font-weight: 500;">
                                    ${portfolioPct.toFixed(2)}%
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right;">
                                    ${formatGL(intradayGL, intradayGLPercent)}
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right;">
                                    ${formatGL(recentChange, recentChangePercent, holding.is_new_position, 'New position')}
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right;">
                                    ${formatGL(todayGL, todayGLPercent, holding.is_new_position, 'Bought today')}
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right;">
                                    ${formatGL(totalGL, totalGLPercent)}
                                </td>
                                <td style="padding: 1rem 0.75rem; text-align: right; color: #9ca3af;">
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
    
    // Add sorting functionality
    if (holdingsData.length > 0) {
        addTableSorting();
    }
    
    modal.classList.add('show');
}

// Add table sorting functionality
function addTableSorting() {
    const headers = document.querySelectorAll('#portfolioTable .sortable');
    let currentSort = { column: null, ascending: true };
    
    headers.forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.dataset.sort;
            const tbody = document.querySelector('#portfolioTable tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // Toggle sort direction if clicking same column
            if (currentSort.column === sortKey) {
                currentSort.ascending = !currentSort.ascending;
            } else {
                currentSort.column = sortKey;
                currentSort.ascending = true;
            }
            
            // Sort rows
            rows.sort((a, b) => {
                let aVal, bVal;
                
                if (sortKey === 'symbol') {
                    aVal = a.dataset.symbol;
                    bVal = b.dataset.symbol;
                    return currentSort.ascending ? 
                        aVal.localeCompare(bVal) : 
                        bVal.localeCompare(aVal);
                } else {
                    aVal = parseFloat(a.dataset[sortKey.replace('_', '')]) || 0;
                    bVal = parseFloat(b.dataset[sortKey.replace('_', '')]) || 0;
                    return currentSort.ascending ? aVal - bVal : bVal - aVal;
                }
            });
            
            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
            
            // Update sort indicators
            headers.forEach(h => {
                const indicator = h.querySelector('.sort-indicator');
                if (h === header) {
                    indicator.textContent = currentSort.ascending ? '↑' : '↓';
                    indicator.style.color = '#a855f7';
                } else {
                    indicator.textContent = '↕';
                    indicator.style.color = '#6b7280';
                }
            });
        });
    });
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

// Track page visibility to control animations
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        isPageVisible = false;
    } else {
        isPageVisible = true;
        // Re-enable animation briefly when returning to page
        setTimeout(() => {
            isPageVisible = false;
        }, 1000);
    }
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