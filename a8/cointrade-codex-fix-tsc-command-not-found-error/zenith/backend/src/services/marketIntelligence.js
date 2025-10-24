import { logger } from '../utils/logger.js';

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const percentChange = (base, current) => {
  if (!Number.isFinite(base) || base === 0) return 0;
  return ((current - base) / base) * 100;
};

const sma = (values, period) => {
  if (values.length < period) return values[values.length - 1] ?? 0;
  const slice = values.slice(-period);
  const sum = slice.reduce((total, value) => total + value, 0);
  return sum / period;
};

const ema = (values, period) => {
  if (values.length === 0) return 0;
  const smoothing = 2 / (period + 1);
  let emaValue = values[0];
  for (let i = 1; i < values.length; i += 1) {
    emaValue = values[i] * smoothing + emaValue * (1 - smoothing);
  }
  return emaValue;
};

const atr = (candles, period = 14) => {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  const ranges = [];
  for (let i = 0; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    const highLow = current.high - current.low;
    const highClose = previous ? Math.abs(current.high - previous.close) : highLow;
    const lowClose = previous ? Math.abs(current.low - previous.close) : highLow;
    ranges.push(Math.max(highLow, highClose, lowClose));
  }
  const recent = ranges.slice(-Math.max(period, 2));
  return ema(recent, Math.min(period, recent.length));
};

const rsi = (values, period = 14) => {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (averageLoss === 0) return 100;
  if (averageGain === 0) return 0;
  const rs = averageGain / averageLoss;
  return 100 - 100 / (1 + rs);
};

const stddev = (values) => {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(Math.max(variance, 0));
};

const moneyFlowIndex = (candles, period = 14) => {
  if (!Array.isArray(candles) || candles.length < period + 1) return 50;

  let positiveFlow = 0;
  let negativeFlow = 0;

  for (let i = candles.length - period; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    const typicalPriceCurrent = (current.high + current.low + current.close) / 3;
    const typicalPricePrevious = (previous.high + previous.low + previous.close) / 3;
    const moneyFlow = typicalPriceCurrent * current.volume;

    if (typicalPriceCurrent > typicalPricePrevious) {
      positiveFlow += moneyFlow;
    } else if (typicalPriceCurrent < typicalPricePrevious) {
      negativeFlow += moneyFlow;
    }
  }

  if (negativeFlow === 0) return 100;
  if (positiveFlow === 0) return 0;

  const moneyFlowRatio = positiveFlow / negativeFlow;
  return 100 - 100 / (1 + moneyFlowRatio);
};

const onBalanceVolumeSlope = (candles, lookback = 10) => {
  if (!Array.isArray(candles) || candles.length < 2) return 0;

  let obv = 0;
  const values = [obv];

  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    if (current.close > previous.close) {
      obv += current.volume;
    } else if (current.close < previous.close) {
      obv -= current.volume;
    }
    values.push(obv);
  }

  const recent = values.slice(-Math.max(lookback, 2));
  if (recent.length < 2) return 0;

  const first = recent[0];
  const last = recent[recent.length - 1];
  const range = Math.max(Math.abs(first), Math.abs(last), 1);
  return (last - first) / range;
};

const volumeAcceleration = (volumes) => {
  if (!Array.isArray(volumes) || volumes.length < 6) return 0;
  const recent = volumes.slice(-6);
  const half = Math.floor(recent.length / 2);
  const earlyAvg = recent.slice(0, half).reduce((sum, value) => sum + value, 0) / half;
  const lateAvg = recent.slice(half).reduce((sum, value) => sum + value, 0) / (recent.length - half);
  if (earlyAvg === 0) return 0;
  return ((lateAvg - earlyAvg) / earlyAvg) * 100;
};

