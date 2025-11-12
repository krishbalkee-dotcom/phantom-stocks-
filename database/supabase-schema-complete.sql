-- =====================================================
-- PHANTOM STOCKS PAPER TRADING PLATFORM
-- Complete Supabase Schema
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USER & AUTHENTICATION
-- =====================================================

-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  cash_balance NUMERIC DEFAULT 10000 CHECK (cash_balance >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_email ON user_profiles(email);
CREATE INDEX idx_user_profiles_username ON user_profiles(username);

-- =====================================================
-- PORTFOLIO & TRADING
-- =====================================================

-- Holdings (current stock positions)
CREATE TABLE holdings (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  avg_purchase_price NUMERIC NOT NULL CHECK (avg_purchase_price > 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, symbol)
);

CREATE INDEX idx_holdings_user ON holdings(user_id);
CREATE INDEX idx_holdings_symbol ON holdings(symbol);

-- Transactions (trade history)
CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  company_name TEXT,
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  price NUMERIC NOT NULL CHECK (price > 0),
  total_value NUMERIC NOT NULL,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_date ON transactions(user_id, executed_at DESC);
CREATE INDEX idx_transactions_symbol ON transactions(symbol);

-- Portfolio snapshots (for performance chart)
CREATE TABLE portfolio_snapshots (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  total_value NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  holdings_value NUMERIC NOT NULL,
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_user_time ON portfolio_snapshots(user_id, snapshot_at DESC);

-- =====================================================
-- MARKET DATA CACHE (Existing - Keep)
-- =====================================================

-- Candlestick data cache (stores last 1000 bars per symbol/timeframe)
CREATE TABLE IF NOT EXISTS candles (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, timeframe, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(symbol, timeframe, timestamp DESC);

-- Simple cache metadata (tracks when data was last refreshed)
CREATE TABLE IF NOT EXISTS cache_metadata (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  bar_count INTEGER DEFAULT 0,
  PRIMARY KEY(symbol, timeframe)
);

-- Pre-calculated indicators cache
CREATE TABLE IF NOT EXISTS indicators (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  indicator_type TEXT NOT NULL CHECK (indicator_type IN ('sma', 'ema', 'rsi', 'bb', 'macd', 'volume')),
  value NUMERIC,
  value_upper NUMERIC,
  value_middle NUMERIC,
  value_lower NUMERIC,
  value_signal NUMERIC,
  value_histogram NUMERIC,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, timeframe, indicator_type, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_indicators_lookup ON indicators(symbol, timeframe, indicator_type, timestamp DESC);

-- =====================================================
-- COURSE SYSTEM
-- =====================================================

-- Course modules (static content)
CREATE TABLE course_modules (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  icon_number INTEGER NOT NULL,
  order_index INTEGER NOT NULL UNIQUE,
  estimated_time_minutes INTEGER DEFAULT 15,
  category TEXT DEFAULT 'beginner',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User course progress
CREATE TABLE user_course_progress (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module_id INTEGER REFERENCES course_modules(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  time_spent_seconds INTEGER DEFAULT 0,
  UNIQUE(user_id, module_id)
);

CREATE INDEX idx_course_progress_user ON user_course_progress(user_id);
CREATE INDEX idx_course_progress_module ON user_course_progress(module_id);

-- Page view tracking (for 10-minute rule)
CREATE TABLE course_page_views (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module_id INTEGER REFERENCES course_modules(id) ON DELETE CASCADE NOT NULL,
  session_start TIMESTAMPTZ DEFAULT NOW(),
  last_ping TIMESTAMPTZ DEFAULT NOW(),
  total_time_seconds INTEGER DEFAULT 0
);

CREATE INDEX idx_page_views_user_module ON course_page_views(user_id, module_id);

-- =====================================================
-- NEWS CACHE
-- =====================================================

-- Cached news articles (1 hour cache)
CREATE TABLE news_cache (
  id BIGSERIAL PRIMARY KEY,
  article_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  article_url TEXT NOT NULL,
  image_url TEXT,
  description TEXT,
  source TEXT,
  tickers TEXT[], -- Array of related symbols
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_news_published ON news_cache(published_at DESC);
CREATE INDEX idx_news_cached ON news_cache(cached_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update holdings updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_holdings_updated_at
BEFORE UPDATE ON holdings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Auto-update user last_active on any portfolio action
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_profiles 
    SET last_active = NOW() 
    WHERE user_id = NEW.user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_last_active_on_transaction
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_user_last_active();

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all user tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_page_views ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only access their own data
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own holdings"
  ON holdings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own snapshots"
  ON portfolio_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own course progress"
  ON user_course_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own page views"
  ON course_page_views FOR SELECT
  USING (auth.uid() = user_id);

-- Course modules are public (read-only)
ALTER TABLE course_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view course modules"
  ON course_modules FOR SELECT
  TO authenticated
  USING (true);

-- News cache is public (read-only)
ALTER TABLE news_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view news"
  ON news_cache FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================
-- SEED DATA: Course Modules
-- =====================================================

INSERT INTO course_modules (title, description, content, icon_number, order_index, category) VALUES
(
  'Stock Market Basics',
  'Learn the fundamentals of stock markets, how they work, and key terminology.',
  '<h1>Stock Market Basics</h1>
  <p>The stock market is a complex financial ecosystem where shares of publicly traded companies are bought and sold. Understanding the basics is crucial for any aspiring trader.</p>
  
  <h2>What is a Stock?</h2>
  <p>A stock represents ownership in a company. When you buy a stock, you become a shareholder and own a piece of that company. The value of your stock fluctuates based on the company''s performance and market sentiment.</p>
  
  <h2>How Do Stock Markets Work?</h2>
  <p>Stock markets operate through exchanges like the NYSE (New York Stock Exchange) and NASDAQ. These exchanges facilitate the buying and selling of stocks through a network of buyers and sellers.</p>
  
  <h3>Key Concepts:</h3>
  <ul>
    <li><strong>Market Orders:</strong> Buy or sell immediately at the current market price</li>
    <li><strong>Limit Orders:</strong> Set a specific price at which you want to buy or sell</li>
    <li><strong>Bid-Ask Spread:</strong> The difference between the highest price a buyer will pay (bid) and the lowest price a seller will accept (ask)</li>
    <li><strong>Volume:</strong> The number of shares traded during a given period</li>
  </ul>
  
  <h2>Types of Stocks</h2>
  <p><strong>Common Stock:</strong> Provides voting rights and potential dividends. Most stocks you''ll encounter are common stocks.</p>
  <p><strong>Preferred Stock:</strong> Typically no voting rights but priority in dividend payments and asset distribution during liquidation.</p>
  
  <h2>Market Participants</h2>
  <p>Understanding who trades in the market helps you understand market movements:</p>
  <ul>
    <li><strong>Retail Investors:</strong> Individual investors like you</li>
    <li><strong>Institutional Investors:</strong> Banks, hedge funds, pension funds</li>
    <li><strong>Market Makers:</strong> Firms that provide liquidity by buying and selling</li>
  </ul>
  
  <h2>Getting Started</h2>
  <p>Before you start trading, ensure you:</p>
  <ul>
    <li>Understand your risk tolerance</li>
    <li>Set clear investment goals</li>
    <li>Only invest money you can afford to lose</li>
    <li>Diversify your portfolio</li>
  </ul>
  
  <p><em>Remember: The stock market involves risk. Past performance doesn''t guarantee future results. Always do your research before investing.</em></p>',
  1,
  1,
  'beginner'
),
(
  'Technical Analysis',
  'Master chart patterns, indicators, and technical analysis techniques.',
  '<h1>Technical Analysis</h1>
  <p>Technical analysis is the study of historical price movements and trading volume to predict future price trends. Unlike fundamental analysis, which focuses on a company''s financial health, technical analysis relies solely on chart patterns and statistical indicators.</p>
  
  <h2>Core Principles</h2>
  <p>Technical analysis is based on three key assumptions:</p>
  <ol>
    <li><strong>Price Discounts Everything:</strong> All known information is already reflected in the price</li>
    <li><strong>Price Moves in Trends:</strong> Prices tend to move in identifiable trends</li>
    <li><strong>History Repeats Itself:</strong> Market psychology creates repeating patterns</li>
  </ol>
  
  <h2>Chart Types</h2>
  <p><strong>Candlestick Charts:</strong> Show open, high, low, and close prices for each period. Green (or white) candles indicate the close was higher than the open, while red (or black) indicates the opposite.</p>
  
  <p><strong>Line Charts:</strong> Simple charts connecting closing prices with a line.</p>
  
  <p><strong>Bar Charts (OHLC):</strong> Display the same information as candlesticks but in a different visual format.</p>
  
  <h2>Key Indicators</h2>
  <h3>Moving Averages</h3>
  <p><strong>Simple Moving Average (SMA):</strong> The average price over a specified period. Common periods are 50-day, 100-day, and 200-day SMAs.</p>
  <p><strong>Exponential Moving Average (EMA):</strong> Gives more weight to recent prices, making it more responsive to new information.</p>
  
  <h3>Relative Strength Index (RSI)</h3>
  <p>Measures the speed and magnitude of price changes on a scale of 0-100. Values above 70 indicate overbought conditions, while values below 30 suggest oversold conditions.</p>
  
  <h3>MACD (Moving Average Convergence Divergence)</h3>
  <p>Shows the relationship between two moving averages. Traders look for crossovers, divergences, and rapid rises/falls as signals.</p>
  
  <h3>Bollinger Bands</h3>
  <p>Consist of a middle band (SMA) and two outer bands (standard deviations). When price touches the upper band, it may be overbought; when it touches the lower band, it may be oversold.</p>
  
  <h2>Common Chart Patterns</h2>
  <ul>
    <li><strong>Head and Shoulders:</strong> Reversal pattern indicating a trend change</li>
    <li><strong>Double Top/Bottom:</strong> Reversal patterns showing strong support or resistance</li>
    <li><strong>Triangles:</strong> Continuation patterns (ascending, descending, symmetrical)</li>
    <li><strong>Flags and Pennants:</strong> Short-term continuation patterns</li>
  </ul>
  
  <h2>Support and Resistance</h2>
  <p><strong>Support:</strong> A price level where buying pressure prevents the price from falling further.</p>
  <p><strong>Resistance:</strong> A price level where selling pressure prevents the price from rising further.</p>
  <p>When support breaks, it often becomes resistance, and vice versa.</p>
  
  <h2>Volume Analysis</h2>
  <p>Volume confirms price movements. Rising prices with increasing volume suggest strong bullish momentum. Rising prices with decreasing volume may indicate a weakening trend.</p>
  
  <p><em>Technical analysis is both an art and a science. Practice recognizing patterns on charts and combining multiple indicators for better accuracy.</em></p>',
  2,
  2,
  'intermediate'
),
(
  'Fundamental Analysis',
  'Understand company financials, valuation metrics, and economic indicators.',
  '<h1>Fundamental Analysis</h1>
  <p>Fundamental analysis evaluates a company''s intrinsic value by examining its financial statements, management, competitive advantages, and industry position. The goal is to determine whether a stock is overvalued or undervalued.</p>
  
  <h2>Financial Statements</h2>
  <h3>Income Statement</h3>
  <p>Shows a company''s revenues, expenses, and profits over a period.</p>
  <ul>
    <li><strong>Revenue:</strong> Total income from sales</li>
    <li><strong>Cost of Goods Sold (COGS):</strong> Direct costs of producing goods/services</li>
    <li><strong>Gross Profit:</strong> Revenue minus COGS</li>
    <li><strong>Operating Expenses:</strong> Costs of running the business (salaries, rent, etc.)</li>
    <li><strong>Net Income:</strong> Bottom line profit after all expenses and taxes</li>
  </ul>
  
  <h3>Balance Sheet</h3>
  <p>Snapshot of a company''s assets, liabilities, and shareholders'' equity at a specific point in time.</p>
  <ul>
    <li><strong>Assets:</strong> What the company owns (cash, inventory, property)</li>
    <li><strong>Liabilities:</strong> What the company owes (debt, accounts payable)</li>
    <li><strong>Shareholders'' Equity:</strong> Assets minus liabilities (net worth)</li>
  </ul>
  
  <h3>Cash Flow Statement</h3>
  <p>Tracks the flow of cash in and out of the business.</p>
  <ul>
    <li><strong>Operating Cash Flow:</strong> Cash from core business operations</li>
    <li><strong>Investing Cash Flow:</strong> Cash from buying/selling assets</li>
    <li><strong>Financing Cash Flow:</strong> Cash from debt, equity, and dividends</li>
  </ul>
  
  <h2>Key Valuation Ratios</h2>
  <h3>Price-to-Earnings (P/E) Ratio</h3>
  <p>Stock Price ÷ Earnings Per Share. Indicates how much investors are willing to pay for $1 of earnings. Higher P/E suggests growth expectations or overvaluation.</p>
  
  <h3>Price-to-Book (P/B) Ratio</h3>
  <p>Stock Price ÷ Book Value Per Share. Compares market value to the company''s accounting value. Values below 1 may indicate undervaluation.</p>
  
  <h3>Price-to-Sales (P/S) Ratio</h3>
  <p>Market Cap ÷ Total Revenue. Useful for evaluating companies that aren''t yet profitable.</p>
  
  <h3>Dividend Yield</h3>
  <p>Annual Dividends Per Share ÷ Stock Price. Shows the return on investment from dividends alone.</p>
  
  <h3>Return on Equity (ROE)</h3>
  <p>Net Income ÷ Shareholders'' Equity. Measures how efficiently a company generates profits from shareholder investments.</p>
  
  <h3>Debt-to-Equity Ratio</h3>
  <p>Total Debt ÷ Total Equity. High ratios indicate the company relies heavily on debt, which increases risk.</p>
  
  <h2>Competitive Analysis</h2>
  <p>Understanding a company''s competitive position involves:</p>
  <ul>
    <li><strong>Market Share:</strong> The company''s portion of total industry sales</li>
    <li><strong>Competitive Advantages:</strong> Brand strength, patents, cost advantages</li>
    <li><strong>Industry Trends:</strong> Is the industry growing or declining?</li>
    <li><strong>Barriers to Entry:</strong> How easy is it for new competitors to enter?</li>
  </ul>
  
  <h2>Management Quality</h2>
  <p>Evaluate:</p>
  <ul>
    <li>Track record of CEO and executive team</li>
    <li>Corporate governance and ethics</li>
    <li>Capital allocation decisions</li>
    <li>Transparency in communications</li>
  </ul>
  
  <h2>Economic Indicators</h2>
  <p>Broader economic factors affect all stocks:</p>
  <ul>
    <li><strong>GDP Growth:</strong> Overall economic health</li>
    <li><strong>Interest Rates:</strong> Affect borrowing costs and stock valuations</li>
    <li><strong>Inflation:</strong> Erodes purchasing power and affects profits</li>
    <li><strong>Unemployment:</strong> Indicates consumer spending power</li>
  </ul>
  
  <h2>Putting It All Together</h2>
  <p>Fundamental analysis requires patience and thorough research. Compare companies within the same industry, look for consistent growth, and avoid stocks with deteriorating fundamentals regardless of price trends.</p>
  
  <p><em>The best investments combine strong fundamentals with reasonable valuations. Always read annual reports (10-K) and quarterly earnings reports (10-Q) to stay informed.</em></p>',
  3,
  3,
  'intermediate'
),
(
  'Risk Management',
  'Learn how to protect your capital and manage portfolio risk effectively.',
  '<h1>Risk Management</h1>
  <p>Risk management is the most important skill in trading. Even the best analysis means nothing if you don''t protect your capital. Professional traders focus as much on managing risk as they do on finding opportunities.</p>
  
  <h2>Core Principles</h2>
  <h3>1. Never Risk More Than You Can Afford to Lose</h3>
  <p>Only invest money you don''t need for essential expenses. The stock market is volatile, and even well-researched investments can lose value.</p>
  
  <h3>2. Position Sizing</h3>
  <p>Don''t put all your eggs in one basket. A common rule is to never risk more than 1-2% of your total portfolio on a single trade.</p>
  
  <p><strong>Example:</strong> With a $10,000 portfolio, a 2% position size means risking $200 per trade. If you''re buying a stock at $50 with a stop loss at $45 (10% loss), you should buy no more than 40 shares ($200 risk ÷ $5 loss per share).</p>
  
  <h3>3. Stop-Loss Orders</h3>
  <p>A stop-loss is a predetermined price at which you''ll sell to limit losses. It removes emotion from the decision and protects against catastrophic losses.</p>
  
  <p><strong>Types of Stop Losses:</strong></p>
  <ul>
    <li><strong>Fixed Dollar Amount:</strong> Sell if the stock drops by $X</li>
    <li><strong>Percentage-Based:</strong> Sell if the stock drops by X%</li>
    <li><strong>Technical Stop:</strong> Based on support levels or moving averages</li>
    <li><strong>Trailing Stop:</strong> Moves up with the stock price but never down</li>
  </ul>
  
  <h2>The Risk-Reward Ratio</h2>
  <p>Before entering a trade, calculate your risk-reward ratio:</p>
  <p><strong>Risk:</strong> Entry Price - Stop Loss Price<br>
  <strong>Reward:</strong> Target Price - Entry Price</p>
  
  <p>Aim for a minimum 2:1 reward-to-risk ratio. If you''re risking $1, you should stand to gain at least $2.</p>
  
  <p><strong>Example:</strong></p>
  <ul>
    <li>Buy at $50</li>
    <li>Stop loss at $48 (risk = $2)</li>
    <li>Target at $55 (reward = $5)</li>
    <li>Risk-Reward = 5:2 = 2.5:1 ✓</li>
  </ul>
  
  <h2>Diversification</h2>
  <p>Spread your investments across:</p>
  <ul>
    <li><strong>Different Sectors:</strong> Technology, healthcare, finance, etc.</li>
    <li><strong>Different Company Sizes:</strong> Large-cap, mid-cap, small-cap</li>
    <li><strong>Different Asset Classes:</strong> Stocks, bonds, commodities (for advanced investors)</li>
  </ul>
  
  <p>However, over-diversification can dilute returns. 10-15 positions is often sufficient for retail investors.</p>
  
  <h2>Emotional Control</h2>
  <h3>Common Psychological Pitfalls:</h3>
  <ul>
    <li><strong>Fear of Missing Out (FOMO):</strong> Chasing stocks that have already surged</li>
    <li><strong>Revenge Trading:</strong> Trying to quickly recover losses with risky trades</li>
    <li><strong>Confirmation Bias:</strong> Only seeking information that supports your position</li>
    <li><strong>Loss Aversion:</strong> Holding losing positions too long hoping they''ll recover</li>
    <li><strong>Overconfidence:</strong> Taking on too much risk after winning trades</li>
  </ul>
  
  <h3>Strategies for Emotional Control:</h3>
  <ul>
    <li>Create a trading plan and stick to it</li>
    <li>Keep a trading journal to track decisions and emotions</li>
    <li>Take breaks after significant wins or losses</li>
    <li>Never trade based on emotions</li>
    <li>Accept that losses are part of trading</li>
  </ul>
  
  <h2>Risk Assessment Framework</h2>
  <p>Before entering any trade, ask yourself:</p>
  <ol>
    <li>What is my maximum acceptable loss on this trade?</li>
    <li>Where will I place my stop loss?</li>
    <li>What is my target profit?</li>
    <li>What is my risk-reward ratio?</li>
    <li>How does this fit into my overall portfolio?</li>
    <li>Can I afford to lose this amount?</li>
  </ol>
  
  <h2>Portfolio Allocation</h2>
  <p>A balanced approach might look like:</p>
  <ul>
    <li>70% core holdings (stable, large-cap stocks)</li>
    <li>20% growth holdings (higher potential, higher risk)</li>
    <li>10% speculative/opportunistic trades</li>
  </ul>
  
  <h2>When to Cut Losses</h2>
  <p>Cut losses quickly if:</p>
  <ul>
    <li>Your stop loss is hit</li>
    <li>The original thesis for buying is no longer valid</li>
    <li>Better opportunities emerge</li>
    <li>Company fundamentals deteriorate significantly</li>
  </ul>
  
  <p><strong>Remember:</strong> Taking a small loss is better than hoping for a recovery that may never come. Capital preservation is key to long-term success.</p>
  
  <p><em>The goal isn''t to never lose money - it''s to ensure that when you do lose, it''s a controlled, predetermined amount that doesn''t jeopardize your portfolio.</em></p>',
  4,
  4,
  'intermediate'
),
(
  'Portfolio Diversification',
  'Build a balanced portfolio across sectors, asset types, and risk levels.',
  '<h1>Portfolio Diversification</h1>
  <p>Diversification is the practice of spreading your investments across various assets to reduce risk. The goal is to create a portfolio where poor performance in one area is offset by strong performance in another.</p>
  
  <h2>Why Diversify?</h2>
  <p>The core principle: "Don''t put all your eggs in one basket." Diversification protects you from:</p>
  <ul>
    <li><strong>Company-Specific Risk:</strong> One company''s failure won''t destroy your portfolio</li>
    <li><strong>Sector-Specific Risk:</strong> Entire industries can decline (e.g., energy in 2020)</li>
    <li><strong>Market Risk:</strong> Overall market downturns affect diversified portfolios less severely</li>
  </ul>
  
  <h2>Types of Diversification</h2>
  
  <h3>1. Sector Diversification</h3>
  <p>Spread investments across different industries:</p>
  <ul>
    <li><strong>Technology:</strong> Apple, Microsoft, Google</li>
    <li><strong>Healthcare:</strong> Johnson & Johnson, Pfizer</li>
    <li><strong>Financial:</strong> JPMorgan Chase, Bank of America</li>
    <li><strong>Consumer Goods:</strong> Procter & Gamble, Coca-Cola</li>
    <li><strong>Energy:</strong> ExxonMobil, Chevron</li>
    <li><strong>Industrial:</strong> Caterpillar, Boeing</li>
    <li><strong>Real Estate:</strong> REITs</li>
  </ul>
  
  <p><strong>Sector Rotation:</strong> Different sectors perform better at different stages of the economic cycle. Having exposure to multiple sectors helps maintain stability.</p>
  
  <h3>2. Market Cap Diversification</h3>
  <ul>
    <li><strong>Large-Cap (>$10B):</strong> Stable, established companies (Apple, Microsoft)</li>
    <li><strong>Mid-Cap ($2B-$10B):</strong> Growing companies with moderate risk</li>
    <li><strong>Small-Cap (<$2B):</strong> Higher growth potential but higher risk</li>
  </ul>
  
  <p>A balanced portfolio might be 70% large-cap, 20% mid-cap, 10% small-cap.</p>
  
  <h3>3. Geographic Diversification</h3>
  <p>Don''t limit yourself to domestic stocks:</p>
  <ul>
    <li><strong>Domestic (US):</strong> 60-70% of portfolio</li>
    <li><strong>Developed Markets:</strong> Europe, Japan, Australia (20-30%)</li>
    <li><strong>Emerging Markets:</strong> China, India, Brazil (10-20%)</li>
  </ul>
  
  <h3>4. Investment Style Diversification</h3>
  <ul>
    <li><strong>Growth Stocks:</strong> Companies expected to grow faster than the market</li>
    <li><strong>Value Stocks:</strong> Undervalued companies trading below intrinsic value</li>
    <li><strong>Dividend Stocks:</strong> Companies paying regular dividends for income</li>
    <li><strong>Cyclical Stocks:</strong> Performance tied to economic cycles</li>
    <li><strong>Defensive Stocks:</strong> Stable performance regardless of economic conditions</li>
  </ul>
  
  <h2>Asset Allocation Models</h2>
  
  <h3>Conservative Portfolio (Low Risk)</h3>
  <ul>
    <li>70% Large-cap stocks</li>
    <li>20% Bonds/Fixed income</li>
    <li>10% Cash equivalents</li>
  </ul>
  
  <h3>Moderate Portfolio (Balanced)</h3>
  <ul>
    <li>50% Large-cap stocks</li>
    <li>20% Mid-cap stocks</li>
    <li>10% Small-cap stocks</li>
    <li>15% Bonds</li>
    <li>5% Cash</li>
  </ul>
  
  <h3>Aggressive Portfolio (High Growth)</h3>
  <ul>
    <li>40% Large-cap growth stocks</li>
    <li>30% Mid-cap stocks</li>
    <li>20% Small-cap stocks</li>
    <li>10% Emerging markets/Speculative</li>
  </ul>
  
  <h2>Correlation and Diversification</h2>
  <p><strong>Correlation</strong> measures how two assets move together:</p>
  <ul>
    <li><strong>+1:</strong> Perfect positive correlation (move together)</li>
    <li><strong>0:</strong> No correlation (independent movements)</li>
    <li><strong>-1:</strong> Perfect negative correlation (move opposite)</li>
  </ul>
  
  <p>True diversification comes from holding assets with low or negative correlation. For example, gold often rises when stocks fall, providing portfolio balance.</p>
  
  <h2>Rebalancing Your Portfolio</h2>
  <p>Over time, your portfolio allocations will drift as some investments outperform others. <strong>Rebalancing</strong> means selling winners and buying underperformers to restore your target allocation.</p>
  
  <p><strong>When to Rebalance:</strong></p>
  <ul>
    <li><strong>Time-Based:</strong> Quarterly or annually</li>
    <li><strong>Threshold-Based:</strong> When an allocation drifts 5-10% from target</li>
  </ul>
  
  <p><strong>Example:</strong><br>
  Target: 60% stocks, 40% bonds<br>
  After 1 year: 70% stocks, 30% bonds (stocks outperformed)<br>
  Action: Sell 10% of stocks, buy 10% more bonds</p>
  
  <h2>Common Diversification Mistakes</h2>
  
  <h3>1. Over-Diversification</h3>
  <p>Owning too many stocks (50+) dilutes returns and makes portfolio management difficult. 10-20 well-researched positions is often optimal for retail investors.</p>
  
  <h3>2. False Diversification</h3>
  <p>Owning 10 tech stocks isn''t diversification - it''s concentration in one sector. Ensure you''re spread across truly different areas.</p>
  
  <h3>3. Ignoring Correlation</h3>
  <p>Adding similar stocks doesn''t reduce risk. Research how your holdings correlate.</p>
  
  <h3>4. Set-It-and-Forget-It</h3>
  <p>Markets change. Review your portfolio at least quarterly and adjust for changes in your goals or market conditions.</p>
  
  <h2>Building Your Diversified Portfolio</h2>
  <p><strong>Step 1:</strong> Determine your risk tolerance and investment timeline<br>
  <strong>Step 2:</strong> Choose your target asset allocation<br>
  <strong>Step 3:</strong> Research and select stocks across sectors and styles<br>
  <strong>Step 4:</strong> Execute your initial purchases<br>
  <strong>Step 5:</strong> Monitor performance and rebalance periodically<br>
  <strong>Step 6:</strong> Adjust as your goals or circumstances change</p>
  
  <h2>Measuring Diversification</h2>
  <p>Use these metrics to assess your portfolio:</p>
  <ul>
    <li><strong>Sector Concentration:</strong> No single sector should exceed 30-40%</li>
    <li><strong>Position Size:</strong> No single stock should exceed 10-15% (except for very high conviction)</li>
    <li><strong>Portfolio Beta:</strong> Measures overall market sensitivity (1.0 = matches market)</li>
  </ul>
  
  <p><em>Diversification is not just about having many stocks - it''s about having the RIGHT mix of stocks that work together to reduce risk while maintaining return potential.</em></p>',
  5,
  5,
  'intermediate'
),
(
  'Market Psychology',
  'Understand investor behavior, market sentiment, and emotional trading pitfalls.',
  '<h1>Market Psychology</h1>
  <p>Market psychology studies the emotions and cognitive biases that drive investor behavior. Understanding these psychological factors can help you make better trading decisions and avoid common pitfalls that trap novice investors.</p>
  
  <h2>The Psychology of Market Cycles</h2>
  <p>Markets move through predictable emotional cycles:</p>
  
  <h3>Bull Market Psychology</h3>
  <ol>
    <li><strong>Disbelief:</strong> "Is this recovery real?"</li>
    <li><strong>Hope:</strong> "Maybe things are getting better"</li>
    <li><strong>Optimism:</strong> "This looks promising"</li>
    <li><strong>Belief:</strong> "This is really happening"</li>
    <li><strong>Thrill:</strong> "I''m making money!"</li>
    <li><strong>Euphoria:</strong> "I''m a genius! Nothing can stop this!"</li>
  </ol>
  
  <h3>Bear Market Psychology</h3>
  <ol>
    <li><strong>Complacency:</strong> "This is just a correction"</li>
    <li><strong>Anxiety:</strong> "Maybe I should sell?"</li>
    <li><strong>Denial:</strong> "It''ll come back, I''ll wait"</li>
    <li><strong>Panic:</strong> "Sell everything!"</li>
    <li><strong>Capitulation:</strong> "I give up"</li>
    <li><strong>Despondency:</strong> "I''ll never invest again"</li>
  </ol>
  
  <p><strong>Key Insight:</strong> The best buying opportunities occur during despondency and disbelief. The worst times to buy are during euphoria and thrill.</p>
  
  <h2>Common Cognitive Biases</h2>
  
  <h3>1. Confirmation Bias</h3>
  <p>Seeking information that confirms your existing beliefs while ignoring contradictory evidence.</p>
  <p><strong>Example:</strong> You own Tesla stock, so you only read bullish articles about Tesla and dismiss negative news.</p>
  <p><strong>Solution:</strong> Actively seek opposing viewpoints. Read both bull and bear cases before making decisions.</p>
  
  <h3>2. Anchoring Bias</h3>
  <p>Fixating on a specific price point (often your purchase price) and making decisions based on that arbitrary anchor.</p>
  <p><strong>Example:</strong> You bought a stock at $100. It''s now $80, but you refuse to sell because you''re "waiting to get back to even."</p>
  <p><strong>Solution:</strong> Evaluate each position based on current prospects, not your purchase price. Past decisions are sunk costs.</p>
  
  <h3>3. Loss Aversion</h3>
  <p>The pain of losing money is psychologically more powerful than the pleasure of gaining money (roughly 2x stronger).</p>
  <p><strong>Example:</strong> You hold losing positions too long hoping they''ll recover, while selling winners too quickly to "lock in gains."</p>
  <p><strong>Solution:</strong> Set predetermined stop losses and profit targets. Remove emotion from the decision.</p>
  
  <h3>4. Recency Bias</h3>
  <p>Giving too much weight to recent events while ignoring historical context.</p>
  <p><strong>Example:</strong> After a stock rises for 5 days, you assume it will continue rising, forgetting that it previously fell for months.</p>
  <p><strong>Solution:</strong> Look at longer-term trends. One week of data rarely tells the full story.</p>
  
  <h3>5. Overconfidence Bias</h3>
  <p>Believing you have special insight or skill that gives you an edge, especially after recent wins.</p>
  <p><strong>Example:</strong> After a few successful trades, you start taking larger positions or trading more frequently.</p>
  <p><strong>Solution:</strong> Keep a trading journal. Most traders overestimate their abilities. Stay humble and stick to your strategy.</p>
  
  <h3>6. Herd Mentality</h3>
  <p>Following the crowd and doing what others are doing, assuming they know something you don''t.</p>
  <p><strong>Example:</strong> Buying a popular stock at its peak because "everyone is talking about it."</p>
  <p><strong>Solution:</strong> Be contrarian when appropriate. Warren Buffett: "Be fearful when others are greedy, greedy when others are fearful."</p>
  
  <h2>Fear and Greed Index</h2>
  <p>These two emotions drive market movements:</p>
  
  <h3>Fear Indicators:</h3>
  <ul>
    <li>Market selloffs and panic selling</li>
    <li>High volatility (VIX index)</li>
    <li>Flight to safe assets (bonds, gold)</li>
    <li>Negative news coverage</li>
  </ul>
  
  <h3>Greed Indicators:</h3>
  <ul>
    <li>Market euphoria and buying frenzies</li>
    <li>Low volatility (complacency)</li>
    <li>Risk-on behavior (buying speculative assets)</li>
    <li>Excessive optimism in news</li>
  </ul>
  
  <p><strong>Contrarian Approach:</strong> Consider selling when greed is extreme and buying when fear is extreme.</p>
  
  <h2>The Role of News and Social Media</h2>
  <p>Modern markets are heavily influenced by information flow:</p>
  
  <h3>News Impact</h3>
  <ul>
    <li><strong>Immediate Reaction:</strong> Prices often overreact to news, then correct</li>
    <li><strong>Narrative Building:</strong> Media creates stories that influence sentiment</li>
    <li><strong>FOMO Creation:</strong> Headlines like "You''re missing out!" trigger emotional buying</li>
  </ul>
  
  <h3>Social Media Influence</h3>
  <ul>
    <li><strong>Echo Chambers:</strong> Communities reinforce existing beliefs</li>
    <li><strong>Viral Trends:</strong> Stocks become "memes" driven by social hype</li>
    <li><strong>Information Overload:</strong> Too much noise makes it hard to find signal</li>
  </ul>
  
  <p><strong>Best Practice:</strong> Develop a research process that filters out noise. Focus on fundamentals and your own analysis rather than following hype.</p>
  
  <h2>Emotional Discipline Strategies</h2>
  
  <h3>1. Create a Trading Plan</h3>
  <p>Document your strategy BEFORE entering trades:</p>
  <ul>
    <li>Entry criteria (why are you buying?)</li>
    <li>Position size (how much?)</li>
    <li>Stop loss level (when will you admit you''re wrong?)</li>
    <li>Profit target (when will you take profits?)</li>
    <li>Time horizon (how long will you hold?)</li>
  </ul>
  
  <h3>2. Keep a Trading Journal</h3>
  <p>Record every trade with:</p>
  <ul>
    <li>Entry and exit prices</li>
    <li>Reasoning for the trade</li>
    <li>Emotions you felt</li>
    <li>Outcome and lessons learned</li>
  </ul>
  
  <p>Review monthly to identify patterns in your behavior.</p>
  
  <h3>3. Implement Cooling-Off Periods</h3>
  <p>After major wins or losses, take a break:</p>
  <ul>
    <li>Don''t trade immediately after emotional events</li>
    <li>Step away from screens if feeling anxious</li>
    <li>Wait 24 hours before making impulsive decisions</li>
  </ul>
  
  <h3>4. Automate When Possible</h3>
  <ul>
    <li>Use stop-loss orders to remove emotion from cutting losses</li>
    <li>Set profit targets and stick to them</li>
    <li>Consider dollar-cost averaging to avoid timing decisions</li>
  </ul>
  
  <h2>The Dunning-Kruger Effect in Trading</h2>
  <p>Novice traders often experience:</p>
  <ol>
    <li><strong>Initial Confidence:</strong> "This is easy!"</li>
    <li><strong>Reality Check:</strong> Losses mount, confidence drops</li>
    <li><strong>Learning Phase:</strong> Slow improvement</li>
    <li><strong>Competence:</strong> Consistent returns with humility</li>
  </ol>
  
  <p>Most people quit during phase 2. Success requires pushing through.</p>
  
  <h2>Market Wisdom</h2>
  <p><strong>"The market can remain irrational longer than you can remain solvent."</strong> - John Maynard Keynes</p>
  
  <p>Even when you''re "right" about a stock, timing matters. Markets don''t always behave rationally in the short term.</p>
  
  <p><strong>"In the short run, the market is a voting machine. In the long run, it''s a weighing machine."</strong> - Benjamin Graham</p>
  
  <p>Short-term price movements reflect sentiment (voting). Long-term prices reflect value (weighing).</p>
  
  <h2>Building Mental Resilience</h2>
  <ul>
    <li>Accept that losses are part of trading - even pros have losing trades</li>
    <li>Focus on process, not individual outcomes</li>
    <li>Maintain perspective - one trade doesn''t define you</li>
    <li>Practice mindfulness or meditation to manage stress</li>
    <li>Have interests outside of trading to maintain balance</li>
  </ul>
  
  <p><em>Successful trading is 80% psychology and 20% strategy. Master your emotions, and you''ll be ahead of 90% of retail investors.</em></p>',
  6,
  6,
  'advanced'
),
(
  'Trading Strategies',
  'Explore various trading styles, strategies, and when to apply them.',
  '<h1>Trading Strategies</h1>
  <p>Different trading strategies suit different personalities, time commitments, and risk tolerances. This module covers the most popular approaches and helps you find what works best for you.</p>
  
  <h2>Trading Styles by Time Horizon</h2>
  
  <h3>1. Day Trading (Seconds to Hours)</h3>
  <p><strong>Definition:</strong> Opening and closing positions within the same trading day, never holding overnight.</p>
  
  <p><strong>Requirements:</strong></p>
  <ul>
    <li>Significant time commitment (full days watching markets)</li>
    <li>Quick decision-making ability</li>
    <li>Strong technical analysis skills</li>
    <li>Minimum $25,000 account (US pattern day trader rule)</li>
    <li>Low transaction costs (commissions add up quickly)</li>
  </ul>
  
  <p><strong>Pros:</strong> No overnight risk, potential for daily income, quick feedback</p>
  <p><strong>Cons:</strong> Highly stressful, high failure rate, requires full-time attention</p>
  
  <p><strong>Best For:</strong> Experienced traders with time and capital</p>
  
  <h3>2. Swing Trading (Days to Weeks)</h3>
  <p><strong>Definition:</strong> Holding positions for several days to weeks to capture short-term price movements.</p>
  
  <p><strong>Requirements:</strong></p>
  <ul>
    <li>Moderate time commitment (1-2 hours per day)</li>
    <li>Technical and fundamental analysis skills</li>
    <li>Ability to hold through short-term volatility</li>
    <li>No minimum account size</li>
  </ul>
  
  <p><strong>Pros:</strong> More manageable than day trading, can be done part-time, less stressful</p>
  <p><strong>Cons:</strong> Overnight and weekend risk, requires patience</p>
  
  <p><strong>Best For:</strong> Part-time traders with jobs</p>
  
  <h3>3. Position Trading (Weeks to Months)</h3>
  <p><strong>Definition:</strong> Holding positions for extended periods based on longer-term trends and fundamentals.</p>
  
  <p><strong>Requirements:</strong></p>
  <ul>
    <li>Minimal time commitment (hours per week)</li>
    <li>Strong fundamental analysis</li>
    <li>Patience and discipline</li>
    <li>Ability to ignore short-term noise</li>
  </ul>
  
  <p><strong>Pros:</strong> Minimal time required, lower stress, tax advantages (long-term capital gains)</p>
  <p><strong>Cons:</strong> Capital tied up for extended periods, requires patience</p>
  
  <p><strong>Best For:</strong> Long-term investors with busy schedules</p>
  
  <h2>Popular Trading Strategies</h2>
  
  <h3>1. Trend Following</h3>
  <p><strong>Philosophy:</strong> "The trend is your friend." Buy rising stocks and sell falling ones.</p>
  
  <p><strong>Entry Signals:</strong></p>
  <ul>
    <li>Price crosses above moving average</li>
    <li>New 52-week highs</li>
    <li>Breakout above resistance</li>
    <li>MACD crossover</li>
  </ul>
  
  <p><strong>Exit Signals:</strong></p>
  <ul>
    <li>Price crosses below moving average</li>
    <li>Trend line breaks</li>
    <li>Momentum indicators turn negative</li>
  </ul>
  
  <p><strong>Example:</strong> Buy when a stock breaks above its 50-day moving average with increasing volume. Sell when it closes below the 50-day MA.</p>
  
  <h3>2. Mean Reversion</h3>
  <p><strong>Philosophy:</strong> Prices that deviate significantly from their average tend to return to that average.</p>
  
  <p><strong>Entry Signals:</strong></p>
  <ul>
    <li>RSI below 30 (oversold)</li>
    <li>Price touches lower Bollinger Band</li>
    <li>Sharp selloff on low volume</li>
  </ul>
  
  <p><strong>Exit Signals:</strong></p>
  <ul>
    <li>Price returns to moving average</li>
    <li>RSI reaches 50-70</li>
    <li>Pre-set profit target hit</li>
  </ul>
  
  <p><strong>Example:</strong> Buy when RSI drops below 30 on a fundamentally sound stock. Sell when RSI returns to 60.</p>
  
  <h3>3. Breakout Trading</h3>
  <p><strong>Philosophy:</strong> When a stock breaks through key resistance levels, it often continues moving in that direction.</p>
  
  <p><strong>Key Concepts:</strong></p>
  <ul>
    <li><strong>Consolidation:</strong> Period of sideways trading before breakout</li>
    <li><strong>Volume Confirmation:</strong> Breakouts on high volume are more reliable</li>
    <li><strong>False Breakouts:</strong> Some breakouts fail quickly (head fakes)</li>
  </ul>
  
  <p><strong>Entry:</strong> Buy when price breaks above resistance with 2x average volume</p>
  <p><strong>Stop Loss:</strong> Just below the breakout level</p>
  <p><strong>Target:</strong> Height of consolidation pattern projected upward</p>
  
  <h3>4. Momentum Trading</h3>
  <p><strong>Philosophy:</strong> Stocks in motion tend to stay in motion. Buy strong stocks that are getting stronger.</p>
  
  <p><strong>Identification:</strong></p>
  <ul>
    <li>Relative Strength (outperforming the market)</li>
    <li>Positive earnings surprises</li>
    <li>Increasing volume</li>
    <li>New product launches or positive catalysts</li>
  </ul>
  
  <p><strong>Risk:</strong> Momentum can reverse quickly. Always use stop losses.</p>
  
  <h3>5. Value Investing</h3>
  <p><strong>Philosophy:</strong> Buy undervalued companies trading below their intrinsic value.</p>
  
  <p><strong>Criteria:</strong></p>
  <ul>
    <li>Low P/E ratio compared to industry</li>
    <li>High dividend yield</li>
    <li>Strong balance sheet (low debt)</li>
    <li>Temporarily out of favor but fundamentally sound</li>
  </ul>
  
  <p><strong>Example:</strong> Buy a profitable company trading at P/E of 10 when the industry average is 20, with strong fundamentals.</p>
  
  <h3>6. Growth Investing</h3>
  <p><strong>Philosophy:</strong> Buy companies with above-average growth potential, even if they appear expensive.</p>
  
  <p><strong>Criteria:</strong></p>
  <ul>
    <li>Revenue growth >20% annually</li>
    <li>Expanding market share</li>
    <li>Innovative products or services</li>
    <li>Strong competitive advantages</li>
  </ul>
  
  <p><strong>Risk:</strong> Growth stocks often have high valuations and can fall sharply if growth disappoints.</p>
  
  <h3>7. Dividend Investing</h3>
  <p><strong>Philosophy:</strong> Build a portfolio of stocks that pay regular dividends for passive income.</p>
  
  <p><strong>Criteria:</strong></p>
  <ul>
    <li>Consistent dividend payments (10+ years)</li>
    <li>Dividend yield >3%</li>
    <li>Payout ratio <60% (sustainable)</li>
    <li>History of dividend increases</li>
  </ul>
  
  <p><strong>Benefits:</strong> Income during bear markets, lower volatility, compound growth through reinvestment</p>
  
  <h2>Combining Strategies</h2>
  <p>Most successful traders combine multiple approaches:</p>
  
  <p><strong>Example Hybrid Strategy:</strong></p>
  <ul>
    <li>70% position trading based on fundamentals</li>
    <li>20% swing trading based on technical setups</li>
    <li>10% momentum trades on strong catalysts</li>
  </ul>
  
  <h2>Strategy Development Framework</h2>
  
  <h3>Step 1: Define Your Edge</h3>
  <p>What gives you an advantage? Is it:</p>
  <ul>
    <li>Better research?</li>
    <li>Faster reaction to news?</li>
    <li>Superior pattern recognition?</li>
    <li>Longer time horizon (patience)?</li>
  </ul>
  
  <h3>Step 2: Set Clear Rules</h3>
  <ul>
    <li>Entry conditions (when to buy)</li>
    <li>Position sizing (how much to buy)</li>
    <li>Stop loss placement (when to cut losses)</li>
    <li>Profit targets (when to take profits)</li>
    <li>Maximum positions (how many stocks to hold)</li>
  </ul>
  
  <h3>Step 3: Backtest</h3>
  <p>Test your strategy on historical data:</p>
  <ul>
    <li>Would it have been profitable?</li>
    <li>What was the maximum drawdown?</li>
    <li>What''s the win rate?</li>
    <li>What''s the average risk-reward?</li>
  </ul>
  
  <h3>Step 4: Paper Trade</h3>
  <p>Test your strategy with simulated money before risking real capital. Track results for at least 20-30 trades.</p>
  
  <h3>Step 5: Start Small</h3>
  <p>When going live, start with small position sizes. Gradually increase as you prove consistency.</p>
  
  <h3>Step 6: Review and Refine</h3>
  <p>Analyze your results monthly:</p>
  <ul>
    <li>What''s working?</li>
    <li>What''s not working?</li>
    <li>Are you following your rules?</li>
    <li>What can be improved?</li>
  </ul>
  
  <h2>Common Strategy Mistakes</h2>
  
  <h3>1. Strategy Hopping</h3>
  <p>Switching strategies after a few losses. Give your strategy time to work (100+ trades minimum).</p>
  
  <h3>2. Overcomplicating</h3>
  <p>Using too many indicators. Simple strategies often work best.</p>
  
  <h3>3. Ignoring Risk Management</h3>
  <p>Even the best strategy fails without proper position sizing and stop losses.</p>
  
  <h3>4. Not Adapting to Market Conditions</h3>
  <p>Some strategies work in trending markets, others in ranging markets. Recognize when to adjust.</p>
  
  <h2>Final Thoughts</h2>
  <p>There''s no "best" strategy - only the strategy that best fits YOUR:</p>
  <ul>
    <li>Personality and temperament</li>
    <li>Available time</li>
    <li>Risk tolerance</li>
    <li>Capital size</li>
    <li>Goals and time horizon</li>
  </ul>
  
  <p><em>Focus on mastering ONE strategy before moving to others. Consistency and discipline matter more than the specific strategy you choose.</em></p>',
  7,
  7,
  'advanced'
),
(
  'Options Trading',
  'Explore options strategies, Greeks, and derivatives trading.',
  '<h1>Options Trading</h1>
  <p>Options are derivative contracts that give you the right (but not the obligation) to buy or sell an underlying asset at a specified price before a certain date. They offer leverage, flexibility, and sophisticated strategies unavailable with stock trading alone.</p>
  
  <p><strong>⚠️ WARNING:</strong> Options are complex instruments with high risk. This is an introductory overview. Never trade options without fully understanding the risks and strategies involved.</p>
  
  <h2>Option Basics</h2>
  
  <h3>What is an Option?</h3>
  <p>An option contract represents 100 shares of the underlying stock and includes:</p>
  <ul>
    <li><strong>Strike Price:</strong> The price at which you can buy/sell the stock</li>
    <li><strong>Expiration Date:</strong> When the option expires (worthless if not exercised)</li>
    <li><strong>Premium:</strong> The price you pay for the option</li>
  </ul>
  
  <h3>Call Options</h3>
  <p><strong>Definition:</strong> The right to BUY shares at the strike price.</p>
  <p><strong>When to buy:</strong> You''re bullish and expect the price to rise.</p>
  <p><strong>Example:</strong> AAPL is at $150. You buy a $155 call expiring in 30 days for $3 premium.</p>
  <ul>
    <li>If AAPL rises to $165: Your option is worth $10 ($165 - $155), profit = $7 per share ($700 total)</li>
    <li>If AAPL stays at $150: Your option expires worthless, loss = $3 per share ($300 total)</li>
  </ul>
  
  <h3>Put Options</h3>
  <p><strong>Definition:</strong> The right to SELL shares at the strike price.</p>
  <p><strong>When to buy:</strong> You''re bearish and expect the price to fall.</p>
  <p><strong>Example:</strong> AAPL is at $150. You buy a $145 put expiring in 30 days for $2 premium.</p>
  <ul>
    <li>If AAPL falls to $135: Your option is worth $10 ($145 - $135), profit = $8 per share ($800 total)</li>
    <li>If AAPL rises to $160: Your option expires worthless, loss = $2 per share ($200 total)</li>
  </ul>
  
  <h2>Buying vs Selling Options</h2>
  
  <h3>Buying Options (Long Position)</h3>
  <p><strong>Pros:</strong></p>
  <ul>
    <li>Defined risk (can''t lose more than premium paid)</li>
    <li>High leverage (control 100 shares for a fraction of the cost)</li>
    <li>Unlimited profit potential (for calls)</li>
  </ul>
  
  <p><strong>Cons:</strong></p>
  <ul>
    <li>Time decay works against you</li>
    <li>Must be right about direction AND timing</li>
    <li>Can lose 100% of investment</li>
  </ul>
  
  <h3>Selling Options (Short Position)</h3>
  <p><strong>Pros:</strong></p>
  <ul>
    <li>Time decay works in your favor</li>
    <li>High probability of profit (most options expire worthless)</li>
    <li>Collect premium upfront</li>
  </ul>
  
  <p><strong>Cons:</strong></p>
  <ul>
    <li>Limited profit (premium collected)</li>
    <li>Unlimited risk (especially naked calls)</li>
    <li>Requires margin and higher account minimums</li>
  </ul>
  
  <h2>The Greeks</h2>
  <p>The Greeks measure how option prices change with various factors:</p>
  
  <h3>Delta (Δ)</h3>
  <p><strong>Measures:</strong> How much the option price changes per $1 move in the stock.</p>
  <ul>
    <li>Call deltas: 0 to 1.00 (or 0 to 100)</li>
    <li>Put deltas: 0 to -1.00 (or 0 to -100)</li>
  </ul>
  <p><strong>Example:</strong> A call with 0.50 delta means if the stock rises $1, the option price rises ~$0.50.</p>
  
  <h3>Gamma (Γ)</h3>
  <p><strong>Measures:</strong> How fast delta changes as the stock price moves.</p>
  <p>High gamma means delta changes quickly. At-the-money options have highest gamma.</p>
  
  <h3>Theta (Θ)</h3>
  <p><strong>Measures:</strong> Time decay - how much value the option loses each day.</p>
  <p><strong>Example:</strong> Theta of -0.05 means the option loses $5 in value per day (all else equal).</p>
  <p>Theta accelerates as expiration approaches.</p>
  
  <h3>Vega (V)</h3>
  <p><strong>Measures:</strong> Sensitivity to changes in implied volatility.</p>
  <p><strong>Example:</strong> Vega of 0.20 means if implied volatility increases 1%, the option gains $20 in value.</p>
  
  <h3>Rho (Ρ)</h3>
  <p><strong>Measures:</strong> Sensitivity to interest rate changes.</p>
  <p>Least important Greek for most retail traders.</p>
  
  <h2>Common Option Strategies</h2>
  
  <h3>1. Covered Call</h3>
  <p><strong>Strategy:</strong> Own 100 shares of stock + Sell 1 call option</p>
  <p><strong>Goal:</strong> Generate income from stocks you already own</p>
  <p><strong>Risk:</strong> Stock could be called away if it rises above strike</p>
  <p><strong>Best When:</strong> Stock is neutral to slightly bullish</p>
  
  <h3>2. Cash-Secured Put</h3>
  <p><strong>Strategy:</strong> Sell a put option while holding enough cash to buy the shares</p>
  <p><strong>Goal:</strong> Generate income or acquire stock at a lower price</p>
  <p><strong>Risk:</strong> Forced to buy stock if it falls below strike</p>
  <p><strong>Best When:</strong> You want to own the stock at a lower price</p>
  
  <h3>3. Protective Put</h3>
  <p><strong>Strategy:</strong> Own stock + Buy put option</p>
  <p><strong>Goal:</strong> Insurance against downside risk</p>
  <p><strong>Cost:</strong> Premium paid for the put (like insurance premium)</p>
  <p><strong>Best When:</strong> Worried about short-term downside but want to keep stock</p>
  
  <h3>4. Long Straddle</h3>
  <p><strong>Strategy:</strong> Buy call + Buy put at same strike</p>
  <p><strong>Goal:</strong> Profit from large move in either direction</p>
  <p><strong>Best When:</strong> Expecting big move but unsure of direction (earnings, FDA approval, etc.)</p>
  
  <h3>5. Iron Condor</h3>
  <p><strong>Strategy:</strong> Sell call spread + Sell put spread</p>
  <p><strong>Goal:</strong> Profit from low volatility (stock staying in a range)</p>
  <p><strong>Best When:</strong> Stock is range-bound</p>
  
  <h3>6. Vertical Spread</h3>
  <p><strong>Bull Call Spread:</strong> Buy lower strike call + Sell higher strike call</p>
  <p><strong>Bear Put Spread:</strong> Buy higher strike put + Sell lower strike put</p>
  <p><strong>Goal:</strong> Reduce cost of directional bet by selling an option</p>
  
  <h2>Option Pricing Factors</h2>
  
  <h3>Intrinsic Value</h3>
  <p>The amount the option is "in the money":</p>
  <ul>
    <li>Call: Stock Price - Strike Price (if positive)</li>
    <li>Put: Strike Price - Stock Price (if positive)</li>
  </ul>
  
  <h3>Extrinsic Value (Time Value)</h3>
  <p>The premium above intrinsic value, based on:</p>
  <ul>
    <li>Time until expiration</li>
    <li>Implied volatility</li>
    <li>Interest rates</li>
  </ul>
  
  <h3>Implied Volatility (IV)</h3>
  <p>The market''s expectation of future volatility. High IV = expensive options, Low IV = cheap options.</p>
  
  <p><strong>Strategy Tips:</strong></p>
  <ul>
    <li>Buy options when IV is low</li>
    <li>Sell options when IV is high</li>
    <li>IV often spikes before earnings</li>
  </ul>
  
  <h2>Risks and Considerations</h2>
  
  <h3>Options Can Expire Worthless</h3>
  <p>~70% of options expire out-of-the-money, meaning total loss for buyers.</p>
  
  <h3>Leverage Cuts Both Ways</h3>
  <p>Options can magnify both gains and losses. A small adverse move can wipe out your investment.</p>
  
  <h3>Complexity</h3>
  <p>You must be right about:</p>
  <ul>
    <li>Direction (up or down)</li>
    <li>Magnitude (how much)</li>
    <li>Timing (when)</li>
    <li>Volatility (how much the stock will move)</li>
  </ul>
  
  <h3>Assignment Risk</h3>
  <p>If you sell options, you can be assigned (forced to fulfill the contract) at any time before expiration.</p>
  
  <h2>Getting Started with Options</h2>
  
  <h3>Step 1: Education</h3>
  <p>Study options thoroughly. Read books, take courses, paper trade extensively.</p>
  
  <h3>Step 2: Account Approval</h3>
  <p>Apply for options trading approval with your broker. Different levels allow different strategies.</p>
  
  <h3>Step 3: Start Simple</h3>
  <p>Begin with covered calls and cash-secured puts. Avoid complex strategies until you''re comfortable.</p>
  
  <h3>Step 4: Paper Trade</h3>
  <p>Simulate options trades for at least 3-6 months before risking real money.</p>
  
  <h3>Step 5: Start Small</h3>
  <p>When going live, use small position sizes (1-2% of portfolio per trade).</p>
  
  <h2>Common Beginner Mistakes</h2>
  <ol>
    <li><strong>Buying far out-of-the-money options:</strong> Low probability of profit</li>
    <li><strong>Holding until expiration:</strong> Time decay accelerates near expiration</li>
    <li><strong>Ignoring implied volatility:</strong> Buying expensive options that deflate</li>
    <li><strong>Overleveraging:</strong> Controlling too many shares relative to portfolio size</li>
    <li><strong>No exit plan:</strong> Not knowing when to take profits or cut losses</li>
  </ol>
  
  <h2>When to Use Options</h2>
  <ul>
    <li><strong>Hedging:</strong> Protect stock positions during uncertain times</li>
    <li><strong>Income Generation:</strong> Covered calls on stocks you own</li>
    <li><strong>Speculation:</strong> Leverage for directional bets (high risk)</li>
    <li><strong>Defined Risk:</strong> When you want to risk a fixed amount for larger potential gains</li>
  </ul>
  
  <h2>Resources for Learning</h2>
  <ul>
    <li>CBOE Options Institute (free education)</li>
    <li>Options Industry Council (OIC)</li>
    <li>Paper trading platforms</li>
    <li>Options pricing calculators</li>
  </ul>
  
  <p><em>Options trading is not suitable for everyone. Only trade options if you fully understand the risks and have thoroughly educated yourself. When in doubt, stick to stocks.</em></p>',
  8,
  8,
  'advanced'
),
(
  'Algorithmic Trading',
  'Learn to build and deploy automated trading systems and algorithms.',
  '<h1>Algorithmic Trading</h1>
  <p>Algorithmic trading (algo trading) uses computer programs to execute trades based on predefined rules and strategies. These systems can analyze data, identify opportunities, and execute trades faster and more consistently than human traders.</p>
  
  <p><strong>Note:</strong> This module provides a conceptual overview. Actual implementation requires programming knowledge (Python, JavaScript, etc.) and access to trading APIs.</p>
  
  <h2>What is Algorithmic Trading?</h2>
  
  <h3>Definition</h3>
  <p>Algorithmic trading involves using computer programs to automatically execute trades based on specific criteria like timing, price, quantity, or mathematical models.</p>
  
  <h3>Types of Algorithmic Trading</h3>
  <ul>
    <li><strong>High-Frequency Trading (HFT):</strong> Thousands of trades per second, requires ultra-low latency</li>
    <li><strong>Statistical Arbitrage:</strong> Exploiting price inefficiencies between related securities</li>
    <li><strong>Market Making:</strong> Providing liquidity by continuously quoting bid/ask prices</li>
    <li><strong>Trend Following:</strong> Automated systems that follow momentum and trends</li>
    <li><strong>Mean Reversion:</strong> Algorithms that bet on prices returning to average</li>
  </ul>
  
  <h2>Benefits of Algorithmic Trading</h2>
  
  <h3>1. Speed and Efficiency</h3>
  <p>Algorithms can analyze data and execute trades in milliseconds, capturing opportunities before human traders can react.</p>
  
  <h3>2. Emotion-Free Trading</h3>
  <p>Algorithms follow rules without fear, greed, or hesitation. No emotional decision-making.</p>
  
  <h3>3. Backtesting</h3>
  <p>Test strategies on historical data to validate effectiveness before risking real capital.</p>
  
  <h3>4. Consistency</h3>
  <p>Algorithms execute the same strategy repeatedly without deviation or fatigue.</p>
  
  <h3>5. 24/7 Monitoring</h3>
  <p>Algorithms can watch markets continuously, never sleeping or taking breaks.</p>
  
  <h3>6. Handling Complex Strategies</h3>
  <p>Can manage multiple positions, instruments, and timeframes simultaneously.</p>
  
  <h2>Key Components of a Trading Algorithm</h2>
  
  <h3>1. Data Input</h3>
  <ul>
    <li>Market data (price, volume, bid-ask spreads)</li>
    <li>Fundamental data (earnings, news, economic indicators)</li>
    <li>Alternative data (sentiment, web traffic, satellite imagery)</li>
  </ul>
  
  <h3>2. Signal Generation</h3>
  <p>Rules that identify trading opportunities:</p>
  <ul>
    <li>Technical indicators (moving average crossovers, RSI levels)</li>
    <li>Pattern recognition (chart patterns, price action)</li>
    <li>Statistical models (regression, machine learning)</li>
  </ul>
  
  <h3>3. Risk Management</h3>
  <ul>
    <li>Position sizing algorithms</li>
    <li>Stop-loss placement</li>
    <li>Portfolio exposure limits</li>
    <li>Correlation monitoring</li>
  </ul>
  
  <h3>4. Order Execution</h3>
  <ul>
    <li>Order types (market, limit, stop)</li>
    <li>Execution algorithms (VWAP, TWAP, iceberg orders)</li>
    <li>Smart order routing</li>
  </ul>
  
  <h3>5. Performance Monitoring</h3>
  <ul>
    <li>Real-time P&L tracking</li>
    <li>Performance metrics (Sharpe ratio, max drawdown)</li>
    <li>System health checks</li>
    <li>Alert systems for anomalies</li>
  </ul>
  
  <h2>Popular Algorithmic Strategies</h2>
  
  <h3>1. Moving Average Crossover</h3>
  <p><strong>Logic:</strong> Buy when fast MA crosses above slow MA, sell when it crosses below.</p>
  <p><strong>Example:</strong> Buy when 50-day SMA crosses above 200-day SMA (Golden Cross).</p>
  
  <pre><code>if (SMA_50 > SMA_200 && previousSMA_50 <= previousSMA_200) {
    buy(symbol, quantity);
} else if (SMA_50 < SMA_200 && previousSMA_50 >= previousSMA_200) {
    sell(symbol, quantity);
}</code></pre>
  
  <h3>2. RSI Mean Reversion</h3>
  <p><strong>Logic:</strong> Buy oversold conditions, sell overbought conditions.</p>
  
  <pre><code>if (RSI < 30) {
    buy(symbol, quantity);
} else if (RSI > 70) {
    sell(symbol, quantity);
}</code></pre>
  
  <h3>3. Breakout Strategy</h3>
  <p><strong>Logic:</strong> Buy when price breaks above resistance with high volume.</p>
  
  <pre><code>if (currentPrice > resistance && volume > avgVolume * 2) {
    buy(symbol, quantity);
    setStopLoss(resistance);
}</code></pre>
  
  <h3>4. Pairs Trading</h3>
  <p><strong>Logic:</strong> Trade two correlated stocks when their price relationship diverges.</p>
  <p><strong>Example:</strong> If Coca-Cola rises 5% but Pepsi only rises 1%, short Coca-Cola and buy Pepsi, expecting convergence.</p>
  
  <h3>5. News-Based Trading</h3>
  <p><strong>Logic:</strong> Parse news headlines and execute trades based on sentiment analysis.</p>
  <p>Requires natural language processing (NLP) and machine learning.</p>
  
  <h2>Building Your First Algorithm</h2>
  
  <h3>Step 1: Define Your Strategy</h3>
  <p>Write down your trading rules in plain English:</p>
  <ul>
    <li>Entry conditions</li>
    <li>Exit conditions</li>
    <li>Position sizing rules</li>
    <li>Risk management rules</li>
  </ul>
  
  <h3>Step 2: Choose Your Tools</h3>
  <p><strong>Programming Languages:</strong></p>
  <ul>
    <li><strong>Python:</strong> Most popular, extensive libraries (pandas, NumPy, TA-Lib)</li>
    <li><strong>JavaScript:</strong> Good for web-based trading platforms</li>
    <li><strong>R:</strong> Strong statistical capabilities</li>
    <li><strong>C++:</strong> Maximum speed for HFT (advanced)</li>
  </ul>
  
  <p><strong>Trading Platforms:</strong></p>
  <ul>
    <li>Alpaca (commission-free API)</li>
    <li>Interactive Brokers (robust API)</li>
    <li>TD Ameritrade (ThinkorSwim API)</li>
    <li>MetaTrader (for forex)</li>
  </ul>
  
  <p><strong>Backtesting Frameworks:</strong></p>
  <ul>
    <li>Backtrader (Python)</li>
    <li>Zipline (Python, by Quantopian)</li>
    <li>QuantConnect (cloud-based)</li>
  </ul>
  
  <h3>Step 3: Acquire Data</h3>
  <p>You need historical data for backtesting:</p>
  <ul>
    <li>Yahoo Finance (free, limited)</li>
    <li>Alpha Vantage (free API)</li>
    <li>Polygon.io (paid, comprehensive)</li>
    <li>Quandl (financial and alternative data)</li>
  </ul>
  
  <h3>Step 4: Code Your Strategy</h3>
  <p><strong>Example in Python (simplified):</strong></p>
  
  <pre><code>import pandas as pd
import yfinance as yf

# Download data
data = yf.download("AAPL", start="2020-01-01", end="2023-01-01")

# Calculate indicators
data[''SMA_50''] = data[''Close''].rolling(50).mean()
data[''SMA_200''] = data[''Close''].rolling(200).mean()

# Generate signals
data[''Signal''] = 0
data.loc[data[''SMA_50''] > data[''SMA_200''], ''Signal''] = 1  # Buy
data.loc[data[''SMA_50''] < data[''SMA_200''], ''Signal''] = -1 # Sell

# Calculate returns
data[''Returns''] = data[''Close''].pct_change()
data[''Strategy_Returns''] = data[''Signal''].shift(1) * data[''Returns'']

# Performance
total_return = (1 + data[''Strategy_Returns'']).prod() - 1
print(f"Total Return: {total_return:.2%}")</code></pre>
  
  <h3>Step 5: Backtest</h3>
  <p>Test your strategy on historical data:</p>
  <ul>
    <li>Run strategy on past 5-10 years of data</li>
    <li>Calculate performance metrics</li>
    <li>Look for consistent profits</li>
    <li>Identify weaknesses</li>
  </ul>
  
  <p><strong>Key Metrics:</strong></p>
  <ul>
    <li><strong>Total Return:</strong> Overall profit/loss</li>
    <li><strong>Sharpe Ratio:</strong> Risk-adjusted returns (>1 is good)</li>
    <li><strong>Maximum Drawdown:</strong> Largest peak-to-trough decline</li>
    <li><strong>Win Rate:</strong> Percentage of profitable trades</li>
    <li><strong>Profit Factor:</strong> Gross profits / gross losses</li>
  </ul>
  
  <h3>Step 6: Paper Trade</h3>
  <p>Run your algorithm live with simulated money:</p>
  <ul>
    <li>Test in real market conditions</li>
    <li>Identify execution issues</li>
    <li>Verify results match backtests</li>
    <li>Paper trade for at least 1-3 months</li>
  </ul>
  
  <h3>Step 7: Go Live (Carefully)</h3>
  <ul>
    <li>Start with small capital</li>
    <li>Monitor closely</li>
    <li>Have kill switches to stop the algorithm</li>
    <li>Scale up gradually as confidence grows</li>
  </ul>
  
  <h2>Common Pitfalls</h2>
  
  <h3>1. Overfitting</h3>
  <p>Creating a strategy that works perfectly on historical data but fails in live trading because it''s too specific to past conditions.</p>
  <p><strong>Solution:</strong> Test on out-of-sample data, keep strategies simple, use robust validation.</p>
  
  <h3>2. Look-Ahead Bias</h3>
  <p>Using future information in backtests that wouldn''t be available in real-time.</p>
  <p><strong>Example:</strong> Using today''s closing price to make a decision at market open.</p>
  
  <h3>3. Ignoring Transaction Costs</h3>
  <p>Backtests that don''t account for commissions, slippage, and spreads overestimate returns.</p>
  <p><strong>Solution:</strong> Always include realistic transaction costs in backtests.</p>
  
  <h3>4. Survivorship Bias</h3>
  <p>Testing only on stocks that still exist, ignoring delisted/bankrupt companies.</p>
  <p><strong>Solution:</strong> Use data sources that include delisted stocks.</p>
  
  <h3>5. Insufficient Risk Management</h3>
  <p>Algorithms without proper stop losses can experience catastrophic losses.</p>
  <p><strong>Solution:</strong> Always code robust risk management into your algorithms.</p>
  
  <h3>6. Technical Failures</h3>
  <p>Bugs, internet outages, API failures can cause unexpected behavior.</p>
  <p><strong>Solution:</strong> Thorough testing, redundancy, monitoring, circuit breakers.</p>
  
  <h2>Machine Learning in Trading</h2>
  
  <h3>Applications</h3>
  <ul>
    <li><strong>Price Prediction:</strong> Using regression models to forecast prices</li>
    <li><strong>Classification:</strong> Predicting whether a stock will rise or fall</li>
    <li><strong>Sentiment Analysis:</strong> Analyzing news and social media</li>
    <li><strong>Pattern Recognition:</strong> Identifying chart patterns automatically</li>
    <li><strong>Portfolio Optimization:</strong> Allocating capital optimally</li>
  </ul>
  
  <h3>Popular ML Algorithms</h3>
  <ul>
    <li><strong>Random Forests:</strong> Ensemble learning for classification/regression</li>
    <li><strong>Neural Networks:</strong> Deep learning for complex patterns</li>
    <li><strong>Support Vector Machines:</strong> Classification with high accuracy</li>
    <li><strong>Reinforcement Learning:</strong> Learning optimal strategies through trial and error</li>
  </ul>
  
  <h3>Challenges</h3>
  <ul>
    <li>Markets are non-stationary (patterns change)</li>
    <li>Overfitting is extremely common</li>
    <li>Requires large amounts of quality data</li>
    <li>Results are often no better than simple strategies</li>
  </ul>
  
  <h2>Regulatory Considerations</h2>
  <ul>
    <li><strong>Pattern Day Trader (PDT) Rule:</strong> Must maintain $25K if making 4+ day trades per week</li>
    <li><strong>Market Manipulation:</strong> Algorithms must not engage in spoofing or layering</li>
    <li><strong>Risk Controls:</strong> Many brokers require pre-trade risk checks</li>
    <li><strong>Reporting:</strong> Some jurisdictions require reporting of algorithmic trading activity</li>
  </ul>
  
  <h2>Career Path: Quantitative Trading</h2>
  <p>If you''re interested in algorithmic trading professionally:</p>
  <ul>
    <li><strong>Education:</strong> Math, statistics, computer science, or finance degree</li>
    <li><strong>Skills:</strong> Programming (Python/C++), statistics, machine learning</li>
    <li><strong>Roles:</strong> Quantitative analyst, algo developer, data scientist</li>
    <li><strong>Employers:</strong> Hedge funds, prop trading firms, investment banks</li>
  </ul>
  
  <h2>Resources for Learning</h2>
  <ul>
    <li><strong>Books:</strong> "Algorithmic Trading" by Ernest Chan</li>
    <li><strong>Courses:</strong> Coursera, Udemy algo trading courses</li>
    <li><strong>Communities:</strong> QuantConnect forums, r/algotrading</li>
    <li><strong>Platforms:</strong> QuantConnect, Quantopian (archived resources)</li>
  </ul>
  
  <h2>Final Thoughts</h2>
  <p>Algorithmic trading is powerful but not a "get rich quick" scheme. Most retail algo traders fail because they:</p>
  <ul>
    <li>Underestimate complexity</li>
    <li>Overfit strategies</li>
    <li>Ignore risk management</li>
    <li>Lack sufficient capital</li>
  </ul>
  
  <p>Success requires:</p>
  <ul>
    <li>Strong programming skills</li>
    <li>Deep understanding of markets</li>
    <li>Rigorous testing methodology</li>
    <li>Realistic expectations</li>
    <li>Continuous learning and adaptation</li>
  </ul>
  
  <p><em>Start simple, test thoroughly, and never risk money you can''t afford to lose. Algorithmic trading is a marathon, not a sprint.</em></p>',
  9,
  9,
  'advanced'
);

-- =====================================================
-- INITIAL SETUP COMPLETE
-- =====================================================

-- Create a function to initialize new users with starting balance
CREATE OR REPLACE FUNCTION initialize_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (user_id, username, email, cash_balance)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email,
    10000
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;