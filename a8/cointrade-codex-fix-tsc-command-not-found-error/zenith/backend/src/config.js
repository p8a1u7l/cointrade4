import { loadEnvFile } from './utils/env.js';

loadEnvFile();

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const parseNumber = (value, fallback) => {
  const source = value ?? fallback;
  const numeric = Number(source);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid numeric configuration: ${source}`);
  }
  return numeric;
};

const parseSymbols = (value) => {
  const raw = value && value.trim().length > 0 ? value : 'BTCUSDT,ETHUSDT';
  return raw
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => symbol.length > 0);
};

const parseList = (value, fallback) => {
  const source = value && value.trim().length > 0 ? value : fallback;
  return source
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseNumber(process.env.PORT, 8080),
  binance: {
    apiKey: requireEnv('BINANCE_API_KEY'),
    apiSecret: requireEnv('BINANCE_API_SECRET'),
    useTestnet: (process.env.BINANCE_USE_TESTNET ?? 'true') === 'true',
    symbols: parseSymbols(process.env.BINANCE_SYMBOLS),
    symbolDiscovery: {
      enabled: (process.env.SYMBOL_DISCOVERY_ENABLED ?? 'true') === 'true',
      refreshIntervalSeconds: parseNumber(process.env.SYMBOL_DISCOVERY_REFRESH_SECONDS, 180),
      topMoverLimit: parseNumber(process.env.SYMBOL_DISCOVERY_TOP_LIMIT, 400),
      maxActiveSymbols: parseNumber(process.env.SYMBOL_DISCOVERY_MAX_ACTIVE, 400),
      minQuoteVolume: parseNumber(process.env.SYMBOL_DISCOVERY_MIN_QUOTE_VOLUME, 5_000_000),
      quoteAssets: parseList(process.env.SYMBOL_DISCOVERY_QUOTE_ASSETS, 'USDT'),
      routeLimit: parseNumber(process.env.SYMBOL_DISCOVERY_ROUTE_LIMIT, 10),
    },
  },
  openAi: {
    apiKey: requireEnv('OPENAI_API_KEY'),
  },
  trading: {
    initialBalance: parseNumber(process.env.INITIAL_BALANCE, 100_000),
    loopIntervalSeconds: parseNumber(process.env.LOOP_INTERVAL_SECONDS, 30),
    maxPositionLeverage: parseNumber(process.env.MAX_POSITION_LEVERAGE, 5),
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
};
