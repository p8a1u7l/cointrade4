import { useEffect, useMemo, useState } from 'react';

interface ChartCandle {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LocalSignal {
  bias: 'long' | 'short' | 'flat';
  confidence: number;
  reasoning: string;
  edgeScore?: number;
  longScore?: number;
  shortScore?: number;
}

interface ChartMetrics {
  lastPrice: number;
  change1mPct: number;
  change5mPct: number;
  change15mPct: number;
  ema21: number;
  ema55: number;
  rsi14: number;
  volatilityPct: number;
  volumeRatio: number;
  support: number;
  resistance: number;
  atrPct: number;
  localSignal: LocalSignal;
  lastUpdated: string;
}

interface ChartResponse {
  symbol: string;
  interval: string;
  candles: ChartCandle[];
  metrics: ChartMetrics;
}

interface PriceChartProps {
  symbol: string;
  endpoint: string;
}

const chartWidth = 720;
const chartHeight = 320;
const paddingX = 48;
const paddingY = 32;

const percentLabel = (value: number) => {
  const formatted = value.toFixed(2);
  return value > 0 ? `+${formatted}%` : `${formatted}%`;
};

const formatTimestamp = (value: number) => {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  return formatter.format(new Date(value));
};

export function PriceChart({ symbol, endpoint }: PriceChartProps) {
  const [data, setData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`${endpoint}/${encodeURIComponent(symbol)}`);
        if (!response.ok) {
          throw new Error(`Chart request failed: ${response.status}`);
        }
        const payload = (await response.json()) as ChartResponse;
        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load chart');
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [endpoint, symbol]);

  const candles = data?.candles ?? [];

  const { minPrice, maxPrice } = useMemo(() => {
    if (candles.length === 0) {
      return { minPrice: 0, maxPrice: 1 };
    }
    let min = candles[0].low;
    let max = candles[0].high;
    for (const candle of candles) {
      if (candle.low < min) min = candle.low;
      if (candle.high > max) max = candle.high;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    return { minPrice: min, maxPrice: max };
  }, [candles]);

  const yScale = (value: number) => {
    if (maxPrice === minPrice) return chartHeight / 2;
    const usableHeight = chartHeight - paddingY * 2;
    const ratio = (value - minPrice) / (maxPrice - minPrice);
    return chartHeight - paddingY - ratio * usableHeight;
  };

  const xStep = candles.length > 1 ? (chartWidth - paddingX * 2) / (candles.length - 1) : 0;
  const bodyWidth = Math.max(2, xStep * 0.6);

  const labelIndices = useMemo(() => {
    if (candles.length === 0) return [] as number[];
    const indices = [0, Math.floor(candles.length / 2), candles.length - 1];
    return Array.from(new Set(indices)).filter((index) => index >= 0 && index < candles.length);
  }, [candles]);

  const metrics = data?.metrics;

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_25px_70px_-50px_rgba(15,118,110,0.45)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{symbol} price action</h2>
          {metrics && (
            <p className="text-sm text-slate-300/80">
              Last {metrics.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ·
              Δ1m {percentLabel(metrics.change1mPct)} · Δ5m {percentLabel(metrics.change5mPct)} · Δ15m{' '}
              {percentLabel(metrics.change15mPct)}
            </p>
          )}
        </div>
        {metrics && (
          <div className="flex flex-col items-start gap-1 text-xs text-slate-300/70 md:items-end">
            <span>
              RSI 14: <span className="font-semibold text-white">{metrics.rsi14.toFixed(1)}</span>
            </span>
            <span>
              EMA(21/55):{' '}
              <span className="font-semibold text-white">
                {metrics.ema21.toFixed(1)} / {metrics.ema55.toFixed(1)}
              </span>
            </span>
            <span>
              Local bias: <span className="font-semibold text-white">{metrics.localSignal.bias}</span>{' '}
              ({metrics.localSignal.confidence.toFixed(2)})
            </span>
            {typeof metrics.localSignal.edgeScore === 'number' && (
              <span>
                Edge: <span className="font-semibold text-white">{(metrics.localSignal.edgeScore * 100).toFixed(0)}%</span>
              </span>
            )}
            <span>
              Volatility σ: <span className="font-semibold text-white">{metrics.volatilityPct.toFixed(3)}%</span>
            </span>
            <span>
              ATR%: <span className="font-semibold text-white">{metrics.atrPct.toFixed(3)}%</span>
            </span>
            <span>Updated {new Date(metrics.lastUpdated).toLocaleTimeString()}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-[320px] w-full animate-pulse rounded-2xl bg-slate-800/40" />
      ) : error ? (
        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-rose-400/40 bg-rose-500/10 text-sm text-rose-100">
          {error}
        </div>
      ) : candles.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 text-sm text-slate-300/70">
          No price history available.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/60 to-slate-950/90">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full w-full">
            <defs>
              <linearGradient id="gridGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(148, 163, 184, 0.2)" />
                <stop offset="100%" stopColor="rgba(148, 163, 184, 0.05)" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = paddingY + (chartHeight - paddingY * 2) * ratio;
              const priceLevel = maxPrice - (maxPrice - minPrice) * ratio;
              return (
                <g key={ratio}>
                  <line
                    x1={paddingX}
                    x2={chartWidth - paddingX}
                    y1={y}
                    y2={y}
                    stroke="url(#gridGradient)"
                    strokeWidth={1}
                  />
                  <text
                    x={chartWidth - paddingX + 6}
                    y={y + 4}
                    className="fill-slate-400/70 text-[10px]"
                  >
                    {priceLevel.toFixed(2)}
                  </text>
                </g>
              );
            })}