const deriveLocalSignal = (metrics) => {
  const {
    change1mPct,
    change5mPct,
    change15mPct,
    rsi14,
    lastPrice,
    support,
    resistance,
    volatilityPct,
    volumeRatio,
    volumeChangePct,
    volumeAccelerationPct,
    mfi14,
    obvSlope,
    ema21,
    ema55,
    atrPct,
  } = metrics;

  const longDrivers = [];
  const shortDrivers = [];

  const trendSlope = ema21 - ema55;
  if (trendSlope > 0) {
    longDrivers.push({ weight: Math.min(Math.abs(trendSlope) / Math.max(ema55, 1), 0.6), reason: 'EMA trend up' });
  } else if (trendSlope < 0) {
    shortDrivers.push({ weight: Math.min(Math.abs(trendSlope) / Math.max(ema55, 1), 0.6), reason: 'EMA trend down' });
  }

  if (change5mPct > 0.2) longDrivers.push({ weight: Math.min(change5mPct / 2, 0.7), reason: `Δ5m +${round(change5mPct, 2)}%` });
  if (change5mPct < -0.2) shortDrivers.push({ weight: Math.min(Math.abs(change5mPct) / 2, 0.7), reason: `Δ5m ${round(change5mPct, 2)}%` });

  if (change15mPct > 0.25) longDrivers.push({ weight: Math.min(change15mPct / 2.5, 0.6), reason: `Δ15m +${round(change15mPct, 2)}%` });
  if (change15mPct < -0.25) shortDrivers.push({ weight: Math.min(Math.abs(change15mPct) / 2.5, 0.6), reason: `Δ15m ${round(change15mPct, 2)}%` });

  if (rsi14 > 60) longDrivers.push({ weight: Math.min((rsi14 - 60) / 30, 0.45), reason: `RSI ${round(rsi14, 1)}` });
  if (rsi14 < 40) shortDrivers.push({ weight: Math.min((40 - rsi14) / 30, 0.45), reason: `RSI ${round(rsi14, 1)}` });

  if (volumeRatio > 1.15) {
    longDrivers.push({ weight: Math.min((volumeRatio - 1) / 1.6, 0.4), reason: `Volume ratio ${round(volumeRatio, 2)}` });
  }
  if (volumeRatio < 0.85) {
    shortDrivers.push({ weight: Math.min((1 - volumeRatio) / 1.6, 0.4), reason: `Volume ratio ${round(volumeRatio, 2)}` });
  }

  if (volumeChangePct > 35) {
    longDrivers.push({ weight: Math.min(volumeChangePct / 150, 0.3), reason: `Volume surge ${round(volumeChangePct, 1)}%` });
  }
  if (volumeChangePct < -30) {
    shortDrivers.push({ weight: Math.min(Math.abs(volumeChangePct) / 150, 0.3), reason: `Volume drop ${round(volumeChangePct, 1)}%` });
  }

  if (volumeAccelerationPct > 40) {
    longDrivers.push({ weight: Math.min(volumeAccelerationPct / 200, 0.22), reason: `Volume acceleration ${round(volumeAccelerationPct, 1)}%` });
  }
  if (volumeAccelerationPct < -35) {
    shortDrivers.push({ weight: Math.min(Math.abs(volumeAccelerationPct) / 200, 0.22), reason: `Volume decel ${round(volumeAccelerationPct, 1)}%` });
  }

  if (mfi14 > 65) {
    longDrivers.push({ weight: Math.min((mfi14 - 65) / 70, 0.35), reason: `MFI ${round(mfi14, 1)}` });
  }
  if (mfi14 < 35) {
    shortDrivers.push({ weight: Math.min((35 - mfi14) / 70, 0.35), reason: `MFI ${round(mfi14, 1)}` });
  }

  if (obvSlope > 0.12) {
    longDrivers.push({ weight: Math.min(obvSlope, 0.25), reason: `OBV slope ${round(obvSlope * 100, 1)}%` });
  }
  if (obvSlope < -0.12) {
    shortDrivers.push({ weight: Math.min(Math.abs(obvSlope), 0.25), reason: `OBV slope ${round(obvSlope * 100, 1)}%` });
  }

  if (change1mPct > 0.1 && atrPct < 1.5) {
    longDrivers.push({ weight: 0.15, reason: 'Momentum breakout' });
  } else if (change1mPct < -0.1 && atrPct < 1.5) {
    shortDrivers.push({ weight: 0.15, reason: 'Momentum breakdown' });
  }

  if (lastPrice >= resistance) {
    shortDrivers.push({ weight: 0.2, reason: 'Testing resistance' });
  }
  if (lastPrice <= support) {
    longDrivers.push({ weight: 0.2, reason: 'Testing support' });
  }

  const longScore = longDrivers.reduce((sum, item) => sum + item.weight, 0);
  const shortScore = shortDrivers.reduce((sum, item) => sum + item.weight, 0);
  const scoreDiff = longScore - shortScore;
  const scoreTotal = longScore + shortScore + 0.0001;
  const edgeScore = Math.min(1, Math.abs(scoreDiff) / scoreTotal);

  let bias = 'flat';
  if (scoreDiff > 0.08) bias = 'long';
  if (scoreDiff < -0.08) bias = 'short';

  let baseConfidence = 0.4 + edgeScore * 0.45;
  baseConfidence += Math.min(Math.abs(change15mPct) / 120, 0.1);
  baseConfidence += Math.min(Math.abs(change5mPct) / 120, 0.08);
  if (volatilityPct > 1.8) {
    baseConfidence = Math.max(0.35, baseConfidence - 0.1);
  }

  if (bias === 'long' && lastPrice >= resistance * 0.999) {
    baseConfidence = Math.max(0.35, baseConfidence - 0.12);
  }
  if (bias === 'short' && lastPrice <= support * 1.001) {
    baseConfidence = Math.max(0.35, baseConfidence - 0.12);
  }

  const drivers = (bias === 'long' ? longDrivers : bias === 'short' ? shortDrivers : [...longDrivers, ...shortDrivers])
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((item) => item.reason);

  const reasoning = drivers.length > 0 ? drivers.join(' · ') : 'Signals mixed across indicators';

  return {
    bias,
    confidence: round(Math.max(0.32, Math.min(baseConfidence, 0.94)), 2),
    reasoning,
    edgeScore: round(edgeScore, 2),
    longScore: round(longScore, 2),
    shortScore: round(shortScore, 2),
  };
};

