import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { dashboardConfig } from './config';
import { ControlPanel } from './components/ControlPanel';
import { MetricCard } from './components/MetricCard';
import { MoversBoard } from './components/MoversBoard';
import { EquityChart } from './components/EquityChart';

interface MetricsPayload {
  balance: number;
  equity: number;
  pnlPercent: number;
  realized: number;
  riskLevel: number;
  openAi?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    inputCost: number;
    outputCost: number;
    totalCost: number;
    calls?: number;
    byModel?: {
      model: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      inputCost: number;
      outputCost: number;
      totalCost: number;
    }[];
  };
}

interface HealthPayload {
  running: boolean;
  riskLevel: number;
}

export default function App() {
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [riskLevel, setRiskLevel] = useState(3);
  const openAiUsage = metrics?.openAi;
  const totalCalls = openAiUsage?.calls ?? 0;
  const primaryModel = openAiUsage?.byModel && openAiUsage.byModel.length > 0 ? openAiUsage.byModel[0] : null;
  const callsLabel = totalCalls === 1 ? 'call' : 'calls';
  const primaryModelDetail =
    primaryModel && primaryModel.model
      ? ` · Primary ${primaryModel.model} (${primaryModel.calls.toLocaleString()} ${
          primaryModel.calls === 1 ? 'call' : 'calls'
        })`
      : '';

  const formatUsd = (value: number) =>
    value.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 6,
      maximumFractionDigits: 6,
    });

  useEffect(() => {
    void initialize();
    const metricsInterval = setInterval(refreshMetrics, 5000);
    const healthInterval = setInterval(refreshHealth, 7000);
    return () => {
      clearInterval(metricsInterval);
      clearInterval(healthInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initialize() {
    await Promise.all([refreshMetrics(), refreshHealth()]);
  }

  async function refreshMetrics() {
    if (!dashboardConfig.metricsEndpoint) return;
    try {
      const response = await fetch(dashboardConfig.metricsEndpoint);
      if (!response.ok) throw new Error(`Metrics request failed: ${response.status}`);
      const payload = (await response.json()) as MetricsPayload;
      setMetrics(payload);
      if (typeof payload.riskLevel === 'number') {
        setRiskLevel(payload.riskLevel);
      }
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }

  async function refreshHealth() {
    try {
      const response = await fetch(`${dashboardConfig.apiBaseUrl}/health`);
      if (!response.ok) throw new Error(`Health request failed: ${response.status}`);
      const payload = (await response.json()) as HealthPayload;
      setRunning(payload.running);
      if (typeof payload.riskLevel === 'number') {
        setRiskLevel(payload.riskLevel);
      }
    } catch (err) {
      console.error('Failed to refresh engine health', err);
    }
  }

  async function updateRisk(level: number) {
    try {
      const response = await fetch(`${dashboardConfig.apiBaseUrl}/control/risk/${level}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to set risk');
      setRiskLevel(level);
      await refreshMetrics();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  async function toggleEngine(shouldRun: boolean) {
    try {
      const response = await fetch(`${dashboardConfig.apiBaseUrl}/control/${shouldRun ? 'start' : 'stop'}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to toggle engine');
      setRunning(shouldRun);
      await refreshHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-[-25%] h-[36rem] bg-gradient-to-br from-emerald-500/20 via-cyan-500/15 to-transparent blur-3xl" />
        <div className="absolute inset-x-0 bottom-[-40%] h-[40rem] bg-gradient-to-tr from-rose-500/15 via-purple-500/10 to-transparent blur-3xl" />
      </div>

      <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-8xl flex-col gap-8 px-6 py-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm uppercase tracking-[0.45em] text-slate-300/70">Helios</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Autonomous futures command console
            </h1>
            <p className="mt-4 text-base text-slate-300/90">
              Monitor GPT-driven execution, dial in risk appetite, and track realized performance across your Binance futures
              book in real time.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
              <span className={clsx('inline-flex h-2 w-2 rounded-full', running ? 'bg-emerald-400' : 'bg-rose-400')} />
              {running ? 'Engine online' : 'Engine paused'}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
              <span className="text-xs uppercase tracking-[0.35em] text-slate-400/80">Risk</span>
              <span className="text-base font-semibold text-white">{riskLevel}</span>
            </div>
            <div className="flex gap-3">
              <button
                className={clsx(
                  'rounded-full px-5 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-300/60',
                  running
                    ? 'border border-emerald-400/60 bg-emerald-500/20 text-emerald-100 cursor-not-allowed opacity-70'
                    : 'border border-emerald-400/60 bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/40'
                )}
                onClick={() => toggleEngine(true)}
                disabled={running}
              >
                Start engine
              </button>
              <button
                className={clsx(
                  'rounded-full px-5 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-rose-300/60',
                  !running
                    ? 'border border-rose-400/60 bg-rose-500/20 text-rose-100 cursor-not-allowed opacity-70'
                    : 'border border-rose-400/60 bg-rose-500/20 text-rose-100 hover:bg-rose-500/35'
                )}
                onClick={() => toggleEngine(false)}
                disabled={!running}
              >
                Stop engine
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-8xl px-6 py-12">
        <div className="grid grid-cols-1 gap-10 2xl:grid-cols-[3fr_1.1fr]">
          <section className="space-y-8">
            <EquityChart endpoint={dashboardConfig.equityEndpoint} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Balance" value={metrics?.balance ?? 0} prefix="$" loading={loading} />
              <MetricCard title="Equity" value={metrics?.equity ?? 0} prefix="$" loading={loading} />
              <MetricCard
                title="Cumulative PnL"
                value={metrics?.pnlPercent ?? 0}
                suffix="%"
                loading={loading}
                accent={metrics && metrics.pnlPercent >= 0 ? 'positive' : 'negative'}
              />
              <MetricCard title="Realized" value={metrics?.realized ?? 0} prefix="$" loading={loading} />
            </div>

            <MoversBoard endpoint={dashboardConfig.moversEndpoint} />
          </section>

          <aside className="space-y-6">
            <ControlPanel
              riskLevel={riskLevel}
              onRiskChange={updateRisk}
              running={running}
              signalsEndpoint={dashboardConfig.signalsEndpoint}
            />

            {error && (
              <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 px-5 py-4 text-sm text-rose-100 shadow-[0_25px_70px_-50px_rgba(244,63,94,0.6)]">
                {error}
              </div>
            )}
          </aside>
        </div>
      </main>

      <footer className="border-t border-white/10 bg-slate-950/80">
        <div className="mx-auto flex w-full max-w-8xl flex-col gap-4 px-6 py-6 text-sm text-slate-300/90 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-[0.35em] text-slate-400/80">OpenAI usage</span>
            {openAiUsage ? (
              <>
                <span className="text-base font-medium text-white">
                  {`${openAiUsage.totalTokens.toLocaleString()} tokens · ${formatUsd(openAiUsage.totalCost)}`}
                </span>
                <span className="text-xs text-slate-300/70">
                  {`${totalCalls.toLocaleString()} ${callsLabel}${primaryModelDetail}`}
                </span>
              </>
            ) : (
              <span className="text-base font-medium text-white/60">No usage recorded</span>
            )}
          </div>
          {openAiUsage && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300/80">
              <span>
                Prompt: {openAiUsage.promptTokens.toLocaleString()} tokens ({formatUsd(openAiUsage.inputCost)})
              </span>
              <span>
                Completion: {openAiUsage.completionTokens.toLocaleString()} tokens ({formatUsd(openAiUsage.outputCost)})
              </span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
