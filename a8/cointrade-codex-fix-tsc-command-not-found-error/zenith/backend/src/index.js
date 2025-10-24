import { config } from './config.js';
import { createApp } from './http/app.js';
import { createControlRouter } from './routes/control.js';
import { createRunRouter } from './routes/run.js';
import { createFapiRouter } from './routes/fapi.js';
import { createHealthRouter } from './routes/health.js';
import { createMetricsRouter } from './routes/metrics.js';
import { createMoversRouter } from './routes/movers.js';
import { createSignalsRouter } from './routes/signals.js';
import { createChartsRouter } from './routes/charts.js';
import { TradingEngine } from './services/tradingEngine.js';
import { BinanceClient } from './clients/binanceClient.js';
import { logger } from './utils/logger.js';

export function startOrchestrator(port = config.port) {
  const engine = new TradingEngine(config.binance.symbols);
  const binance = new BinanceClient();
  const app = createApp();

  app.use('/control', createControlRouter(engine));
  app.use('/run', createRunRouter(engine));
  app.use('/fapi', createFapiRouter(binance));
  app.use('/health', createHealthRouter(engine));
  app.use('/metrics', createMetricsRouter(engine, binance));
  app.use('/movers', createMoversRouter(engine));
  app.use('/signals', createSignalsRouter());
  app.use('/charts', createChartsRouter(binance));

  app.setErrorHandler((error, _req, res) => {
    logger.error({ error }, 'Unhandled error');
    if (!res.finished) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const server = app.listen(port, () => {
    logger.info({ port }, 'Zenith orchestrator listening');
  });

  const shutdown = async () => {
    engine.stop();
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
  };

  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, () => {
      logger.info({ signal }, 'Shutting down');
      void shutdown().then(() => process.exit(0));
    });
  });

  return {
    engine,
    async close() {
      signals.forEach((signal) => process.removeAllListeners(signal));
      await shutdown();
    },
  };
}

if (import.meta.url === new URL(`file://${process.argv[1] ?? ''}`).href) {
  startOrchestrator();
}
