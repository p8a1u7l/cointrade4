import { useEffect, useMemo, useState } from 'react';

interface EquityPoint {
  timestamp: string;
  equity: number;
  balance: number;
  pnlPercent: number;
}

interface EquitySeriesResponse {
  points: EquityPoint[];
  message?: string;
}

interface EquityChartProps {
  endpoint: string;
  refreshIntervalMs?: number;
}

const chartWidth = 960;
const chartHeight = 360;
const paddingX = 52;
const paddingY = 36;

const formatUsd = (value: number) =>
  value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatTime = (timestamp: string) => {
  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  } catch (_error) {
    return timestamp;
  }
};

export function EquityChart({ endpoint, refreshIntervalMs = 5000 }: EquityChartProps) {
  const [points, setPoints] = useState<EquityPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      try {
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(`Equity request failed: ${response.status}`);
        }
        const payload = (await response.json()) as EquitySeriesResponse;
        if (!cancelled) {
          setPoints(Array.isArray(payload.points) ? payload.points : []);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load equity data');
          setLoading(false);
        }
      }
    }

    void load();
    timer = setInterval(load, refreshIntervalMs);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [endpoint, refreshIntervalMs]);

  const enrichedPoints = useMemo(() => {
    return points
      .map((point) => ({
        ...point,
        time: new Date(point.timestamp).getTime(),
      }))
      .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.equity));
  }, [points]);

  const { minEquity, maxEquity } = useMemo(() => {
    if (enrichedPoints.length === 0) {
      return { minEquity: 0, maxEquity: 1 };
    }
    let min = enrichedPoints[0].equity;
    let max = enrichedPoints[0].equity;
    for (const point of enrichedPoints) {
      if (point.equity < min) min = point.equity;
      if (point.equity > max) max = point.equity;
    }
    if (min === max) {
      min -= 1;
      max += 1;
    }
    return { minEquity: min, maxEquity: max };
  }, [enrichedPoints]);

  const chartPoints = useMemo(() => {
    if (enrichedPoints.length === 0) return [] as { x: number; y: number; equity: number; timestamp: string }[];
    const usableWidth = chartWidth - paddingX * 2;
    const usableHeight = chartHeight - paddingY * 2;
    const step = enrichedPoints.length > 1 ? usableWidth / (enrichedPoints.length - 1) : 0;
    return enrichedPoints.map((point, index) => {
      const ratio = (point.equity - minEquity) / (maxEquity - minEquity);
      const x = paddingX + index * step;
      const y = chartHeight - paddingY - ratio * usableHeight;
      return { x, y, equity: point.equity, timestamp: point.timestamp };
    });
  }, [enrichedPoints, minEquity, maxEquity]);

  const pathD = useMemo(() => {
    if (chartPoints.length === 0) return '';
    return chartPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' ');
  }, [chartPoints]);

  const areaD = useMemo(() => {
    if (chartPoints.length === 0) return '';
    const first = chartPoints[0];
    const last = chartPoints[chartPoints.length - 1];
    const baselineY = chartHeight - paddingY;
    return `${pathD} L ${last.x.toFixed(2)} ${baselineY} L ${first.x.toFixed(2)} ${baselineY} Z`;
  }, [chartPoints, pathD]);

  const latestPoint = chartPoints[chartPoints.length - 1];
  const earliestPoint = chartPoints[0];

  const changePct = useMemo(() => {
    if (!earliestPoint || !latestPoint) return 0;
    const start = earliestPoint.equity;
    const end = latestPoint.equity;
    if (!Number.isFinite(start) || start === 0) return 0;
    return ((end - start) / start) * 100;
  }, [earliestPoint, latestPoint]);

  return (
    <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_30px_70px_-55px_rgba(14,165,233,0.45)]">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-white">Equity balance</h2>
          {latestPoint && (
            <p className="text-sm text-slate-300/80">
              Latest {formatUsd(latestPoint.equity)} · Session change {changePct >= 0 ? '+' : ''}
              {changePct.toFixed(2)}% · Updated {formatTime(latestPoint.timestamp)}
            </p>
          )}
        </div>
        {earliestPoint && latestPoint && (
          <div className="grid grid-cols-2 gap-3 text-xs text-slate-300/80 sm:grid-cols-4">
            <div>
              <span className="block text-[0.7rem] uppercase tracking-[0.35em] text-slate-400/60">Opening</span>
              <span className="text-sm font-semibold text-white">{formatUsd(earliestPoint.equity)}</span>
            </div>
            <div>
              <span className="block text-[0.7rem] uppercase tracking-[0.35em] text-slate-400/60">Peak</span>
              <span className="text-sm font-semibold text-emerald-200">{formatUsd(maxEquity)}</span>
            </div>
            <div>
              <span className="block text-[0.7rem] uppercase tracking-[0.35em] text-slate-400/60">Drawdown</span>
              <span className="text-sm font-semibold text-rose-200">{formatUsd(minEquity)}</span>
            </div>
            <div>
              <span className="block text-[0.7rem] uppercase tracking-[0.35em] text-slate-400/60">Points</span>
              <span className="text-sm font-semibold text-white">{chartPoints.length}</span>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-[360px] w-full animate-pulse rounded-2xl bg-slate-800/40" />
      ) : error ? (
        <div className="flex h-[360px] items-center justify-center rounded-2xl border border-rose-400/40 bg-rose-500/10 text-sm text-rose-100">
          {error}
        </div>
      ) : chartPoints.length < 2 ? (
        <div className="flex h-[360px] items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 text-sm text-slate-300/70">
          Not enough equity history yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-b from-slate-900/60 to-slate-950/90">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-full w-full">
            <defs>
              <linearGradient id="equityGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(14,165,233,0.45)" />
                <stop offset="100%" stopColor="rgba(15,23,42,0.05)" />
              </linearGradient>
              <linearGradient id="equityStroke" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="rgba(14,165,233,0.7)" />
                <stop offset="100%" stopColor="rgba(14,165,233,0.35)" />
              </linearGradient>
              <pattern id="equityGrid" width="80" height="40" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
              </pattern>
            </defs>

            <rect x="0" y="0" width={chartWidth} height={chartHeight} fill="url(#equityGrid)" />
            <path d={areaD} fill="url(#equityGradient)" opacity={0.9} />
            <path d={pathD} fill="none" stroke="url(#equityStroke)" strokeWidth={3} strokeLinecap="round" />

            {chartPoints.map((point, index) =>
              index % Math.max(1, Math.floor(chartPoints.length / 6)) === 0 || index === chartPoints.length - 1 ? (
                <g key={`${point.timestamp}-${index}`}>
                  <line
                    x1={point.x}
                    x2={point.x}
                    y1={chartHeight - paddingY}
                    y2={chartHeight - paddingY + 8}
                    stroke="rgba(148,163,184,0.4)"
                    strokeWidth={1}
                  />
                  <text
                    x={point.x}
                    y={chartHeight - paddingY + 24}
                    textAnchor="middle"
                    className="fill-white/80 text-[10px]"
                  >
                    {formatTime(point.timestamp)}
                  </text>
                </g>
              ) : null
            )}

            <g>
              <line
                x1={paddingX}
                x2={chartWidth - paddingX}
                y1={chartPoints[chartPoints.length - 1].y}
                y2={chartPoints[chartPoints.length - 1].y}
                stroke="rgba(56,189,248,0.35)"
                strokeDasharray="6 6"
                strokeWidth={1}
              />
              <text
                x={chartWidth - paddingX + 8}
                y={chartPoints[chartPoints.length - 1].y + 4}
                className="fill-white text-[11px]"
              >
                {formatUsd(chartPoints[chartPoints.length - 1].equity)}
              </text>
            </g>
          </svg>
        </div>
      )}
    </div>
  );
}
