// Main Server File - Phantom Stocks Backend
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cron from 'node-cron';

// Load environment variables
dotenv.config();

// Import routes
import portfolioRoutes from './routes/portfolio.js';
import tradesRoutes from './routes/trades.js';
import marketDataRoutes from './routes/market-data.js';
import newsRoutes from './routes/news.js';

// Import services
import { supabase } from './config/supabase.js';

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS Configuration - FIXED
const allowedOrigins = [
    'https://phantomstockspapertrading.com',
    'https://www.phantomstockspapertrading.com',
    'http://localhost:3000',
    'http://localhost:5173'
];

// If ALLOWED_ORIGINS env var is set, add those too
if (process.env.ALLOWED_ORIGINS) {
    allowedOrigins.push(...process.env.ALLOWED_ORIGINS.split(','));
}

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1 || NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: NODE_ENV
    });
});

// API Routes
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/trades', tradesRoutes);
app.use('/api/market-data', marketDataRoutes);
app.use('/api/news', newsRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Phantom Stocks API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            portfolio: '/api/portfolio/*',
            trades: '/api/trades/*',
            marketData: '/api/market-data/*',
            news: '/api/news'
        }
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.path,
        message: 'The requested endpoint does not exist'
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Cron job: Create portfolio snapshots every 30 minutes
cron.schedule('*/30 * * * *', async () => {
    try {
        console.log('Running portfolio snapshot job...');
        
        // Get all users
        const { data: profiles, error: profilesError } = await supabase
            .from('user_profiles')
            .select('user_id');
        
        if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
            return;
        }
        
        // Create snapshot for each user
        for (const profile of profiles) {
            try {
                // Get portfolio from user_profiles (cash_balance)
                const { data: userProfile, error: profileError } = await supabase
                    .from('user_profiles')
                    .select('cash_balance')
                    .eq('user_id', profile.user_id)
                    .single();
                
                if (profileError) continue;
                
                // Get holdings
                const { data: holdings, error: holdingsError } = await supabase
                    .from('holdings')
                    .select('quantity, avg_purchase_price')
                    .eq('user_id', profile.user_id);
                
                if (holdingsError) continue;
                
                // Calculate total holdings value (using average purchase price as approximation)
                const holdingsValue = holdings?.reduce((sum, h) => {
                    return sum + (h.quantity * h.avg_purchase_price);
                }, 0) || 0;
                
                const totalValue = userProfile.cash_balance + holdingsValue;
                
                // Create snapshot
                await supabase
                    .from('portfolio_snapshots')
                    .insert({
                        user_id: profile.user_id,
                        total_value: totalValue,
                        cash_balance: userProfile.cash_balance,
                        holdings_value: holdingsValue
                    });
                
            } catch (error) {
                console.error(`Error creating snapshot for user ${profile.user_id}:`, error);
            }
        }
        
        console.log('Portfolio snapshot job completed');
        
    } catch (error) {
        console.error('Error in portfolio snapshot job:', error);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║   Phantom Stocks API Server Started   ║
╠═══════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(32)} ║
║  Environment: ${NODE_ENV.padEnd(23)} ║
║  Time: ${new Date().toLocaleTimeString().padEnd(27)} ║
╠═══════════════════════════════════════╣
║  Endpoints:                            ║
║  • GET  /health                        ║
║  • GET  /api/portfolio/*               ║
║  • POST /api/trades/execute            ║
║  • GET  /api/market-data/*             ║
║  • GET  /api/news                      ║
╠═══════════════════════════════════════╣
║  Cron Jobs:                            ║
║  • Portfolio snapshots: Every 30 min   ║
╚═══════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    process.exit(0);
});

export default app;