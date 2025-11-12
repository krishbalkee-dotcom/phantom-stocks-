/**
 * Portfolio Page Logic
 * Handles portfolio dashboard, charts, holdings, and transactions
 */

import { requireAuth } from '../auth/authGuard.js';
import { logout } from '../auth/auth.js';
import { 
  getPortfolioSummary, 
  getHoldings, 
  getPortfolioSnapshots,
  getTransactions,
  calculateAssetAllocation,
  formatCurrency,
  formatPercentage,
  formatDateTime,
  getPLColor
} from '../services/portfolioService.js';
import { subscribe, startPriceUpdates, stopPriceUpdates } from '../services/priceUpdater.js';

// Require authentication
const user = await requireAuth();

// Global state
let performanceChart = null;
let allocationChart = null;
let currentTimeframe = '1W';
let portfolioData = null;

// Initialize page
async function init() {
  // Set username
  document.getElementById('username').textContent = user.user_metadata?.username || user.email;
  
  // Setup event listeners
  setupEventListeners();
  
  // Load portfolio data
  await loadPortfolio();
  
  // Start real-time price updates
  if (portfolioData && portfolioData.holdings.length > 0) {
    const symbols = portfolioData.holdings.map(h => h.symbol);
    startPriceUpdates(symbols, 30000); // 30 seconds
    
    // Subscribe to price updates
    subscribe(handlePriceUpdate);
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Logout
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    stopPriceUpdates();
    await logout();
  });
  
  // Timeframe selector
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const timeframe = btn.dataset.timeframe;
      
      // Update active state
      document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentTimeframe = timeframe;
      await loadPerformanceChart(timeframe);
    });
  });
}

/**
 * Load all portfolio data
 */
async function loadPortfolio() {
  try {
    // Fetch summary
    const summary = await getPortfolioSummary(user.id);
    
    // Fetch holdings
    const holdings = await getHoldings(user.id);
    
    // Fetch transactions
    const transactions = await getTransactions(user.id, 10);
    
    // Store data
    portfolioData = {
      summary,
      holdings,
      transactions
    };
    
    // Render everything
    renderSummaryCards(summary);
    renderHoldingsTable(holdings);
    renderTransactionsList(transactions);
    await loadPerformanceChart(currentTimeframe);
    renderAllocationChart(holdings);
    
    // Show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('portfolioContent').style.display = 'block';
    
  } catch (error) {
    console.error('[Portfolio] Error loading portfolio:', error);
    alert('Failed to load portfolio data. Please refresh the page.');
  }
}

/**
 * Render summary cards
 */
function renderSummaryCards(summary) {
  // Total Value
  document.getElementById('totalValue').textContent = formatCurrency(summary.totalValue);
  
  const totalPLPercent = ((summary.totalPL / 10000) * 100).toFixed(2);
  const totalChangeEl = document.getElementById('totalChange');
  totalChangeEl.textContent = `${summary.totalPL >= 0 ? '+' : ''}${formatCurrency(summary.totalPL)} (${totalPLPercent}%)`;
  totalChangeEl.className = `card-change ${summary.totalPL >= 0 ? 'positive' : 'negative'}`;
  
  // Cash Balance
  document.getElementById('cashBalance').textContent = formatCurrency(summary.cash);
  
  // Holdings Value
  document.getElementById('holdingsValue').textContent = formatCurrency(summary.holdingsValue);
  
  // Today's P&L
  document.getElementById('todayPL').textContent = formatCurrency(summary.todayPL);
  const todayPercent = summary.totalValue > 0 
    ? ((summary.todayPL / summary.totalValue) * 100).toFixed(2)
    : '0.00';
  
  const todayChangeEl = document.getElementById('todayChange');
  todayChangeEl.textContent = `${summary.todayPL >= 0 ? '+' : ''}${todayPercent}%`;
  todayChangeEl.className = `card-change ${summary.todayPL >= 0 ? 'positive' : 'negative'}`;
}

/**
 * Load and render performance chart
 */
