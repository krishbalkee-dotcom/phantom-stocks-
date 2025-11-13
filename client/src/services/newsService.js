/**
 * News Service
 * Client-side service for fetching market news from Polygon API
 */

const API_BASE = 'https://phantom-stocks.onrender.com/api';

/**
 * Get general market news
 * @param {number} limit - Number of articles to fetch (default: 10)
 * @returns {Promise<Array>} Array of news articles
 */
export async function getMarketNews(limit = 10) {
  try {
    const response = await fetch(`${API_BASE}/news?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch news');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[NewsService] getMarketNews error:', error);
    return [];
  }
}

/**
 * Get news for a specific stock symbol
 * @param {string} symbol - Stock symbol
 * @param {number} limit - Number of articles to fetch (default: 10)
 * @returns {Promise<Array>} Array of news articles
 */
export async function getStockNews(symbol, limit = 10) {
  try {
    const response = await fetch(`${API_BASE}/news/${symbol.toUpperCase()}?limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch stock news');
    }
    
    return await response.json();
    
  } catch (error) {
    console.error('[NewsService] getStockNews error:', error);
    return [];
  }
}

/**
 * Format news article for display
 */
export function formatNewsArticle(article) {
  return {
    id: article.id,
    title: article.title,
    author: article.author || 'Unknown',
    publishedAt: formatPublishDate(article.publishedAt),
    url: article.url,
    imageUrl: article.imageUrl || '/assets/placeholder-news.jpg',
    description: truncateDescription(article.description, 150),
    source: article.source || 'Unknown',
    tickers: article.tickers || []
  };
}

/**
 * Format publish date to relative time
 */
function formatPublishDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  }
}

/**
 * Truncate description to specified length
 */
function truncateDescription(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Open news article in new tab
 */
export function openNewsArticle(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Filter news by ticker symbols
 */
export function filterNewsByTickers(articles, tickers) {
  if (!tickers || tickers.length === 0) {
    return articles;
  }
  
  const tickerSet = new Set(tickers.map(t => t.toUpperCase()));
  
  return articles.filter(article => {
    if (!article.tickers || article.tickers.length === 0) {
      return false;
    }
    return article.tickers.some(ticker => tickerSet.has(ticker.toUpperCase()));
  });
}