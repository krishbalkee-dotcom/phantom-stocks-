/**
 * Kline.js - TradingView Lightweight Charts v5.0.0
 * TRUE Multi-pane support using pane index parameter
 */

import { 
  createChart, 
  CandlestickSeries,
  BarSeries,
  LineSeries,
  BaselineSeries,
  HistogramSeries
} from 'https://unpkg.com/lightweight-charts@5.0.0/dist/lightweight-charts.standalone.production.mjs';

let chart = null;
let candlestickSeries = null;
let currentData = null;
let activeIndicators = {
  volume: false,
  sma: false,
  ema: false,
  bollinger: false,
  rsi: false,
  macd: false
};

// Pane indices
const PANE_MAIN = 0;
const PANE_VOLUME = 1;
const PANE_RSI = 2;
const PANE_MACD = 3;

/**
 * Change chart type
 */
export function changeChartType(type) {
  if (!chart || !candlestickSeries) {
    console.warn('[Kline] Chart not initialized');
    return;
  }
  
  console.log(`[Kline] Changing chart type to: ${type}`);
  
  const currentSeriesData = candlestickSeries.data ? candlestickSeries.data() : [];
  
  chart.removeSeries(candlestickSeries);
  
  switch (type) {
    case 'candlestick':
      candlestickSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      }, PANE_MAIN);
      break;
      
    case 'bars':
      candlestickSeries = chart.addSeries(BarSeries, {
        upColor: '#10b981',
        downColor: '#ef4444',
        thinBars: false,
      }, PANE_MAIN);
      break;
      
    case 'line':
      candlestickSeries = chart.addSeries(LineSeries, {
        color: '#a855f7',
        lineWidth: 2,
      }, PANE_MAIN);
      const lineData = currentSeriesData.map(bar => ({
        time: bar.time,
        value: bar.close
      }));
      candlestickSeries.setData(lineData);
      return;
      
    case 'baseline':
      candlestickSeries = chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: currentSeriesData[0]?.open || 0 },
        topLineColor: '#10b981',
        topFillColor1: 'rgba(16, 185, 129, 0.28)',
        topFillColor2: 'rgba(16, 185, 129, 0.05)',
        bottomLineColor: '#ef4444',
        bottomFillColor1: 'rgba(239, 68, 68, 0.05)',
        bottomFillColor2: 'rgba(239, 68, 68, 0.28)',
      }, PANE_MAIN);
      const baselineData = currentSeriesData.map(bar => ({
        time: bar.time,
        value: bar.close
      }));
      candlestickSeries.setData(baselineData);
      return;
  }
  
  if (currentSeriesData && currentSeriesData.length > 0) {
    candlestickSeries.setData(currentSeriesData);
  }
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
  
  chart = createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: '#0a0a0a' },
      textColor: '#d1d5db',
      panes: {
        separatorColor: 'rgba(55, 65, 81, 0.3)',
        separatorHoverColor: 'rgba(55, 65, 81, 0.6)',
        enableResize: true,
      },
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
  
  // Create candlestick series in pane 0 (main)
  candlestickSeries = chart.addSeries(CandlestickSeries, {
    upColor: '#10b981',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#10b981',
    wickDownColor: '#ef4444',
  }, PANE_MAIN);
  
  const resizeObserver = new ResizeObserver(entries => {
    if (entries.length === 0 || entries[0].target !== container) {
      return;
    }
    const newRect = entries[0].contentRect;
    chart.applyOptions({ width: newRect.width, height: newRect.height });
  });
  
  resizeObserver.observe(container);
  
  console.log('[Kline] Chart initialized with v5 multi-pane API');
}

/**
 * Load chart data
 */
