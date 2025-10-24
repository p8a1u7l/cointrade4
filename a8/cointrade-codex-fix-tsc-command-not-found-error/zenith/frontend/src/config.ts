const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

const parseSymbols = (value: string | undefined) =>
  (value ?? 'BTCUSDT,ETHUSDT')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);

export const dashboardConfig = {
  apiBaseUrl,
  metricsEndpoint: import.meta.env.VITE_METRICS_ENDPOINT ?? `${apiBaseUrl}/metrics`,
  equityEndpoint: import.meta.env.VITE_EQUITY_ENDPOINT ?? `${apiBaseUrl}/metrics/equity/series`,
  moversEndpoint: import.meta.env.VITE_MOVERS_ENDPOINT ?? `${apiBaseUrl}/movers`,
  signalsEndpoint: import.meta.env.VITE_SIGNALS_ENDPOINT ?? `${apiBaseUrl}/signals`,
  chartsEndpoint: import.meta.env.VITE_CHARTS_ENDPOINT ?? `${apiBaseUrl}/charts`,
  symbols: parseSymbols(import.meta.env.VITE_SYMBOLS),
};

export type DashboardConfig = typeof dashboardConfig;
