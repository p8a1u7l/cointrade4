import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface PerformanceEntry {
  symbol: string;
  realized_pnl: number;
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  win_rate: number;
  net_contracts: number;
  avg_entry_price: number;
  total_volume: number;
  last_updated?: string;
}

interface Props {
  entries: PerformanceEntry[];
  loading?: boolean;
}

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat(undefined, {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0,
});

export function PerformanceBoard({ entries, loading = false }: Props) {
  const sorted = [...entries].sort((a, b) => b.realized_pnl - a.realized_pnl);

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-[0_35px_120px_-60px_rgba(37,99,235,0.55)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Realized PnL by symbol</h2>
          <p className="text-sm text-slate-300/80">Live breakdown of how much each market has contributed.</p>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-slate-800/40" />
      ) : sorted.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-900/60 px-6 py-12 text-center text-sm text-slate-300/80">
          No realized trades have been recorded yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/5 bg-slate-950/80">
          <table className="min-w-full divide-y divide-white/5 text-sm">
            <thead className="bg-slate-900/70">
              <tr>
                <HeaderCell>Symbol</HeaderCell>
                <HeaderCell align="right">Realized PnL</HeaderCell>
                <HeaderCell align="right">Win rate</HeaderCell>
                <HeaderCell align="right">Trades</HeaderCell>
                <HeaderCell align="right">Wins / Losses</HeaderCell>
                <HeaderCell align="right">Net contracts</HeaderCell>
                <HeaderCell align="right">Avg entry</HeaderCell>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sorted.map((entry) => {
                const realizedClass = entry.realized_pnl >= 0 ? 'text-emerald-300' : 'text-rose-300';
                const winRateLabel = percentFormatter.format((entry.win_rate ?? 0) / 100);
                const tradesLabel = integerFormatter.format(entry.trades ?? 0);
                const winsLabel = integerFormatter.format(entry.wins ?? 0);
                const lossesLabel = integerFormatter.format(entry.losses ?? 0);
                const netContractsLabel = entry.net_contracts.toLocaleString(undefined, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                });
                const avgEntryLabel = currencyFormatter.format(entry.avg_entry_price ?? 0);

                return (
                  <tr key={entry.symbol} className="hover:bg-white/5">
                    <Cell>
                      <div className="font-semibold text-white">{entry.symbol}</div>
                      {entry.total_volume > 0 && (
                        <div className="text-xs text-slate-400/80">
                          Volume {entry.total_volume.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                      )}
                    </Cell>
                    <Cell align="right">
                      <span className={clsx('font-semibold', realizedClass)}>
                        {currencyFormatter.format(entry.realized_pnl ?? 0)}
                      </span>
                    </Cell>
                    <Cell align="right">
                      <span className="font-semibold text-white">{winRateLabel}</span>
                    </Cell>
                    <Cell align="right">
                      <span className="text-slate-200">{tradesLabel}</span>
                    </Cell>
                    <Cell align="right">
                      <span className="text-slate-200">{winsLabel}</span>
                      <span className="mx-1 text-slate-500">/</span>
                      <span className="text-slate-200">{lossesLabel}</span>
                    </Cell>
                    <Cell align="right">
                      <span className="text-slate-200">{netContractsLabel}</span>
                    </Cell>
                    <Cell align="right">
                      <span className="text-slate-200">{avgEntryLabel}</span>
                    </Cell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface HeaderCellProps {
  children: ReactNode;
  align?: 'left' | 'right';
}

function HeaderCell({ children, align = 'left' }: HeaderCellProps) {
  return (
    <th
      scope="col"
      className={clsx('px-4 py-3 text-[11px] uppercase tracking-[0.35em] text-slate-300/70', {
        'text-right': align === 'right',
        'text-left': align === 'left',
      })}
    >
      {children}
    </th>
  );
}

interface CellProps {
  children: ReactNode;
  align?: 'left' | 'right';
}

function Cell({ children, align = 'left' }: CellProps) {
  return (
    <td
      className={clsx('px-4 py-4 align-middle text-sm text-slate-300/90', {
        'text-right': align === 'right',
        'text-left': align === 'left',
      })}
    >
      {children}
    </td>
  );
}