export async function loadChartData(symbol, timeframe) {
  try {
    console.log(`[Kline] Loading ${symbol} ${timeframe}...`);
    
    const response = await fetch(`https://phantom-stocks.onrender.com/api/market-data/chart?symbol=${symbol}&timeframe=${timeframe}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch chart data');
    }
    
    const data = await response.json();
    currentData = data;
    
    const candleData = data.bars.map(bar => ({
      time: bar.time,
      open: parseFloat(bar.open),
      high: parseFloat(bar.high),
      low: parseFloat(bar.low),
      close: parseFloat(bar.close)
    }));
    
    candlestickSeries.setData(candleData);
    
    // Extract volume
    const volumeData = data.bars.map(bar => ({
      time: bar.time,
      value: bar.volume || 0,
      color: bar.close >= bar.open ? '#26a69a' : '#ef5350'
    }));
    
    // Reload active indicators
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
    
    chart.timeScale().fitContent();
    
    console.log(`[Kline] Loaded ${candleData.length} bars`);
    
  } catch (error) {
    console.error('[Kline] Error loading chart data:', error);
    throw error;
  }
}

/**
 * Toggle indicator
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

function showVolume(volumeData) {
  if (!volumeData) return;
  console.log('[Kline] Showing volume in pane 1');
  
  if (!indicatorSeries.volume) {
    // Add volume to PANE 1
    indicatorSeries.volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
    }, PANE_VOLUME);
  }
  
  indicatorSeries.volume.setData(volumeData);
}

function hideVolume() {
  if (indicatorSeries.volume) {
    chart.removeSeries(indicatorSeries.volume);
    indicatorSeries.volume = null;
  }
}

function showSMA(indicators) {
  if (!indicators) return;
  
  // SMA overlays on main chart (pane 0)
  if (indicators.sma20) {
    if (!indicatorSeries.sma20) {
      indicatorSeries.sma20 = chart.addSeries(LineSeries, {
        color: '#2962FF',
        lineWidth: 2,
        title: 'SMA 20'
      }, PANE_MAIN);
    }
    
    const data20 = indicators.sma20
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.sma20.setData(data20);
  }
  
  if (indicators.sma50) {
    if (!indicatorSeries.sma50) {
      indicatorSeries.sma50 = chart.addSeries(LineSeries, {
        color: '#FF6D00',
        lineWidth: 2,
        title: 'SMA 50'
      }, PANE_MAIN);
    }
    
    const data50 = indicators.sma50
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.sma50.setData(data50);
  }
}

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

function showEMA(indicators) {
  if (!indicators) return;
  
  // EMA overlays on main chart (pane 0)
  if (indicators.ema12) {
    if (!indicatorSeries.ema12) {
      indicatorSeries.ema12 = chart.addSeries(LineSeries, {
        color: '#00E676',
        lineWidth: 2,
        title: 'EMA 12'
      }, PANE_MAIN);
    }
    
    const data12 = indicators.ema12
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.ema12.setData(data12);
  }
  
  if (indicators.ema26) {
    if (!indicatorSeries.ema26) {
      indicatorSeries.ema26 = chart.addSeries(LineSeries, {
        color: '#FFAB00',
        lineWidth: 2,
        title: 'EMA 26'
      }, PANE_MAIN);
    }
    
    const data26 = indicators.ema26
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.ema26.setData(data26);
  }
}

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

function showBollinger(bollingerData) {
  if (!bollingerData) return;
  console.log('[Kline] Showing Bollinger Bands');
  
  // Bollinger overlays on main chart (pane 0)
  if (bollingerData.upper) {
    if (!indicatorSeries.bollingerUpper) {
      indicatorSeries.bollingerUpper = chart.addSeries(LineSeries, {
        color: 'rgba(168, 85, 247, 0.5)',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BB Upper'
      }, PANE_MAIN);
    }
    
    const upperData = bollingerData.upper
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.bollingerUpper.setData(upperData);
  }
  
  if (bollingerData.middle) {
    if (!indicatorSeries.bollingerMiddle) {
      indicatorSeries.bollingerMiddle = chart.addSeries(LineSeries, {
        color: 'rgba(168, 85, 247, 0.8)',
        lineWidth: 2,
        title: 'BB Middle'
      }, PANE_MAIN);
    }
    
    const middleData = bollingerData.middle
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.bollingerMiddle.setData(middleData);
  }
  
  if (bollingerData.lower) {
    if (!indicatorSeries.bollingerLower) {
      indicatorSeries.bollingerLower = chart.addSeries(LineSeries, {
        color: 'rgba(168, 85, 247, 0.5)',
        lineWidth: 1,
        lineStyle: 2,
        title: 'BB Lower'
      }, PANE_MAIN);
    }
    
    const lowerData = bollingerData.lower
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.bollingerLower.setData(lowerData);
  }
}

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

function showRSI(rsiData) {
  if (!rsiData) return;
  console.log('[Kline] Showing RSI in pane 2');
  
  if (!indicatorSeries.rsi) {
    // Add RSI to PANE 2
    indicatorSeries.rsi = chart.addSeries(LineSeries, {
      color: '#9333ea',
      lineWidth: 2,
      title: 'RSI (14)',
    }, PANE_RSI);
  }
  
  const data = rsiData
    .filter(d => d.value !== null && d.value !== undefined)
    .map(d => ({ time: d.time, value: d.value }));
  
  indicatorSeries.rsi.setData(data);
}

function hideRSI() {
  if (indicatorSeries.rsi) {
    chart.removeSeries(indicatorSeries.rsi);
    indicatorSeries.rsi = null;
  }
}

function showMACD(macdData) {
  if (!macdData) return;
  console.log('[Kline] Showing MACD in pane 3');
  
  // All MACD components go to PANE 3
  if (macdData.macd) {
    if (!indicatorSeries.macdLine) {
      indicatorSeries.macdLine = chart.addSeries(LineSeries, {
        color: '#2962FF',
        lineWidth: 2,
        title: 'MACD',
      }, PANE_MACD);
    }
    
    const macdLineData = macdData.macd
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.macdLine.setData(macdLineData);
  }
  
  if (macdData.signal) {
    if (!indicatorSeries.macdSignal) {
      indicatorSeries.macdSignal = chart.addSeries(LineSeries, {
        color: '#FF6D00',
        lineWidth: 2,
        title: 'Signal',
      }, PANE_MACD);
    }
    
    const signalData = macdData.signal
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({ time: d.time, value: d.value }));
    
    indicatorSeries.macdSignal.setData(signalData);
  }
  
  if (macdData.histogram) {
    if (!indicatorSeries.macdHistogram) {
      indicatorSeries.macdHistogram = chart.addSeries(HistogramSeries, {
        title: 'Histogram',
      }, PANE_MACD);
    }
    
    const histogramData = macdData.histogram
      .filter(d => d.value !== null && d.value !== undefined)
      .map(d => ({
        time: d.time,
        value: d.value,
        color: d.value >= 0 ? '#26a69a' : '#ef5350'
      }));
    
    indicatorSeries.macdHistogram.setData(histogramData);
  }
}

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