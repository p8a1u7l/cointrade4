import clsx from 'clsx';
import { useEffect, useState } from 'react';

interface Props {
  endpoint: string;
}

interface SymbolMover {
  symbol: string;
  rank?: number;
  changePct: number;
  quoteVolume: number;
  baseVolume: number;
  lastPrice: number;
  direction?: 'up' | 'down';
  score?: number;
}

export function MoversBoard({ endpoint }: Props) {
  const [top, setTop] = useState<SymbolMover[]>([]);
  const [bottom, setBottom] = useState<SymbolMover[]>([]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 7000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  async function refresh() {
    if (!endpoint) {
      setTop([]);
      setBottom([]);
      return;
    }

    try {
      const response = await fetch(endpoint);
      if (!response.ok) throw new Error(`Failed to fetch movers: ${response.status}`);
      const payload = (await response.json()) as { top: SymbolMover[]; bottom: SymbolMover[] };
      setTop(payload.top ?? []);
      setBottom(payload.bottom ?? []);
    } catch (err) {
      console.error('Failed to refresh movers', err);
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_35px_120px_-60px_rgba(16,185,129,0.6)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-white">Symbol momentum</h2>
        <span className="text-xs uppercase tracking-[0.3em] text-slate-300/70">24h change</span>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-emerald-300/80">Leaders</h3>
          <div className="mt-3 space-y-3">
            {top.length === 0 && <Placeholder label="No leaders yet" />}
            {top.map((item) => (
              <SymbolRow key={`${item.symbol}-top`} item={item} positive />
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-rose-300/80">Laggards</h3>
          <div className="mt-3 space-y-3">
            {bottom.length === 0 && <Placeholder label="No laggards yet" />}
            {bottom.map((item) => (
              <SymbolRow key={`${item.symbol}-bottom`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNumber(value: number, options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, options) : '--';
}

interface SymbolRowProps {
  item: SymbolMover;
  positive?: boolean;
  key?: string;
}

function SymbolRow({ item, positive }: SymbolRowProps) {
  const change = item.changePct;
  const changeLabel = `${change >= 0 ? '+' : ''}${formatNumber(change, { maximumFractionDigits: 2 })}%`;
  const volumeLabel = formatCompact(item.quoteVolume);
  const priceLabel = Number.isFinite(item.lastPrice) ? `$${formatNumber(item.lastPrice, { maximumFractionDigits: 2 })}` : '--';
  const badge = typeof item.rank === 'number' ? `#${item.rank}` : item.direction?.toUpperCase();

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/50 p-4 transition hover:border-white/20">
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-white/5 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{item.symbol}</div>
          <div className="mt-1 text-xs text-slate-300">
            {priceLabel} · Vol {volumeLabel}
          </div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400/70">{badge ?? '—'}</div>
        </div>
        <div className="text-right">
          <div
            className={clsx(
              'text-base font-semibold',
              positive ? 'text-emerald-300 drop-shadow-[0_0_12px_rgba(16,185,129,0.55)]' : 'text-rose-300 drop-shadow-[0_0_12px_rgba(244,63,94,0.55)]'
            )}
          >
            {changeLabel}
          </div>
          {typeof item.score === 'number' && (
            <div className="mt-1 text-[11px] uppercase tracking-wide text-slate-400/70">Score {formatNumber(item.score, { maximumFractionDigits: 2 })}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-slate-400">
      {label}
    </div>
  );
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}