export function buildSnapshotFromCandles(symbol, interval, candles) {
  if (!Array.isArray(candles) || candles.length === 0) {
    throw new Error('No candles provided for market snapshot');
  }

  const closes = candles.map((candle) => candle.close);
  const lastCandle = candles[candles.length - 1];
  const lastPrice = lastCandle.close;

  const lookupClose = (minutesAgo) => {
    const index = candles.length - 1 - minutesAgo;
    return index >= 0 ? candles[index].close : lastPrice;
  };

  const change1mPct = percentChange(lookupClose(1), lastPrice);
  const change5mPct = percentChange(lookupClose(5), lastPrice);
  const change15mPct = percentChange(lookupClose(15), lastPrice);
  const sma5 = sma(closes, 5);
  const sma15 = sma(closes, 15);
  const ema21 = ema(closes, 21);
  const ema55 = ema(closes, 55);
  const rsi14 = rsi(closes, 14);

  const returns = [];
  for (let i = 1; i < closes.length; i += 1) {
    const base = closes[i - 1];
    const current = closes[i];
    if (base > 0) {
      returns.push(((current - base) / base) * 100);
    }
  }
  const volatilityPct = stddev(returns);
  const atrValue = atr(candles, 14);
  const atrPct = lastPrice > 0 ? (atrValue / lastPrice) * 100 : 0;

  const recentSlice = candles.slice(-30);
  const support = recentSlice.reduce((min, candle) => Math.min(min, candle.low), recentSlice[0].low);
  const resistance = recentSlice.reduce((max, candle) => Math.max(max, candle.high), recentSlice[0].high);

  const volumes = candles.map((candle) => candle.volume);
  const avgVolumeShort = sma(volumes, 20);
  const avgVolumeLong = sma(volumes, 60);
  const volumeRatio = avgVolumeLong === 0 ? 1 : avgVolumeShort / avgVolumeLong;
  const lastVolume = volumes[volumes.length - 1] ?? avgVolumeShort;
  const priorVolume = volumes[volumes.length - 2] ?? lastVolume;
  const volumeChangePct = priorVolume === 0 ? 0 : ((lastVolume - priorVolume) / priorVolume) * 100;
  const volumeAccelerationPct = volumeAcceleration(volumes);
  const mfi14 = moneyFlowIndex(candles, 14);
  const obvSlope = onBalanceVolumeSlope(candles, 10);

  const metrics = {
    symbol,
    interval,
    lastPrice,
    change1mPct,
    change5mPct,
    change15mPct,
    sma5,
    sma15,
    ema21,
    ema55,
    rsi14,
    volatilityPct,
    volumeRatio,
    volumeChangePct,
    volumeAccelerationPct,
    mfi14,
    obvSlope,
    support,
    resistance,
    atrPct,
    lastUpdated: new Date(lastCandle.closeTime).toISOString(),
  };

  const localSignal = deriveLocalSignal(metrics);

  const contextPayload = {
    symbol,
    price: round(lastPrice, 2),
    change_1m_pct: round(change1mPct, 2),
    change_5m_pct: round(change5mPct, 2),
    change_15m_pct: round(change15mPct, 2),
    sma_fast: round(sma5, 2),
    sma_slow: round(sma15, 2),
    ema_21: round(ema21, 2),
    ema_55: round(ema55, 2),
    rsi_14: round(rsi14, 2),
    vol_ratio: round(volumeRatio, 2),
    vol_change_pct: round(volumeChangePct, 2),
    vol_accel_pct: round(volumeAccelerationPct, 2),
    mfi_14: round(mfi14, 2),
    obv_slope_pct: round(obvSlope * 100, 2),
    volatility_pct: round(volatilityPct, 3),
    support: round(support, 2),
    resistance: round(resistance, 2),
    local_signal: localSignal,
    atr_pct: round(atrPct, 3),
    edge_score: localSignal.edgeScore,
    updated_at: metrics.lastUpdated,
  };

  return {
    symbol,
    interval,
    candles,
    metrics: { ...metrics, localSignal },
    promptContext: JSON.stringify(contextPayload),
  };
}

