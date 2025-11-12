// Indicator Service - Calculate technical indicators
class IndicatorService {
    /**
     * Calculate Simple Moving Average (SMA)
     * @param {Array} data - Array of OHLCV bars
     * @param {number} period - Period for SMA (default: 20)
     * @param {string} field - Field to use (default: 'close')
     * @returns {Array} Array of SMA values
     */
    calculateSMA(data, period = 20, field = 'close') {
        if (!data || data.length < period) {
            return [];
        }
        
        const sma = [];
        
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                sma.push({ time: data[i].time, value: null });
                continue;
            }
            
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j][field];
            }
            
            sma.push({
                time: data[i].time,
                value: sum / period
            });
        }
        
        return sma;
    }

    /**
     * Calculate Exponential Moving Average (EMA)
     * @param {Array} data - Array of OHLCV bars
     * @param {number} period - Period for EMA (default: 12)
     * @param {string} field - Field to use (default: 'close')
     * @returns {Array} Array of EMA values
     */
    calculateEMA(data, period = 12, field = 'close') {
        if (!data || data.length < period) {
            return [];
        }
        
        const ema = [];
        const multiplier = 2 / (period + 1);
        
        // Calculate initial SMA for first EMA value
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i][field];
            if (i < period - 1) {
                ema.push({ time: data[i].time, value: null });
            }
        }
        
        let previousEMA = sum / period;
        ema.push({ time: data[period - 1].time, value: previousEMA });
        
        // Calculate EMA for remaining values
        for (let i = period; i < data.length; i++) {
            const currentEMA = (data[i][field] - previousEMA) * multiplier + previousEMA;
            ema.push({ time: data[i].time, value: currentEMA });
            previousEMA = currentEMA;
        }
        
        return ema;
    }

    /**
     * Calculate Relative Strength Index (RSI)
     * @param {Array} data - Array of OHLCV bars
     * @param {number} period - Period for RSI (default: 14)
     * @returns {Array} Array of RSI values
     */
    calculateRSI(data, period = 14) {
        if (!data || data.length < period + 1) {
            return [];
        }
        
        const rsi = [];
        let gains = 0;
        let losses = 0;
        
        // Calculate initial average gain and loss
        for (let i = 1; i <= period; i++) {
            const change = data[i].close - data[i - 1].close;
            if (change >= 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
            
            if (i < period) {
                rsi.push({ time: data[i].time, value: null });
            }
        }
        
        let avgGain = gains / period;
        let avgLoss = losses / period;
        
        let rs = avgGain / avgLoss;
        let rsiValue = 100 - (100 / (1 + rs));
        rsi.push({ time: data[period].time, value: rsiValue });
        
        // Calculate RSI for remaining values
        for (let i = period + 1; i < data.length; i++) {
            const change = data[i].close - data[i - 1].close;
            
            if (change >= 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
            }
            
            rs = avgGain / avgLoss;
            rsiValue = 100 - (100 / (1 + rs));
            rsi.push({ time: data[i].time, value: rsiValue });
        }
        
        return rsi;
    }

    /**
     * Calculate MACD (Moving Average Convergence Divergence)
     * @param {Array} data - Array of OHLCV bars
     * @param {number} fastPeriod - Fast EMA period (default: 12)
     * @param {number} slowPeriod - Slow EMA period (default: 26)
     * @param {number} signalPeriod - Signal line period (default: 9)
     * @returns {Object} Object with macd, signal, and histogram arrays
     */
    calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (!data || data.length < slowPeriod) {
            return { macd: [], signal: [], histogram: [] };
        }
        
        const fastEMA = this.calculateEMA(data, fastPeriod);
        const slowEMA = this.calculateEMA(data, slowPeriod);
        
        const macdLine = [];
        for (let i = 0; i < data.length; i++) {
            if (fastEMA[i].value === null || slowEMA[i].value === null) {
                macdLine.push({ time: data[i].time, value: null });
            } else {
                macdLine.push({
                    time: data[i].time,
                    value: fastEMA[i].value - slowEMA[i].value
                });
            }
        }
        
        // Calculate signal line (EMA of MACD line)
        const validMacdValues = macdLine.filter(m => m.value !== null);
        const signalEMA = this.calculateEMA(
            validMacdValues.map((m, i) => ({ time: m.time, close: m.value })),
            signalPeriod
        );
        
        const signal = [];
        let signalIndex = 0;
        for (let i = 0; i < macdLine.length; i++) {
            if (macdLine[i].value === null) {
                signal.push({ time: macdLine[i].time, value: null });
            } else if (signalIndex < signalEMA.length && signalEMA[signalIndex].value !== null) {
                signal.push({
                    time: macdLine[i].time,
                    value: signalEMA[signalIndex].value
                });
                signalIndex++;
            } else {
                signal.push({ time: macdLine[i].time, value: null });
                signalIndex++;
            }
        }
        
        // Calculate histogram
        const histogram = [];
        for (let i = 0; i < macdLine.length; i++) {
            if (macdLine[i].value === null || signal[i].value === null) {
                histogram.push({ time: data[i].time, value: null });
            } else {
                histogram.push({
                    time: data[i].time,
                    value: macdLine[i].value - signal[i].value
                });
            }
        }
        
        return {
            macd: macdLine,
            signal: signal,
            histogram: histogram
        };
    }

    /**
     * Calculate Bollinger Bands
     * @param {Array} data - Array of OHLCV bars
     * @param {number} period - Period for moving average (default: 20)
     * @param {number} stdDev - Standard deviation multiplier (default: 2)
     * @returns {Object} Object with upper, middle, and lower band arrays
     */
    calculateBollingerBands(data, period = 20, stdDev = 2) {
        if (!data || data.length < period) {
            return { upper: [], middle: [], lower: [] };
        }
        
        const sma = this.calculateSMA(data, period);
        const upper = [];
        const middle = [];
        const lower = [];
        
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                upper.push({ time: data[i].time, value: null });
                middle.push({ time: data[i].time, value: null });
                lower.push({ time: data[i].time, value: null });
                continue;
            }
            
            // Calculate standard deviation
            const smaValue = sma[i].value;
            let variance = 0;
            
            for (let j = 0; j < period; j++) {
                const diff = data[i - j].close - smaValue;
                variance += diff * diff;
            }
            
            const standardDeviation = Math.sqrt(variance / period);
            
            upper.push({
                time: data[i].time,
                value: smaValue + (stdDev * standardDeviation)
            });
            
            middle.push({
                time: data[i].time,
                value: smaValue
            });
            
            lower.push({
                time: data[i].time,
                value: smaValue - (stdDev * standardDeviation)
            });
        }
        
        return { upper, middle, lower };
    }

    /**
     * Calculate all indicators for chart data
     * @param {Array} data - Array of OHLCV bars
     * @returns {Object} Object with all calculated indicators
     */
    calculateAllIndicators(data) {
        return {
            sma20: this.calculateSMA(data, 20),
            sma50: this.calculateSMA(data, 50),
            ema12: this.calculateEMA(data, 12),
            ema26: this.calculateEMA(data, 26),
            rsi: this.calculateRSI(data, 14),
            macd: this.calculateMACD(data, 12, 26, 9),
            bollingerBands: this.calculateBollingerBands(data, 20, 2)
        };
    }
}

export default new IndicatorService();