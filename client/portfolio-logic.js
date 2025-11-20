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
    const todayChange = portfolioData?.today_profit_loss || 0;
    const todayChangePercent = portfolioData?.today_profit_loss_percent || 0;
    
    // Color logic: green for positive, purple for zero, red for negative
    let color;
    if (todayChange > 0) {
        color = '#22c55e'; // Green
    } else if (todayChange < 0) {
        color = '#ef4444'; // Red
    } else {
        color = '#a855f7'; // Purple for zero
    }
    
    const arrow = todayChange > 0 ? '↗' : todayChange < 0 ? '↘' : '→';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'portfolio-performance-header';
    
    headerDiv.innerHTML = `
        <div class="total-value">
            $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div class="today-change" style="color: ${color};">
            ${arrow} $${Math.abs(todayChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
            (${todayChange > 0 ? '+' : ''}${todayChangePercent.toFixed(2)}%) today
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
    const todayChange = portfolioData?.today_profit_loss || 0;
    const todayChangePercent = portfolioData?.today_profit_loss_percent || 0;
    
    // Calculate total invested
    const totalInvested = holdingsData.reduce((sum, h) => {
        return sum + (parseFloat(h.avg_purchase_price || 0) * parseFloat(h.quantity || 0));
    }, 0);
    
    const unrealizedGains = totalValue - 10000;
    const unrealizedGainsPercent = ((unrealizedGains / 10000) * 100).toFixed(2);
    
    // Color logic for unrealized gains: green for positive, purple for zero, red for negative
    let unrealizedColor;
    if (unrealizedGains > 0) {
        unrealizedColor = '#22c55e';
    } else if (unrealizedGains < 0) {
        unrealizedColor = '#ef4444';
    } else {
        unrealizedColor = '#a855f7'; // Purple for zero
    }
    
    // Color logic: green for positive, purple for zero, red for negative
    let todayColor;
    if (todayChange > 0) {
        todayColor = '#22c55e';
    } else if (todayChange < 0) {
        todayColor = '#ef4444';
    } else {
        todayColor = '#a855f7'; // Purple for zero
    }
    
    const arrow = todayChange > 0 ? '↗' : todayChange < 0 ? '↘' : '→';
    
    content.innerHTML = `
        <div style="margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid rgba(55, 65, 81, 0.3);">
            <div style="font-size: 1.75rem; font-weight: 400; margin-bottom: 0.5rem;">
                $${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style="font-size: 0.9rem; color: ${todayColor};">
                ${arrow} $${Math.abs(todayChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 
                (${todayChange > 0 ? '+' : ''}${todayChangePercent.toFixed(2)}%) today
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
                <div style="font-size: 1.1rem; font-weight: 400; color: ${unrealizedColor};">
                    ${unrealizedGains > 0 ? '+' : unrealizedGains < 0 ? '' : ''}$${Math.abs(unrealizedGains).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    (${unrealizedGains > 0 ? '+' : unrealizedGains < 0 ? '' : ''}${unrealizedGainsPercent}%)
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
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">
                            Intraday G/L
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 2px;">Since Purchase</div>
                        </th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">
                            Recent Change
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 2px;">Last 30min</div>
                        </th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">
                            Today G/L
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 2px;">Since Market Open</div>
                        </th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">
                            Total G/L
                            <div style="font-size: 0.65rem; font-weight: 300; margin-top: 2px;">Overall P&L</div>
                        </th>
                        <th style="padding: 0.75rem; text-align: right; color: #9ca3af; font-weight: 400;">Quantity</th>
                    </tr>
                </thead>
                <tbody>
                    ${holdingsData.map(holding => {
                        // Get all four G/L metrics
                        const intradayGL = holding.intraday_gain_loss;
                        const intradayGLPercent = holding.intraday_gain_loss_percent;
                        const recentChange = holding.most_recent_change;
                        const recentChangePercent = holding.most_recent_change_percent;
                        const todayGL = holding.today_gain_loss;
                        const todayGLPercent = holding.today_gain_loss_percent;
                        const totalGL = holding.total_profit_loss;
                        const totalGLPercent = holding.total_profit_loss_percent;
                        
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
                        
                        return `
                            <tr style="border-bottom: 1px solid rgba(55, 65, 81, 0.2);">
                                <td style="padding: 0.75rem;">
                                    <div style="font-weight: 400;">${holding.symbol}</div>
                                    <div style="font-size: 0.7rem; color: #9ca3af;">${holding.name || holding.symbol}</div>
                                </td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    $${parseFloat(holding.current_price || 0).toFixed(2)}
                                </td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    ${formatGL(intradayGL, intradayGLPercent)}
                                </td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    ${formatGL(recentChange, recentChangePercent, holding.is_new_position, 'New position')}
                                </td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    ${formatGL(todayGL, todayGLPercent, holding.is_new_position, 'Bought today')}
                                </td>
                                <td style="padding: 0.75rem; text-align: right;">
                                    ${formatGL(totalGL, totalGLPercent)}
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