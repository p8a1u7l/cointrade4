interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_METRICS_ENDPOINT: string;
  readonly VITE_MOVERS_ENDPOINT: string;
  readonly VITE_SIGNALS_ENDPOINT: string;
  readonly VITE_CHARTS_ENDPOINT: string;
  readonly VITE_EQUITY_ENDPOINT?: string;
  readonly VITE_SYMBOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'vite/client' {
  export interface ImportMetaEnv extends globalThis.ImportMetaEnv {}
  export interface ImportMeta extends globalThis.ImportMeta {}
}
