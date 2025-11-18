/**
 * Kline.js - Chart Wrapper
 * Integrates with your existing instant-loading simplified chart system
 * This is a simplified interface - you should integrate your actual kline.js file here
 */

import { createChart } from 'https://unpkg.com/lightweight-charts@5.0.0/dist/lightweight-charts.standalone.production.mjs';

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
 * Calculate pane heights based on active indicators
 * Returns object with height percentages for each pane
 */
function calculatePaneHeights() {
  const active = [];
  
  // Check which bottom panes are active
  if (activeIndicators.volume) active.push('volume');
  if (activeIndicators.rsi) active.push('rsi');
  if (activeIndicators.macd) active.push('macd');
  
  const numPanes = 1 + active.length; // Main pane + active bottom panes
  
  switch (numPanes) {
    case 1: // Only main chart
      return { main: 1.0 };
      
    case 2: // Main + 1 indicator
      return { 
        main: 0.70,
        [active[0]]: 0.30
      };
      
    case 3: // Main + 2 indicators
      return { 
        main: 0.60,
        [active[0]]: 0.20,
        [active[1]]: 0.20
      };
      
    case 4: // Main + 3 indicators
      return { 
        main: 0.50,
        [active[0]]: 0.20,
        [active[1]]: 0.15,
        [active[2]]: 0.15
      };
      
    default:
      return { main: 1.0 };
  }
}

/**
 * Apply pane heights to chart
 */
function applyPaneHeights() {
  const heights = calculatePaneHeights();
  
  console.log('[Kline] Applying pane heights:', heights);
  
  // Apply main chart height
  if (candlestickSeries) {
    candlestickSeries.applyOptions({
      priceScaleId: 'right',
      scaleMargins: {
        top: 0.1,
        bottom: heights.main < 1 ? (1 - heights.main + 0.05) : 0.1,
      }
    });
  }
  
  // Apply volume height
  if (indicatorSeries.volume && heights.volume) {
    const volumeBottom = heights.rsi ? heights.rsi : 0;
    const macdBottom = heights.macd ? heights.macd : 0;
    indicatorSeries.volume.applyOptions({
      scaleMargins: {
        top: 1 - heights.volume - volumeBottom - macdBottom,
        bottom: volumeBottom + macdBottom,
      }
    });
  }
  
  // Apply RSI height
  if (indicatorSeries.rsi && heights.rsi) {
    const macdBottom = heights.macd ? heights.macd : 0;
    indicatorSeries.rsi.applyOptions({
      scaleMargins: {
        top: 1 - heights.rsi - macdBottom,
        bottom: macdBottom,
      }
    });
  }
  
  // Apply MACD height
  if (indicatorSeries.macdLine && heights.macd) {
    const margin = { top: 1 - heights.macd, bottom: 0 };
    indicatorSeries.macdLine.applyOptions({ scaleMargins: margin });
    if (indicatorSeries.macdSignal) {
      indicatorSeries.macdSignal.applyOptions({ scaleMargins: margin });
    }
    if (indicatorSeries.macdHistogram) {
      indicatorSeries.macdHistogram.applyOptions({ scaleMargins: margin });
    }
  }
}


/**
 * Change chart type
 */