export async function getMarketSnapshot(binance, symbol, options = {}) {
  const interval = options.interval ?? '1m';
  const requestedLimit = options.limit ?? 240;
  const limit = Math.max(90, Math.min(requestedLimit, 500));

  const candles = await binance.fetchKlines(symbol, interval, limit);
  if (!candles || candles.length === 0) {
    throw new Error(`No candles returned for ${symbol}`);
  }

  const [ticker24h, funding, openInterest, takerRatios] = await Promise.all([
    binance.fetch24hTicker(symbol).catch(() => null),
    binance.fetchFundingRate(symbol).catch(() => null),
    binance.fetchOpenInterest(symbol).catch(() => null),
    binance.fetchTakerLongShortRatio(symbol, '5m', 24).catch(() => []),
  ]);

  const snapshot = buildSnapshotFromCandles(symbol, interval, candles);
  const metrics = { ...snapshot.metrics };

  if (ticker24h) {
    metrics.change24hPct = ticker24h.priceChangePercent;
    metrics.lastPrice = Number.isFinite(ticker24h.lastPrice) ? ticker24h.lastPrice : metrics.lastPrice;
    metrics.high24h = ticker24h.highPrice;
    metrics.low24h = ticker24h.lowPrice;
    metrics.volume24h = ticker24h.volume;
    metrics.quoteVolume24h = ticker24h.quoteVolume;
  }

  if (funding) {
    metrics.markPrice = funding.markPrice;
    metrics.indexPrice = funding.indexPrice;
    metrics.fundingRate = funding.lastFundingRate;
    metrics.nextFundingTime = funding.nextFundingTime
      ? new Date(funding.nextFundingTime).toISOString()
      : undefined;
    metrics.estimatedSettlePrice = funding.estimatedSettlePrice;
  }

  if (openInterest) {
    metrics.openInterest = openInterest.openInterest;
    metrics.openInterestTime = openInterest.time
      ? new Date(openInterest.time).toISOString()
      : undefined;
  }

  if (Array.isArray(takerRatios) && takerRatios.length > 0) {
    const totals = takerRatios.reduce(
      (acc, entry) => ({
        buy: acc.buy + (Number.isFinite(entry.buyVolume) ? entry.buyVolume : 0),
        sell: acc.sell + (Number.isFinite(entry.sellVolume) ? entry.sellVolume : 0),
      }),
      { buy: 0, sell: 0 }
    );
    const rawRatio = totals.sell > 0 ? totals.buy / totals.sell : totals.buy > 0 ? 10 : 1;
    const ratio = Math.max(0, Math.min(rawRatio, 10));
    metrics.takerLongShortRatio = ratio;
    metrics.takerLongShortBias = ratio > 1.05 ? 'long' : ratio < 0.95 ? 'short' : 'balanced';
  }

  const context = (() => {
    try {
      return JSON.parse(snapshot.promptContext);
    } catch (_error) {
      return {};
    }
  })();

  if (ticker24h) {
    context.ticker_24h = {
      change_pct: round(ticker24h.priceChangePercent, 2),
      high: round(ticker24h.highPrice, 2),
      low: round(ticker24h.lowPrice, 2),
      volume: round(ticker24h.volume, 2),
      quote_volume: round(ticker24h.quoteVolume, 2),
    };
  }
  if (funding) {
    context.derivatives = {
      funding_rate: round(funding.lastFundingRate * 100, 4),
      next_funding: metrics.nextFundingTime,
      mark_price: round(funding.markPrice, 2),
      index_price: round(funding.indexPrice, 2),
      estimated_settle: round(funding.estimatedSettlePrice, 2),
    };
  }
  if (openInterest) {
    context.open_interest = {
      contracts: round(openInterest.openInterest, 2),
      as_of: metrics.openInterestTime,
    };
  }
  if (Number.isFinite(metrics.takerLongShortRatio)) {
    context.taker_flow = {
      ratio: round(metrics.takerLongShortRatio, 3),
      bias: metrics.takerLongShortBias,
    };
  }

  snapshot.metrics = metrics;
  snapshot.promptContext = JSON.stringify(context);
  return snapshot;
}