            {candles.map((candle, index) => {
              const x = paddingX + index * xStep;
              const isBull = candle.close >= candle.open;
              const color = isBull ? '#34d399' : '#f87171';
              const openY = yScale(candle.open);
              const closeY = yScale(candle.close);
              const highY = yScale(candle.high);
              const lowY = yScale(candle.low);
              const bodyTop = Math.min(openY, closeY);
              const bodyHeight = Math.max(Math.abs(closeY - openY), 2);

              return (
                <g key={candle.openTime}>
                  <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth={1.2} />
                  <rect
                    x={x - bodyWidth / 2}
                    y={bodyTop}
                    width={bodyWidth}
                    height={bodyHeight}
                    fill={color}
                    opacity={0.8}
                    rx={bodyWidth * 0.25}
                  />
                </g>
              );
            })}

            {labelIndices.map((index) => {
              const candle = candles[index];
              const x = paddingX + index * xStep;
              return (
                <text key={candle.openTime} x={x} y={chartHeight - 8} textAnchor="middle" className="fill-slate-400/70 text-[10px]">
                  {formatTimestamp(candle.closeTime)}
                </text>
              );
            })}
          </svg>
        </div>
      )}

      {metrics && (
        <div className="grid gap-4 text-xs text-slate-300/70 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400/80">Support / Resistance</p>
            <p className="mt-1 text-sm text-white">
              {metrics.support.toLocaleString(undefined, { maximumFractionDigits: 2 })} ·{' '}
              {metrics.resistance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400/80">Volume &amp; Risk</p>
            <p className="mt-1 text-sm text-white">{metrics.volumeRatio.toFixed(2)}× volume impulse</p>
            <p className="text-[11px] text-slate-200/70">ATR {metrics.atrPct.toFixed(2)}%</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.28em] text-slate-400/80">Local reasoning</p>
            <p className="mt-1 text-sm text-white/80">{metrics.localSignal.reasoning}</p>
            {typeof metrics.localSignal.longScore === 'number' && typeof metrics.localSignal.shortScore === 'number' && (
              <p className="mt-1 text-[11px] text-slate-200/70">
                Long score {metrics.localSignal.longScore.toFixed(2)} · Short score {metrics.localSignal.shortScore.toFixed(2)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
