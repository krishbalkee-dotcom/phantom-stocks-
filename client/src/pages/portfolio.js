/**
 * Portfolio Page Logic
 * Handles portfolio dashboard, charts, holdings, and transactions
 */

import { requireAuth } from '../auth/authGuard.js';
import { logout } from '../auth/auth.js';
import { formatCurrency, formatPercentage, formatDateTime } from '../services/portfolioService.js';
import { subscribe, startPriceUpdates, stopPriceUpdates } from '../services/priceUpdater.js';

const API_BASE = 'https://phantom-stocks.onrender.com/api';

// Require authentication
const user = await requireAuth();

// Global state
let performanceChart = null;
let allocationChart = null;
let currentTimeframe = '1D';
let portfolioData = null;
let lastTransactionAmount = 0;
let transactionDays = 10;

// Initialize page
async function init() {
    // Set username and avatar
    const username = user.user_metadata?.username || user.email.split('@')[0];
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar) {
        userAvatar.textContent = username.charAt(0).toUpperCase();
        userAvatar.style.cursor = 'pointer';
        userAvatar.addEventListener('click', () => openAccountModal());
    }
    
    // Setup event listeners
    setupEventListeners();
    
    // Load portfolio data
    await loadPortfolio();
    
    // Start real-time price updates
    if (portfolioData && portfolioData.holdings && portfolioData.holdings.length > 0) {
        const symbols = portfolioData.holdings.map(h => h.symbol);
        startPriceUpdates(symbols, 30000);
        subscribe(handlePriceUpdate);
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            stopPriceUpdates();
            await logout();
        });
    }
    
    // Time period buttons
    document.querySelectorAll('.time-period').forEach(btn => {
        btn.addEventListener('click', async () => {
            const timeframe = btn.dataset.period;
            document.querySelectorAll('.time-period').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTimeframe = timeframe;
            await loadPerformanceChart(timeframe);
        });
    });
    
    // Portfolio summary button
    const summaryBtn = document.getElementById('portfolioSummaryBtn');
    if (summaryBtn) {
        summaryBtn.addEventListener('click', () => openPortfolioSummary());
    }
    
    // Transaction period dropdown
    const transactionPeriodSelect = document.getElementById('transactionPeriod');
    if (transactionPeriodSelect) {
        transactionPeriodSelect.addEventListener('change', async (e) => {
            transactionDays = parseInt(e.target.value);
            await loadTransactions();
        });
    }
}

/**
 * Load all portfolio data
 */
async function loadPortfolio() {
    try {
        // Fetch summary
        const summaryRes = await fetch(`${API_BASE}/portfolio/summary?user_id=${user.id}`);
        const summary = await summaryRes.json();
        
        // Fetch holdings
        const holdingsRes = await fetch(`${API_BASE}/portfolio/holdings?user_id=${user.id}`);
        const holdings = await holdingsRes.json();
        
        // Fetch transactions
        const transactionsRes = await fetch(`${API_BASE}/portfolio/transactions?user_id=${user.id}&days=${transactionDays}`);
        const transactions = await transactionsRes.json();
        
        // Store data
        portfolioData = {
            summary,
            holdings,
            transactions
        };
        
        // Render everything
        renderSummaryCards(summary);
        renderPerformanceHeader(summary);
        await loadPerformanceChart(currentTimeframe);
        renderAllocationChart(holdings);
        renderTransactionsList(transactions);
        
        // Show content
        const loadingState = document.getElementById('loadingState');
        const portfolioContent = document.getElementById('portfolioContent');
        if (loadingState) loadingState.style.display = 'none';
        if (portfolioContent) portfolioContent.style.display = 'block';
        
    } catch (error) {
        console.error('[Portfolio] Error loading portfolio:', error);
        alert('Failed to load portfolio data. Please refresh the page.');
    }
}

/**
 * Render summary cards (Available to Trade with indicator)
 */
function renderSummaryCards(summary) {
    // Available to Trade with transaction indicator
    const availableCash = document.getElementById('availableCash');
    if (availableCash) {
        const cashHTML = `
            <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                <div style="font-size: 1.3rem; font-weight: 400;">${formatCurrency(summary.cash)}</div>
                ${lastTransactionAmount !== 0 ? `
                    <div style="font-size: 0.75rem; color: ${lastTransactionAmount > 0 ? '#10b981' : '#ef4444'};">
                        ${lastTransactionAmount > 0 ? '↗' : '↘'} ${lastTransactionAmount > 0 ? '+' : ''}${formatCurrency(Math.abs(lastTransactionAmount))}
                    </div>
                ` : ''}
            </div>
        `;
        availableCash.innerHTML = cashHTML;
    }
}

