import clsx from 'clsx';

interface Props {
  title: string;
  value: number;
  prefix?: string;
  suffix?: string;
  loading?: boolean;
  accent?: 'positive' | 'negative';
}

export function MetricCard({ title, value, prefix, suffix, loading, accent }: Props) {
  const formatted = Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '--';
  const accentClass = clsx({
    'text-emerald-300': accent === 'positive',
    'text-rose-300': accent === 'negative',
    'text-white': !accent,
  });

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_25px_65px_-40px_rgba(148,163,184,0.65)]">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="text-xs uppercase tracking-[0.35em] text-slate-300/80">{title}</div>
      <div className={clsx('mt-3 text-4xl font-semibold', accentClass)}>
        {loading ? '…' : `${prefix ?? ''}${formatted}${suffix ?? ''}`}
      </div>
    </div>
  );
}
