// Portfolio Logic - Integrated with Supabase Backend
import { requireAuth, logout } from './src/auth/auth.js';
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
        window.location.href = 'index.html';
    }
}

// Load all portfolio data
async function loadPortfolioData() {
    try {
        // Fetch all data in parallel
        const [summary, holdings, transactions, snapshots] = await Promise.all([
            getPortfolioSummary(currentUser.id),
            getHoldings(currentUser.id),
            getTransactions(currentUser.id, 50),
            getPortfolioSnapshots(currentUser.id, currentPeriod)
        ]);
        
        portfolioData = summary;
        holdingsData = holdings;
        transactionsData = transactions;
        snapshotsData = snapshots;
        
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
    
    document.getElementById('welcomeMessage').textContent = `${greeting}, ${firstName}`;
    
    // Update avatar
    document.getElementById('userAvatar').textContent = firstName.charAt(0).toUpperCase();
}

// Render entire portfolio
function renderPortfolio() {
    updateCashDisplay();
    updatePortfolioValue();
    updateTransactionsList();
    renderPerformanceChart();
    renderAssetAllocationChart();
}

// Update available cash display
function updateCashDisplay() {
    const cash = portfolioData?.cash || 0;
    document.getElementById('availableCash').textContent = `$${cash.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`;
}

// Update total portfolio value and change
function updatePortfolioValue() {
    const totalValue = portfolioData?.total_value || 0;
    const initialValue = 10000;
    const change = totalValue - initialValue;
    const changePercent = ((change / initialValue) * 100);
    
    // Update total value
    document.getElementById('totalPortfolioValue').textContent = `$${totalValue.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    })}`;
    
    // Update change display
    const changeElement = document.getElementById('portfolioChange');
    if (Math.abs(change) < 0.01) {
        changeElement.textContent = 'No change yet';
        changeElement.className = 'profit-change';
    } else {
        const sign = change >= 0 ? '+' : '';
        changeElement.textContent = `${sign}$${change.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })} (${sign}${changePercent.toFixed(2)}%)`;
        changeElement.className = `profit-change ${change >= 0 ? 'positive' : 'negative'}`;
    }
}

// Update transactions list
function updateTransactionsList() {
    const container = document.getElementById('transactionsList');
    
    if (!transactionsData || transactionsData.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #9ca3af; font-size: 0.8rem; margin-top: 2rem;">No transactions yet - start trading to see your activity</p>';
        return;
    }
    
    // Show last 5 transactions
    const recentTransactions = transactionsData.slice(0, 5);
    
    container.innerHTML = `
        <div class="transaction-table">
            ${recentTransactions.map(tx => `
                <div class="transaction-row">
                    <div class="transaction-name">
                        <h4>${tx.symbol}</h4>
                        <p>${tx.company_name || tx.symbol}</p>
                    </div>
                    <div class="transaction-action ${tx.action.toLowerCase()}">${tx.action}</div>
                    <div>${tx.quantity} shares</div>
                    <div>$${parseFloat(tx.price).toFixed(2)}</div>
                    <div>$${parseFloat(tx.total_amount || tx.total_value).toFixed(2)}</div>
                    <div style="font-size: 0.7rem; color: #9ca3af;">
                        ${new Date(tx.created_at || tx.executed_at).toLocaleDateString()}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// Render performance chart (SVG-based)
function renderPerformanceChart() {
    const svg = document.getElementById('chartSvg');
    const width = 800;
    const height = 220;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    
    // Clear existing chart
    svg.innerHTML = '';
    
    if (!snapshotsData || snapshotsData.length === 0) {
        // Show "no data" message
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', width / 2);
        text.setAttribute('y', height / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#9ca3af');
        text.setAttribute('font-size', '14');
        text.textContent = 'No performance data yet - start trading to track your portfolio';
        svg.appendChild(text);
        return;
    }
    
    // Prepare data
    const data = snapshotsData.map(s => ({
        time: new Date(s.created_at).getTime(),
        value: s.total_value
    }));
    
    // Calculate scales
    const xMin = Math.min(...data.map(d => d.time));
    const xMax = Math.max(...data.map(d => d.time));
    const yMin = Math.min(...data.map(d => d.value)) * 0.99;
    const yMax = Math.max(...data.map(d => d.value)) * 1.01;
    
    const xScale = (time) => {
        return padding.left + ((time - xMin) / (xMax - xMin)) * (width - padding.left - padding.right);
    };
    
    const yScale = (value) => {
        return height - padding.bottom - ((value - yMin) / (yMax - yMin)) * (height - padding.top - padding.bottom);
    };
    
    // Draw grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (i / gridLines) * (height - padding.top - padding.bottom);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padding.left);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width - padding.right);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', 'rgba(55, 65, 81, 0.3)');
        line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
    }
    
    // Draw chart line
    const pathData = data.map((d, i) => {
        const x = xScale(d.time);
        const y = yScale(d.value);
        return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
    }).join(' ');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#ef4444');
    path.setAttribute('stroke-width', '2');
    svg.appendChild(path);
}

// Render asset allocation donut chart using Chart.js
function renderAssetAllocationChart() {
    const canvas = document.getElementById('assetAllocationChart');
    const legendContainer = document.getElementById('assetAllocationLegend');
    
    // Destroy existing chart
    if (assetAllocationChart) {
        assetAllocationChart.destroy();
    }
    
    // Check if holdings exist
    if (!holdingsData || holdingsData.length === 0) {
        // Show empty state
        const ctx = canvas.getContext('2d');
        assetAllocationChart = new Chart(ctx, {
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
        
        legendContainer.innerHTML = '<div style="color: #6b7280; text-align: center;">Start trading to see allocation</div>';
        return;
    }
    
    // Calculate asset allocation
    const allocation = calculateAssetAllocation(holdingsData);
    
    // Generate colors
    const colors = [
        '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
        '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#a855f7'
    ];
    
    const ctx = canvas.getContext('2d');
    
    assetAllocationChart = new Chart(ctx, {
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
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    callbacks: {
                        label: function(context) {
                            const item = allocation[context.dataIndex];
                            return [
                                `${item.symbol}: $${item.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
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
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                <div style="width: 12px; height: 12px; background-color: ${colors[index]}; border-radius: 2px;"></div>
                <span style="color: #d1d5db;">${item.symbol} (${item.percentage}%)</span>
            </div>
        `;
    });
    
    legendContainer.innerHTML = legendHTML;
}

// Setup event listeners
function setupEventListeners() {
    // Time period buttons
    document.querySelectorAll('.time-period').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.time-period').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentPeriod = btn.dataset.period;
            snapshotsData = await getPortfolioSnapshots(currentUser.id, currentPeriod);
            renderPerformanceChart();
        });
    });
    
    // News button
    document.getElementById('newsBtn').addEventListener('click', openNewsModal);
    
    // User avatar click - open account settings
    document.getElementById('userAvatar').addEventListener('click', openAccountSettings);
    
    // Portfolio summary button
    document.getElementById('portfolioSummaryBtn').addEventListener('click', openPortfolioSummary);
    
    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Change password button
    document.getElementById('changePasswordBtn').addEventListener('click', handleChangePassword);
}

// Open account settings modal
async function openAccountSettings() {
    const modal = document.getElementById('accountModal');
    
    // Populate user info
    document.getElementById('currentEmail').value = currentUser.email;
    
    const { user_metadata } = currentUser;
    const username = user_metadata?.username || currentUser.email.split('@')[0];
    document.getElementById('currentUsername').value = username;
    
    // Clear password fields
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    
    // Hide messages
    document.getElementById('passwordError').classList.remove('show');
    document.getElementById('passwordSuccess').classList.remove('show');
    
    modal.classList.add('show');
}

// Open news modal
async function openNewsModal() {
    const modal = document.getElementById('newsModal');
    const newsList = document.getElementById('newsList');
    
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

// Open portfolio summary modal
function openPortfolioSummary() {
    const modal = document.getElementById('portfolioSummaryModal');
    const content = document.getElementById('portfolioSummaryContent');
    
    const totalValue = portfolioData?.total_value || 0;
    const cash = portfolioData?.cash || 0;
    const investedValue = totalValue - cash;
    const initialValue = 10000;
    const totalReturn = totalValue - initialValue;
    const totalReturnPercent = ((totalReturn / initialValue) * 100).toFixed(2);
    
    content.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
            <div class="setting-item">
                <span>Total Portfolio Value</span>
                <span style="font-weight: 400;">$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="setting-item">
                <span>Available Cash</span>
                <span style="font-weight: 400;">$${cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="setting-item">
                <span>Invested Value</span>
                <span style="font-weight: 400;">$${investedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div class="setting-item">
                <span>Total Return</span>
                <span style="font-weight: 400; color: ${totalReturn >= 0 ? '#22c55e' : '#ef4444'};">
                    ${totalReturn >= 0 ? '+' : ''}$${totalReturn.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${totalReturn >= 0 ? '+' : ''}${totalReturnPercent}%)
                </span>
            </div>
            <div class="setting-item">
                <span>Number of Positions</span>
                <span style="font-weight: 400;">${holdingsData.length}</span>
            </div>
            <div class="setting-item" style="border-bottom: none;">
                <span>Total Transactions</span>
                <span style="font-weight: 400;">${transactionsData.length}</span>
            </div>
        </div>
    `;
    
    modal.classList.add('show');
}

// Handle password change
async function handleChangePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;
    
    const errorDiv = document.getElementById('passwordError');
    const successDiv = document.getElementById('passwordSuccess');
    
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
    btn.disabled = true;
    btn.textContent = 'Updating...';
    
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
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';
        
        btn.disabled = false;
        btn.textContent = 'Update Password';
        
    } catch (error) {
        console.error('Error changing password:', error);
        errorDiv.textContent = error.message || 'Failed to update password';
        errorDiv.classList.add('show');
        btn.disabled = false;
        btn.textContent = 'Update Password';
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
    document.getElementById(modalId).classList.remove('show');
};

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializePage);

// Auto-refresh portfolio data every 30 seconds
setInterval(async () => {
    try {
        await loadPortfolioData();
        renderPortfolio();
    } catch (error) {
        console.error('Error refreshing portfolio:', error);
    }
}, 30000);