/**
 * Render portfolio performance header (Total Value + Today's Change)
 */
function renderPerformanceHeader(summary) {
    const container = document.querySelector('.portfolio-performance-card .card-header');
    if (!container) return;
    
    // Find or create header content
    let headerContent = container.querySelector('.portfolio-performance-header');
    if (!headerContent) {
        headerContent = document.createElement('div');
        headerContent.className = 'portfolio-performance-header';
        container.querySelector('div').appendChild(headerContent);
    }
    
    const isPositive = summary.today_profit_loss >= 0;
    const arrow = isPositive ? '↗' : '↘';
    const color = isPositive ? '#10b981' : '#ef4444';
    
    headerContent.innerHTML = `
        <div style="margin-top: 0.75rem;">
            <div style="font-size: 1.5rem; font-weight: 400; margin-bottom: 0.25rem;">
                ${formatCurrency(summary.total_value)}
            </div>
            <div style="font-size: 0.8rem; color: ${color}; font-weight: 300;">
                ${arrow} ${isPositive ? '+' : ''}${formatCurrency(summary.today_profit_loss)} (${summary.today_profit_loss_percent.toFixed(2)}%) today
            </div>
        </div>
    `;
}

/**
 * Load and render performance chart
 */
async function loadPerformanceChart(timeframe) {
    try {
        const response = await fetch(`${API_BASE}/portfolio/snapshots?user_id=${user.id}&period=${timeframe}`);
        const snapshots = await response.json();
        
        if (performanceChart) {
            performanceChart.destroy();
        }
        
        const ctx = document.getElementById('performanceChart');
        if (!ctx) return;
        
        // Prepare data
        const labels = snapshots.map(s => {
            const date = new Date(s.snapshot_at);
            if (timeframe === '1D') {
                return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            } else {
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
        });
        
        const values = snapshots.map(s => s.total_value);
        
        // Determine if portfolio is up or down overall
        const isPositive = values.length > 1 ? values[values.length - 1] >= values[0] : true;
        
        // Create gradient
        const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, 'rgba(168, 85, 247, 0.3)');
        gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
        
        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Portfolio Value',
                    data: values,
                    borderColor: '#a855f7',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#a855f7',
                    pointHoverBorderColor: '#ffffff',
                    pointHoverBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleColor: '#ffffff',
                        bodyColor: '#ffffff',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return formatCurrency(context.parsed.y);
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9ca3af',
                            maxRotation: 0,
                            font: {
                                size: 10,
                                weight: 300
                            }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#9ca3af',
                            font: {
                                size: 10,
                                weight: 300
                            },
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        });
        
    } catch (error) {
        console.error('[Portfolio] Error loading performance chart:', error);
    }
}

/**
 * Render allocation donut chart
 */
function renderAllocationChart(holdings) {
    if (allocationChart) {
        allocationChart.destroy();
    }
    
    const ctx = document.getElementById('assetAllocationChart');
    if (!ctx) return;
    
    if (!holdings || holdings.length === 0) {
        allocationChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['No Holdings'],
                datasets: [{
                    data: [1],
                    backgroundColor: ['rgba(156, 163, 175, 0.2)'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });
        
        const legend = document.getElementById('assetAllocationLegend');
        if (legend) {
            legend.innerHTML = '<div style="color: #6b7280; text-align: center;">Start trading to see allocation</div>';
        }
        return;
    }
    
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7'];
    const totalValue = holdings.reduce((sum, h) => sum + h.current_value, 0);
    
    allocationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: holdings.map(h => h.symbol),
            datasets: [{
                data: holdings.map(h => h.current_value),
                backgroundColor: colors.slice(0, holdings.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const holding = holdings[context.dataIndex];
                            const percentage = ((holding.current_value / totalValue) * 100).toFixed(1);
                            return [
                                `${holding.symbol}: ${formatCurrency(holding.current_value)}`,
                                `${percentage}% of portfolio`
                            ];
                        }
                    }
                }
            }
        }
    });
    
    // Render legend
    const legend = document.getElementById('assetAllocationLegend');
    if (legend) {
        let legendHTML = '<div style="display: flex; flex-direction: column; gap: 0.5rem;">';
        holdings.forEach((holding, index) => {
            const percentage = ((holding.current_value / totalValue) * 100).toFixed(1);
            legendHTML += `
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <div style="width: 12px; height: 12px; background-color: ${colors[index]}; border-radius: 2px;"></div>
                    <span style="color: #d1d5db; font-size: 0.75rem;">${holding.symbol} (${percentage}%)</span>
                </div>
            `;
        });
        legendHTML += '</div>';
        legend.innerHTML = legendHTML;
    }
}