export function changeChartType(type) {
  if (!chart || !candlestickSeries) {
    console.warn('[Kline] Chart not initialized');
    return;
  }
  
  console.log(`[Kline] Changing chart type to: ${type}`);
  
  // Store current data
  const currentSeriesData = candlestickSeries.data ? candlestickSeries.data() : [];
  
  // Remove old series
  chart.removeSeries(candlestickSeries);
  
  // Create new series based on type
  switch (type) {
    case 'candlestick':
      candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        priceScaleId: 'right'
      });
      break;
      
    case 'bars':
      candlestickSeries = chart.addBarSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        thinBars: false,
        priceScaleId: 'right'
      });
      break;
      
    case 'line':
      candlestickSeries = chart.addLineSeries({
        color: '#a855f7',
        lineWidth: 2,
        priceScaleId: 'right'
      });
      // For line charts, we only need close prices
      const lineData = currentSeriesData.map(bar => ({
        time: bar.time,
        value: bar.close
      }));
      candlestickSeries.setData(lineData);
      applyPaneHeights(); // Reapply heights after chart type change
      return;
      
    case 'baseline':
      candlestickSeries = chart.addBaselineSeries({
        baseValue: { type: 'price', price: currentSeriesData[0]?.open || 0 },
        topLineColor: '#10b981',
        topFillColor1: 'rgba(16, 185, 129, 0.28)',
        topFillColor2: 'rgba(16, 185, 129, 0.05)',
        bottomLineColor: '#ef4444',
        bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
        bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
        priceScaleId: 'right'
      });
      // For baseline, also use close prices
      const baselineData = currentSeriesData.map(bar => ({
        time: bar.time,
        value: bar.close
      }));
      candlestickSeries.setData(baselineData);
      applyPaneHeights(); // Reapply heights after chart type change
      return;
  }
  
  // Set data back for candlestick/bars
  if (currentSeriesData && currentSeriesData.length > 0) {
    candlestickSeries.setData(currentSeriesData);
  }
  
  // Reapply pane heights to maintain layout
  applyPaneHeights();
}

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
    
    // Extract volume from bars
    const volumeData = data.bars.map(bar => ({
      time: bar.time,
      value: bar.volume || 0,
      color: bar.close >= bar.open ? '#26a69a' : '#ef5350'
    }));
    
    // Reload active indicators with new data
    if (activeIndicators.volume) {
      showVolume(volumeData);
    }
    
    if (activeIndicators.sma && data.indicators) {
      showSMA(data.indicators);
    }
    
    if (activeIndicators.ema && data.indicators) {
      showEMA(data.indicators);
    }
    
    if (activeIndicators.bollinger && data.indicators?.bollingerBands) {
      showBollinger(data.indicators.bollingerBands);
    }
    
    if (activeIndicators.rsi && data.indicators?.rsi) {
      showRSI(data.indicators.rsi);
    }
    
    if (activeIndicators.macd && data.indicators?.macd) {
      showMACD(data.indicators.macd);
    }
    
    // Apply pane heights based on active indicators
    applyPaneHeights();
    
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
  
  if (!currentData) {
    return;
  }
  
  switch (indicator) {
    case 'volume':
      if (isActive && currentData.bars) {
        const volumeData = currentData.bars.map(bar => ({
          time: bar.time,
          value: bar.volume || 0,
          color: bar.close >= bar.open ? '#26a69a' : '#ef5350'
        }));
        showVolume(volumeData);
      } else {
        hideVolume();
      }
      break;
    
    case 'sma':
      if (isActive && currentData.indicators) {
        showSMA(currentData.indicators);
      } else {
        hideSMA();
      }
      break;
    
    case 'ema':
      if (isActive && currentData.indicators) {
        showEMA(currentData.indicators);
      } else {
        hideEMA();
      }
      break;
    
    case 'bollinger':
      if (isActive && currentData.indicators?.bollingerBands) {
        showBollinger(currentData.indicators.bollingerBands);
      } else {
        hideBollinger();
      }
      break;
    
    case 'rsi':
      if (isActive && currentData.indicators?.rsi) {
        showRSI(currentData.indicators.rsi);
      } else {
        hideRSI();
      }
      break;
    
    case 'macd':
      if (isActive && currentData.indicators?.macd) {
        showMACD(currentData.indicators.macd);
      } else {
        hideMACD();
      }
      break;
  }
  
  // Recalculate and apply pane heights after toggling
  applyPaneHeights();
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
  
  console.log('[Kline] Showing volume');
  
  if (!indicatorSeries.volume) {
    indicatorSeries.volume = chart.addHistogramSeries({
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.70,
        bottom: 0.30,
      },
    });
  }
  
  const formattedData = volumeData.map(v => ({
    time: typeof v.time === 'number' ? v.time : Math.floor(new Date(v.time).getTime() / 1000),
    value: v.value,
    color: v.color || (v.value > 0 ? '#26a69a' : '#ef5350')
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
function showSMA(indicators) {
  if (!indicators) return;
  
  // SMA 20
  if (indicators.sma20) {
    if (!indicatorSeries.sma20) {
      indicatorSeries.sma20 = chart.addLineSeries({
        color: '#2962FF',
        lineWidth: 2,
        title: 'SMA 20'
      });
    }
    
    // Filter out null values and ensure time is a number
    const data20 = indicators.sma20
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value
      }));
    
    indicatorSeries.sma20.setData(data20);
  }
  
  // SMA 50
  if (indicators.sma50) {
    if (!indicatorSeries.sma50) {
      indicatorSeries.sma50 = chart.addLineSeries({
        color: '#FF6D00',
        lineWidth: 2,
        title: 'SMA 50'
      });
    }
    
    const data50 = indicators.sma50
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
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
function showEMA(indicators) {
  if (!indicators) return;
  
  // EMA 12
  if (indicators.ema12) {
    if (!indicatorSeries.ema12) {
      indicatorSeries.ema12 = chart.addLineSeries({
        color: '#00E676',
        lineWidth: 2,
        title: 'EMA 12'
      });
    }
    
    const data12 = indicators.ema12
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value
      }));
    
    indicatorSeries.ema12.setData(data12);
  }
  
  // EMA 26
  if (indicators.ema26) {
    if (!indicatorSeries.ema26) {
      indicatorSeries.ema26 = chart.addLineSeries({
        color: '#FFAB00',
        lineWidth: 2,
        title: 'EMA 26'
      });
    }
    
    const data26 = indicators.ema26
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
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
  if (!bollingerData) return;
  
  console.log('[Kline] Showing Bollinger Bands');
  
  // Upper band
  if (bollingerData.upper) {
    if (!indicatorSeries.bollingerUpper) {
      indicatorSeries.bollingerUpper = chart.addLineSeries({
        color: 'rgba(168, 85, 247, 0.5)',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        title: 'BB Upper'
      });
    }
    
    const upperData = bollingerData.upper
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value
      }));
    
    indicatorSeries.bollingerUpper.setData(upperData);
  }
  
  // Middle band (SMA)
  if (bollingerData.middle) {
    if (!indicatorSeries.bollingerMiddle) {
      indicatorSeries.bollingerMiddle = chart.addLineSeries({
        color: 'rgba(168, 85, 247, 0.8)',
        lineWidth: 2,
        title: 'BB Middle'
      });
    }
    
    const middleData = bollingerData.middle
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value
      }));
    
    indicatorSeries.bollingerMiddle.setData(middleData);
  }
  
  // Lower band
  if (bollingerData.lower) {
    if (!indicatorSeries.bollingerLower) {
      indicatorSeries.bollingerLower = chart.addLineSeries({
        color: 'rgba(168, 85, 247, 0.5)',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        title: 'BB Lower'
      });
    }
    
    const lowerData = bollingerData.lower
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value
      }));
    
    indicatorSeries.bollingerLower.setData(lowerData);
  }
}

