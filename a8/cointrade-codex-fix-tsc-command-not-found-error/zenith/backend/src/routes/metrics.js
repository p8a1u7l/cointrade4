import { Router } from '../http/router.js';
import { analyticsStore } from '../store/analyticsStore.js';
import { fetchEquitySnapshot } from '../services/equitySnapshot.js';
import { logger } from '../utils/logger.js';

export function createMetricsRouter(engine, binance) {
  const router = new Router();

  router.get('/', async (_req, res) => {
    try {
      const baseline = analyticsStore.getBaselineEquity();
      const snapshot = await fetchEquitySnapshot(binance, baseline);
      const normalized = analyticsStore.addEquity(snapshot);

      res.json({
        balance: normalized.balance,
        equity: normalized.equity,
        pnlPercent: normalized.pnlPercent,
        realized: analyticsStore.getRealizedPnl(),
        riskLevel: engine.getRiskLevel(),
        openAi: analyticsStore.getOpenAiUsage(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to refresh live equity metrics');
      const cached = analyticsStore.getLatestEquity();
      if (cached) {
        res.json({
          balance: cached.balance,
          equity: cached.equity,
          pnlPercent: cached.pnlPercent,
          realized: analyticsStore.getRealizedPnl(),
          riskLevel: engine.getRiskLevel(),
          openAi: analyticsStore.getOpenAiUsage(),
        });
        return;
      }

      res.status(503).json({ error: 'Equity metrics are not available yet' });
    }
  });

  router.get('/equity/series', (req, res) => {
    const requestedLimit = Number(req.query.limit ?? '240');
    const points = analyticsStore.getEquitySeries(requestedLimit);
    if (points.length === 0) {
      res.json({ points: [], message: 'No equity history available yet' });
      return;
    }
    res.json({ points });
  });

  return router;
}