/**
 * Render transactions list with time period filter
 */
async function loadTransactions() {
    try {
        const response = await fetch(`${API_BASE}/portfolio/transactions?user_id=${user.id}&days=${transactionDays}`);
        const transactions = await response.json();
        renderTransactionsList(transactions);
    } catch (error) {
        console.error('[Portfolio] Error loading transactions:', error);
    }
}

function renderTransactionsList(transactions) {
    const container = document.getElementById('transactionsList');
    if (!container) return;
    
    if (!transactions || transactions.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #6b7280;">
                <div style="font-size: 2rem; margin-bottom: 0.5rem;">📊</div>
                <div style="font-size: 0.9rem; margin-bottom: 0.25rem;">No transactions</div>
                <div style="font-size: 0.75rem; color: #9ca3af;">Start trading to see your activity</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    transactions.forEach(tx => {
        const isBuy = tx.type === 'BUY';
        const icon = isBuy ? '📈' : '📉';
        const iconColor = isBuy ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        const totalClass = isBuy ? 'negative' : 'positive';
        const totalSign = isBuy ? '-' : '+';
        
        const date = new Date(tx.executed_at);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        
        html += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid rgba(55, 65, 81, 0.2);">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div style="width: 2rem; height: 2rem; background: ${iconColor}; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 1rem;">
                        ${icon}
                    </div>
                    <div>
                        <div style="font-size: 0.85rem; font-weight: 400; color: #f9fafb;">${tx.symbol} - ${tx.company_name || tx.symbol}</div>
                        <div style="font-size: 0.7rem; color: #9ca3af;">${dateStr} | ${timeStr}</div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.75rem; color: #9ca3af;">${tx.quantity} shares @ ${formatCurrency(tx.price)}</div>
                    <div style="font-size: 0.85rem; color: ${isBuy ? '#ef4444' : '#10b981'}; font-weight: 400;">
                        ${totalSign}${formatCurrency(tx.total_value)}
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

/**
 * Open portfolio summary modal
 */
async function openPortfolioSummary() {
    try {
        const response = await fetch(`${API_BASE}/portfolio/detailed-summary?user_id=${user.id}`);
        const data = await response.json();
        
        const modal = document.getElementById('portfolioSummaryModal');
        const content = document.getElementById('portfolioSummaryContent');
        
        if (!modal || !content) return;
        
        // Build modal content
        let html = `
            <div style="margin-bottom: 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <div style="font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.25rem;">Total Portfolio Value</div>
                        <div style="font-size: 2rem; font-weight: 400; color: #f9fafb;">${formatCurrency(data.totalValue)}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.25rem;">Today's Change</div>
                        <div style="font-size: 1.1rem; color: ${data.todayChange >= 0 ? '#10b981' : '#ef4444'}; font-weight: 400;">
                            ${data.todayChange >= 0 ? '↗' : '↘'} ${data.todayChange >= 0 ? '+' : ''}${formatCurrency(data.todayChange)} (${data.todayChangePercent.toFixed(2)}%)
                        </div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; padding: 1rem; background: rgba(55, 65, 81, 0.2); border-radius: 8px;">
                    <div>
                        <div style="font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.25rem;">Available to Trade</div>
                        <div style="font-size: 0.95rem; font-weight: 400;">${formatCurrency(data.availableToTrade)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.25rem;">Total Invested</div>
                        <div style="font-size: 0.95rem; font-weight: 400;">${formatCurrency(data.totalInvested)}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.7rem; color: #9ca3af; margin-bottom: 0.25rem;">Unrealized Gains</div>
                        <div style="font-size: 0.95rem; font-weight: 400; color: ${data.unrealizedGains >= 0 ? '#10b981' : '#ef4444'};">
                            ${data.unrealizedGains >= 0 ? '+' : ''}${formatCurrency(data.unrealizedGains)} (${data.unrealizedGainsPercent.toFixed(2)}%)
                        </div>
                    </div>
                </div>
            </div>
            
            <div>
                <h3 style="font-size: 1.1rem; font-weight: 400; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(55, 65, 81, 0.3);">Positions</h3>
                ${data.positions && data.positions.length > 0 ? `
                    <div style="overflow-x: auto; max-height: 400px; overflow-y: auto;">
                        <table style="width: 100%; font-size: 0.8rem; border-collapse: collapse;">
                            <thead style="position: sticky; top: 0; background: #000000; z-index: 1;">
                                <tr style="border-bottom: 1px solid rgba(55, 65, 81, 0.3);">
                                    <th style="text-align: left; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Symbol</th>
                                    <th style="text-align: right; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Last Price</th>
                                    <th style="text-align: right; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Recent Chg</th>
                                    <th style="text-align: right; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Today G/L ($)</th>
                                    <th style="text-align: right; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Today G/L (%)</th>
                                    <th style="text-align: right; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Total G/L ($)</th>
                                    <th style="text-align: right; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Total G/L (%)</th>
                                    <th style="text-align: right; padding: 0.75rem 0.5rem; font-weight: 400; color: #9ca3af;">Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.positions.map(pos => `
                                    <tr style="border-bottom: 1px solid rgba(55, 65, 81, 0.15);">
                                        <td style="padding: 0.75rem 0.5rem;">
                                            <div style="font-weight: 400; color: #f9fafb;">${pos.symbol}</div>
                                            <div style="font-size: 0.7rem; color: #6b7280;">${pos.name}</div>
                                        </td>
                                        <td style="text-align: right; padding: 0.75rem 0.5rem;">${formatCurrency(pos.current_price)}</td>
                                        <td style="text-align: right; padding: 0.75rem 0.5rem; color: ${pos.most_recent_change >= 0 ? '#10b981' : '#ef4444'};">
                                            ${pos.most_recent_change >= 0 ? '+' : ''}${formatCurrency(pos.most_recent_change)}
                                        </td>
                                        <td style="text-align: right; padding: 0.75rem 0.5rem; color: ${pos.today_gain_loss >= 0 ? '#10b981' : '#ef4444'};">
                                            ${pos.today_gain_loss >= 0 ? '+' : ''}${formatCurrency(pos.today_gain_loss)}
                                        </td>
                                        <td style="text-align: right; padding: 0.75rem 0.5rem; color: ${pos.today_gain_loss_percent >= 0 ? '#10b981' : '#ef4444'};">
                                            ${pos.today_gain_loss_percent >= 0 ? '+' : ''}${pos.today_gain_loss_percent.toFixed(2)}%
                                        </td>
                                        <td style="text-align: right; padding: 0.75rem 0.5rem; color: ${pos.total_profit_loss >= 0 ? '#10b981' : '#ef4444'};">
                                            ${pos.total_profit_loss >= 0 ? '+' : ''}${formatCurrency(pos.total_profit_loss)}
                                        </td>
                                        <td style="text-align: right; padding: 0.75rem 0.5rem; color: ${pos.total_profit_loss_percent >= 0 ? '#10b981' : '#ef4444'};">
                                            ${pos.total_profit_loss_percent >= 0 ? '+' : ''}${pos.total_profit_loss_percent.toFixed(2)}%
                                        </td>
                                        <td style="text-align: right; padding: 0.75rem 0.5rem;">${pos.quantity}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 2rem; color: #6b7280;">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">📊</div>
                        <div style="font-size: 0.9rem;">No positions yet</div>
                        <div style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem;">Start trading to build your portfolio</div>
                    </div>
                `}
            </div>
        `;
        
        content.innerHTML = html;
        modal.classList.add('show');
        
    } catch (error) {
        console.error('[Portfolio] Error opening summary:', error);
        alert('Failed to load portfolio summary');
    }
}

/**
 * Handle real-time price updates
 */
function handlePriceUpdate(prices) {
    console.log('[Portfolio] Price update received:', prices);
    
    if (!portfolioData) return;
    
    // Update holdings with new prices
    portfolioData.holdings = portfolioData.holdings.map(holding => {
        if (prices[holding.symbol]) {
            const newPrice = prices[holding.symbol];
            const currentValue = holding.quantity * newPrice;
            const totalProfitLoss = currentValue - (holding.avg_purchase_price * holding.quantity);
            
            return {
                ...holding,
                current_price: newPrice,
                current_value: currentValue,
                total_profit_loss: totalProfitLoss
            };
        }
        return holding;
    });
    
    // Recalculate summary
    const holdingsValue = portfolioData.holdings.reduce((sum, h) => sum + h.current_value, 0);
    const totalValue = portfolioData.summary.cash + holdingsValue;
    const totalPL = totalValue - 10000;
    
    portfolioData.summary = {
        ...portfolioData.summary,
        holdings_value: holdingsValue,
        total_value: totalValue,
        total_profit_loss: totalPL
    };
    
    // Re-render
    renderSummaryCards(portfolioData.summary);
    renderPerformanceHeader(portfolioData.summary);
    renderAllocationChart(portfolioData.holdings);
}

/**
 * Close modal
 */
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
    }
};

// Initialize page
init();