/**
 * Hide Bollinger Bands
 */
function hideBollinger() {
  if (indicatorSeries.bollingerUpper) {
    chart.removeSeries(indicatorSeries.bollingerUpper);
    indicatorSeries.bollingerUpper = null;
  }
  
  if (indicatorSeries.bollingerMiddle) {
    chart.removeSeries(indicatorSeries.bollingerMiddle);
    indicatorSeries.bollingerMiddle = null;
  }
  
  if (indicatorSeries.bollingerLower) {
    chart.removeSeries(indicatorSeries.bollingerLower);
    indicatorSeries.bollingerLower = null;
  }
}

/**
 * Show RSI indicator
 */
function showRSI(rsiData) {
  if (!rsiData) return;
  
  console.log('[Kline] Showing RSI');
  
  if (!indicatorSeries.rsi) {
    indicatorSeries.rsi = chart.addLineSeries({
      color: '#9333ea',
      lineWidth: 2,
      title: 'RSI (14)',
      priceScaleId: 'rsi',
      scaleMargins: {
        top: 0.80,
        bottom: 0.15,
      }
    });
  }
  
  const data = rsiData
    .filter(d => d.value !== null && d.value !== undefined)
    .map(d => ({
      time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
      value: d.value
    }));
  
  indicatorSeries.rsi.setData(data);
}

/**
 * Hide RSI indicator
 */
function hideRSI() {
  if (indicatorSeries.rsi) {
    chart.removeSeries(indicatorSeries.rsi);
    indicatorSeries.rsi = null;
  }
}

/**
 * Show MACD indicator
 */
function showMACD(macdData) {
  if (!macdData) return;
  
  console.log('[Kline] Showing MACD');
  
  // MACD Line
  if (macdData.macd) {
    if (!indicatorSeries.macdLine) {
      indicatorSeries.macdLine = chart.addLineSeries({
        color: '#2962FF',
        lineWidth: 2,
        title: 'MACD',
        priceScaleId: 'macd',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        }
      });
    }
    
    const macdLineData = macdData.macd
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value
      }));
    
    indicatorSeries.macdLine.setData(macdLineData);
  }
  
  // Signal Line
  if (macdData.signal) {
    if (!indicatorSeries.macdSignal) {
      indicatorSeries.macdSignal = chart.addLineSeries({
        color: '#FF6D00',
        lineWidth: 2,
        title: 'Signal',
        priceScaleId: 'macd',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        }
      });
    }
    
    const signalData = macdData.signal
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value
      }));
    
    indicatorSeries.macdSignal.setData(signalData);
  }
  
  // Histogram
  if (macdData.histogram) {
    if (!indicatorSeries.macdHistogram) {
      indicatorSeries.macdHistogram = chart.addHistogramSeries({
        color: '#26a69a',
        title: 'Histogram',
        priceScaleId: 'macd',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        }
      });
    }
    
    const histogramData = macdData.histogram
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: typeof d.time === 'number' ? d.time : Math.floor(new Date(d.time).getTime() / 1000),
        value: d.value,
        color: d.value >= 0 ? '#26a69a' : '#ef5350'
      }));
    
    indicatorSeries.macdHistogram.setData(histogramData);
  }
}

/**
 * Hide MACD indicator
 */
function hideMACD() {
  if (indicatorSeries.macdLine) {
    chart.removeSeries(indicatorSeries.macdLine);
    indicatorSeries.macdLine = null;
  }
  
  if (indicatorSeries.macdSignal) {
    chart.removeSeries(indicatorSeries.macdSignal);
    indicatorSeries.macdSignal = null;
  }
  
  if (indicatorSeries.macdHistogram) {
    chart.removeSeries(indicatorSeries.macdHistogram);
    indicatorSeries.macdHistogram = null;
  }
}