export async function getChartSeries(binance, symbol, options = {}) {
  try {
    const snapshot = await getMarketSnapshot(binance, symbol, options);
    return {
      symbol: snapshot.symbol,
      interval: snapshot.interval,
      candles: snapshot.candles.map((candle) => ({
        openTime: candle.openTime,
        closeTime: candle.closeTime,
        open: round(candle.open, 4),
        high: round(candle.high, 4),
        low: round(candle.low, 4),
        close: round(candle.close, 4),
        volume: round(candle.volume, 4),
      })),
      metrics: {
        lastPrice: round(snapshot.metrics.lastPrice, 2),
        change1mPct: round(snapshot.metrics.change1mPct, 2),
        change5mPct: round(snapshot.metrics.change5mPct, 2),
        change15mPct: round(snapshot.metrics.change15mPct, 2),
        change24hPct: round(snapshot.metrics.change24hPct ?? 0, 2),
        ema21: round(snapshot.metrics.ema21, 2),
        ema55: round(snapshot.metrics.ema55, 2),
        rsi14: round(snapshot.metrics.rsi14, 2),
        volatilityPct: round(snapshot.metrics.volatilityPct, 3),
        volumeRatio: round(snapshot.metrics.volumeRatio, 2),
        volumeChangePct: round(snapshot.metrics.volumeChangePct, 2),
        volumeAccelerationPct: round(snapshot.metrics.volumeAccelerationPct, 2),
        mfi14: round(snapshot.metrics.mfi14, 2),
        obvSlopePct: round(snapshot.metrics.obvSlope * 100, 2),
        support: round(snapshot.metrics.support, 2),
        resistance: round(snapshot.metrics.resistance, 2),
        atrPct: round(snapshot.metrics.atrPct, 3),
        high24h: round(snapshot.metrics.high24h ?? 0, 2),
        low24h: round(snapshot.metrics.low24h ?? 0, 2),
        volume24h: round(snapshot.metrics.volume24h ?? 0, 2),
        quoteVolume24h: round(snapshot.metrics.quoteVolume24h ?? 0, 2),
        fundingRatePct: round((snapshot.metrics.fundingRate ?? 0) * 100, 4),
        markPrice: round(snapshot.metrics.markPrice ?? snapshot.metrics.lastPrice, 2),
        indexPrice: round(snapshot.metrics.indexPrice ?? 0, 2),
        estimatedSettlePrice: round(snapshot.metrics.estimatedSettlePrice ?? 0, 2),
        nextFundingTime: snapshot.metrics.nextFundingTime,
        openInterest: round(snapshot.metrics.openInterest ?? 0, 3),
        openInterestTime: snapshot.metrics.openInterestTime,
        takerLongShortRatio: Number.isFinite(snapshot.metrics.takerLongShortRatio)
          ? round(snapshot.metrics.takerLongShortRatio, 3)
          : undefined,
        takerLongShortBias: snapshot.metrics.takerLongShortBias,
        localSignal: snapshot.metrics.localSignal,
        lastUpdated: snapshot.metrics.lastUpdated,
      },
      promptContext: snapshot.promptContext,
    };
  } catch (error) {
    logger.error({ error, symbol }, 'Failed to build chart series');
    throw error;
  }
}
