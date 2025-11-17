/**
 * Kline.js - Chart Wrapper
 * Integrates with your existing instant-loading simplified chart system
 * This is a simplified interface - you should integrate your actual kline.js file here
 */

import { createChart } from 'https://unpkg.com/lightweight-charts@4.1.0/dist/lightweight-charts.standalone.production.mjs';

let chart = null;
let candlestickSeries = null;
let volumeSeries = null;
let currentData = null;
let activeIndicators = {
  volume: false,
  sma: false,
  ema: false,
  bollinger: false,
  rsi: false,
  macd: false
};

/**
 * Initialize chart
 */
export function initChart(containerId) {
  const container = document.getElementById(containerId);
  
  if (!container) {
    console.error('[Kline] Container not found:', containerId);
    return;
  }
  
  // Create chart
  chart = createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: '#0a0a0a' },
      textColor: '#d1d5db',
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
    },
    crosshair: {
      mode: 1,
    },
    rightPriceScale: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    timeScale: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
      timeVisible: true,
      secondsVisible: false,
    },
  });
  
  // Create candlestick series
  candlestickSeries = chart.addCandlestickSeries({
    upColor: '#10b981',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444',
  });
  
  // Handle resize
  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) {
      return;
    }
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width, height: newRect.height });
  });
  
  resizeObserver.observe(container);
  
  console.log('[Kline] Chart initialized');
}

/**
 * Load chart data for a symbol and timeframe
 * This integrates with your backend's instant 1000-bar loading
 */
