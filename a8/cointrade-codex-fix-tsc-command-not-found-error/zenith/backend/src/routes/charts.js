import { Router } from '../http/router.js';
import { getChartSeries } from '../services/marketIntelligence.js';
import { logger } from '../utils/logger.js';

const ALLOWED_INTERVALS = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '4h']);

export function createChartsRouter(binance) {
  const router = new Router();

  router.get('/:symbol', async (req, res) => {
    const symbol = req.params.symbol?.toUpperCase();
    if (!symbol) {
      res.status(400).json({ error: 'Symbol is required' });
      return;
    }

    const intervalRaw = typeof req.query.interval === 'string' ? req.query.interval : undefined;
    const interval = intervalRaw && ALLOWED_INTERVALS.has(intervalRaw) ? intervalRaw : '1m';
    const requestedLimit = Number(req.query.limit ?? '120');
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 120;
    const safeLimit = Math.max(30, Math.min(500, limit));

    try {
      const series = await getChartSeries(binance, symbol, {
        interval,
        limit: safeLimit,
      });
      res.json(series);
    } catch (error) {
      logger.error({ error, symbol, interval, limit: safeLimit }, 'Failed to fetch chart data');
      res.status(502).json({ error: 'Unable to load chart data' });
    }
  });

  return router;
}