async function loadPerformanceChart(timeframe) {
  try {
    const snapshots = await getPortfolioSnapshots(user.id, timeframe);
    
    if (performanceChart) {
      performanceChart.destroy();
    }
    
    const ctx = document.getElementById('performanceChart').getContext('2d');
    
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
    
    // Determine if portfolio is up or down
    const isPositive = values.length > 1 && values[values.length - 1] >= values[0];
    
    performanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Portfolio Value',
          data: values,
          borderColor: isPositive ? '#10b981' : '#ef4444',
          backgroundColor: isPositive 
            ? 'rgba(16, 185, 129, 0.1)' 
            : 'rgba(239, 68, 68, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: isPositive ? '#10b981' : '#ef4444',
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
              maxRotation: 0
            }
          },
          y: {
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
              drawBorder: false
            },
            ticks: {
              color: '#9ca3af',
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
  
  // If no holdings, show empty state
  if (holdings.length === 0) {
    const ctx = document.getElementById('allocationChart').getContext('2d');
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
          legend: {
            display: false
          },
          tooltip: {
            enabled: false
          }
        }
      }
    });
    
    document.getElementById('allocationLegend').innerHTML = 
      '<div style="color: #6b7280; text-align: center; width: 100%;">Start trading to see allocation</div>';
    
    return;
  }
  
  const allocation = calculateAssetAllocation(holdings);
  
  // Generate colors
  const colors = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7'
  ];
  
  const ctx = document.getElementById('allocationChart').getContext('2d');
  
  allocationChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: allocation.map(a => a.symbol),
      datasets: [{
        data: allocation.map(a => a.value),
        backgroundColor: colors.slice(0, allocation.length),
        borderWidth: 0
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
          callbacks: {
            label: function(context) {
              const item = allocation[context.dataIndex];
              return [
                `${item.symbol}: ${formatCurrency(item.value)}`,
                `${item.percentage}% of portfolio`
              ];
            }
          }
        }
      }
    }
  });
  
  // Render legend
  let legendHTML = '';
  allocation.forEach((item, index) => {
    legendHTML += `
      <div class="legend-item">
        <div class="legend-color" style="background-color: ${colors[index]}"></div>
        <span>${item.symbol} (${item.percentage}%)</span>
      </div>
    `;
  });
  
  document.getElementById('allocationLegend').innerHTML = legendHTML;
}

/**
 * Render holdings table
 */
function renderHoldingsTable(holdings) {
  const container = document.getElementById('holdingsTable');
  
  if (holdings.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <div class="empty-text">No holdings yet</div>
        <div class="empty-subtext">Start trading to build your portfolio</div>
      </div>
    `;
    return;
  }
  
  let html = `
    <table>
      <thead>
        <tr>
          <th>Symbol</th>
          <th>Company</th>
          <th>Quantity</th>
          <th>Avg Price</th>
          <th>Current Price</th>
          <th>Current Value</th>
          <th>P&L</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  holdings.forEach(holding => {
    const plClass = holding.profitLoss >= 0 ? 'positive' : 'negative';
    const plPercent = ((holding.profitLoss / (holding.avgPrice * holding.quantity)) * 100).toFixed(2);
    
    html += `
      <tr>
        <td class="symbol-cell">${holding.symbol}</td>
        <td>${holding.name}</td>
        <td>${holding.quantity}</td>
        <td>${formatCurrency(holding.avgPrice)}</td>
        <td>${formatCurrency(holding.currentPrice)}</td>
        <td>${formatCurrency(holding.currentValue)}</td>
        <td class="${plClass}">
          ${holding.profitLoss >= 0 ? '+' : ''}${formatCurrency(holding.profitLoss)}
          <br>
          <span style="font-size: 12px;">(${plPercent}%)</span>
        </td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = html;
}

/**
 * Render transactions list
 */
function renderTransactionsList(transactions) {
  const container = document.getElementById('transactionsList');
  
  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">No transactions yet</div>
        <div class="empty-subtext">Your trading history will appear here</div>
      </div>
    `;
    return;
  }
  
  let html = '';
  
  transactions.forEach(tx => {
    const isBuy = tx.type === 'BUY';
    const iconClass = isBuy ? 'buy-icon' : 'sell-icon';
    const icon = isBuy ? '📈' : '📉';
    const totalClass = isBuy ? 'negative' : 'positive';
    const totalSign = isBuy ? '-' : '+';
    
    html += `
      <div class="transaction-item">
        <div class="transaction-info">
          <div class="transaction-icon ${iconClass}">${icon}</div>
          <div class="transaction-details">
            <div class="transaction-symbol">${tx.symbol} - ${tx.name}</div>
            <div class="transaction-date">${formatDateTime(tx.executed_at)}</div>
          </div>
        </div>
        <div class="transaction-amount">
          <div class="transaction-quantity">${tx.quantity} shares @ ${formatCurrency(tx.price)}</div>
          <div class="transaction-total ${totalClass}">
            ${totalSign}${formatCurrency(tx.total_value)}
          </div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
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
      const profitLoss = currentValue - (holding.avgPrice * holding.quantity);
      
      return {
        ...holding,
        currentPrice: newPrice,
        currentValue,
        profitLoss
      };
    }
    return holding;
  });
  
  // Recalculate summary
  const holdingsValue = portfolioData.holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalValue = portfolioData.summary.cash + holdingsValue;
  const totalPL = totalValue - 10000;
  
  portfolioData.summary = {
    ...portfolioData.summary,
    holdingsValue,
    totalValue,
    totalPL
  };
  
  // Re-render
  renderSummaryCards(portfolioData.summary);
  renderHoldingsTable(portfolioData.holdings);
  renderAllocationChart(portfolioData.holdings);
}

// Initialize page
init();