export async function loadChartData(symbol, timeframe) {
  try {
    console.log(`[Kline] Loading ${symbol} ${timeframe}...`);
    
    // Fetch from your backend API - FIXED to use correct route
    const response = await fetch(`https://phantom-stocks.onrender.com/api/market-data/chart?symbol=${symbol}&timeframe=${timeframe}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch chart data');
    }
    
    const data = await response.json();
    
    // Store data
    currentData = data;
    
    // Format for Lightweight Charts - FIXED to match your backend response structure
    const candleData = data.bars.map(bar => ({
      time: bar.time, // Already in seconds from backend
      open: parseFloat(bar.open),
      high: parseFloat(bar.high),
      low: parseFloat(bar.low),
      close: parseFloat(bar.close)
    }));
    
    // Set candlestick data
    candlestickSeries.setData(candleData);
    
    // If volume is active, show it
    if (activeIndicators.volume && data.indicators?.volume) {
      showVolume(data.indicators.volume);
    }
    
    // If other indicators are active, show them
    if (activeIndicators.sma && data.indicators?.sma) {
      showSMA(data.indicators.sma);
    }
    
    if (activeIndicators.ema && data.indicators?.ema) {
      showEMA(data.indicators.ema);
    }
    
    // ... other indicators
    
    // Fit content
    chart.timeScale().fitContent();
    
    console.log(`[Kline] Loaded ${candleData.length} bars`);
    
  } catch (error) {
    console.error('[Kline] Error loading chart data:', error);
    throw error;
  }
}

/**
 * Toggle indicator on/off
 */
export function toggleIndicator(indicator, isActive) {
  activeIndicators[indicator] = isActive;
  
  console.log(`[Kline] ${indicator} ${isActive ? 'ON' : 'OFF'}`);
  
  if (!currentData || !currentData.indicators) {
    return;
  }
  
  switch (indicator) {
    case 'volume':
      if (isActive) {
        showVolume(currentData.indicators.volume);
      } else {
        hideVolume();
      }
      break;
    
    case 'sma':
      if (isActive) {
        showSMA(currentData.indicators.sma);
      } else {
        hideSMA();
      }
      break;
    
    case 'ema':
      if (isActive) {
        showEMA(currentData.indicators.ema);
      } else {
        hideEMA();
      }
      break;
    
    case 'bollinger':
      if (isActive) {
        showBollinger(currentData.indicators.bollinger);
      } else {
        hideBollinger();
      }
      break;
    
    case 'rsi':
      if (isActive) {
        showRSI(currentData.indicators.rsi);
      } else {
        hideRSI();
      }
      break;
    
    case 'macd':
      if (isActive) {
        showMACD(currentData.indicators.macd);
      } else {
        hideMACD();
      }
      break;
  }
}

// Indicator series storage
let indicatorSeries = {
  volume: null,
  sma20: null,
  sma50: null,
  ema12: null,
  ema26: null,
  bollingerUpper: null,
  bollingerMiddle: null,
  bollingerLower: null,
  rsi: null,
  macdLine: null,
  macdSignal: null,
  macdHistogram: null
};

/**
 * Show volume indicator
 */
function showVolume(volumeData) {
  if (!volumeData) return;
  
  if (!indicatorSeries.volume) {
    indicatorSeries.volume = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });
  }
  
  const formattedData = volumeData.map(v => ({
    time: Math.floor(new Date(v.time).getTime() / 1000),
    value: v.value,
    color: v.color === 'green' ? '#10b981' : '#ef4444'
  }));
  
  indicatorSeries.volume.setData(formattedData);
}

/**
 * Hide volume indicator
 */
function hideVolume() {
  if (indicatorSeries.volume) {
    chart.removeSeries(indicatorSeries.volume);
    indicatorSeries.volume = null;
  }
}

/**
 * Show SMA indicators
 */
function showSMA(smaData) {
  if (!smaData) return;
  
  // SMA 20
  if (smaData.sma20) {
    if (!indicatorSeries.sma20) {
      indicatorSeries.sma20 = chart.addLineSeries({
        color: '#2962FF',
        lineWidth: 2,
        title: 'SMA 20'
      });
    }
    
    const data20 = smaData.sma20.map(d => ({
      time: Math.floor(new Date(d.time).getTime() / 1000),
      value: d.value
    }));
    
    indicatorSeries.sma20.setData(data20);
  }
  
  // SMA 50
  if (smaData.sma50) {
    if (!indicatorSeries.sma50) {
      indicatorSeries.sma50 = chart.addLineSeries({
        color: '#FF6D00',
        lineWidth: 2,
        title: 'SMA 50'
      });
    }
    
    const data50 = smaData.sma50.map(d => ({
      time: Math.floor(new Date(d.time).getTime() / 1000),
      value: d.value
    }));
    
    indicatorSeries.sma50.setData(data50);
  }
}

/**
 * Hide SMA indicators
 */
function hideSMA() {
  if (indicatorSeries.sma20) {
    chart.removeSeries(indicatorSeries.sma20);
    indicatorSeries.sma20 = null;
  }
  
  if (indicatorSeries.sma50) {
    chart.removeSeries(indicatorSeries.sma50);
    indicatorSeries.sma50 = null;
  }
}

/**
 * Show EMA indicators
 */
function showEMA(emaData) {
  if (!emaData) return;
  
  // EMA 12
  if (emaData.ema12) {
    if (!indicatorSeries.ema12) {
      indicatorSeries.ema12 = chart.addLineSeries({
        color: '#00E676',
        lineWidth: 2,
        title: 'EMA 12'
      });
    }
    
    const data12 = emaData.ema12.map(d => ({
      time: Math.floor(new Date(d.time).getTime() / 1000),
      value: d.value
    }));
    
    indicatorSeries.ema12.setData(data12);
  }
  
  // EMA 26
  if (emaData.ema26) {
    if (!indicatorSeries.ema26) {
      indicatorSeries.ema26 = chart.addLineSeries({
        color: '#FFAB00',
        lineWidth: 2,
        title: 'EMA 26'
      });
    }
    
    const data26 = emaData.ema26.map(d => ({
      time: Math.floor(new Date(d.time).getTime() / 1000),
      value: d.value
    }));
    
    indicatorSeries.ema26.setData(data26);
  }
}

/**
 * Hide EMA indicators
 */
function hideEMA() {
  if (indicatorSeries.ema12) {
    chart.removeSeries(indicatorSeries.ema12);
    indicatorSeries.ema12 = null;
  }
  
  if (indicatorSeries.ema26) {
    chart.removeSeries(indicatorSeries.ema26);
    indicatorSeries.ema26 = null;
  }
}

/**
 * Show Bollinger Bands
 */
function showBollinger(bollingerData) {
  // Implementation for Bollinger Bands
  console.log('[Kline] Bollinger Bands display - implement based on your data structure');
}

/**
 * Hide Bollinger Bands
 */
function hideBollinger() {
  // Implementation for hiding Bollinger Bands
}

/**
 * Show RSI indicator
 */
function showRSI(rsiData) {
  // Implementation for RSI
  console.log('[Kline] RSI display - implement based on your data structure');
}

/**
 * Hide RSI indicator
 */
function hideRSI() {
  // Implementation for hiding RSI
}

/**
 * Show MACD indicator
 */
function showMACD(macdData) {
  // Implementation for MACD
  console.log('[Kline] MACD display - implement based on your data structure');
}

/**
 * Hide MACD indicator
 */
function hideMACD() {
  // Implementation for hiding MACD
}