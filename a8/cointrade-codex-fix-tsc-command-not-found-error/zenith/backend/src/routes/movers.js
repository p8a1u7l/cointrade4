import { Router } from '../http/router.js';
import { config } from '../config.js';
import { analyticsStore } from '../store/analyticsStore.js';
import { logger } from '../utils/logger.js';

const round = (value, digits = 2) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(digits));
};

export function createMoversRouter(engine) {
  const router = new Router();

  router.get('/', async (_req, res) => {
    const discovery = config.binance.symbolDiscovery ?? {};
    const limit = Math.max(1, Number(discovery.routeLimit ?? 10));

    try {
      const { movers } = await engine.refreshSymbolUniverse();
      const dataset = (movers && movers.length > 0 ? movers : engine.getTopMovers()).map(
        (item, index) => ({
          symbol: item.symbol,
          rank: index + 1,
          changePct: round(item.priceChangePercent, 2),
          direction: item.direction,
          quoteVolume: round(item.quoteVolume, 0),
          baseVolume: round(item.baseVolume, 4),
          lastPrice: round(item.lastPrice, 4),
          score: round(item.score ?? 0, 4),
        })
      );

      if (dataset.length > 0) {
        const leaders = dataset
          .filter((item) => item.changePct >= 0)
          .sort((a, b) => b.changePct - a.changePct)
          .slice(0, limit);
        const laggards = dataset
          .filter((item) => item.changePct < 0)
          .sort((a, b) => a.changePct - b.changePct)
          .slice(0, limit);

        res.json({
          top: leaders,
          bottom: laggards,
          refreshedAt: new Date().toISOString(),
          universeSize: engine.getActiveSymbols().length,
        });
        return;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to refresh live movers feed');
    }

    const performance = analyticsStore.getSymbolPerformance();
    const top = performance
      .filter((item) => item.realized_pnl > 0)
      .sort((a, b) => b.realized_pnl - a.realized_pnl)
      .slice(0, limit);
    const bottom = performance
      .filter((item) => item.realized_pnl < 0)
      .sort((a, b) => a.realized_pnl - b.realized_pnl)
      .slice(0, limit);

    const leaders = top.map((item, index) => ({
      symbol: item.symbol,
      rank: index + 1,
      changePct: round(item.realized_pnl, 2),
      direction: 'up',
      quoteVolume: round(item.total_volume, 4),
      baseVolume: round(item.total_volume, 4),
      lastPrice: round(item.avg_entry_price, 2),
      score: round(item.realized_pnl, 2),
    }));
    const laggards = bottom.map((item, index) => ({
      symbol: item.symbol,
      rank: index + 1,
      changePct: round(item.realized_pnl, 2),
      direction: 'down',
      quoteVolume: round(item.total_volume, 4),
      baseVolume: round(item.total_volume, 4),
      lastPrice: round(item.avg_entry_price, 2),
      score: round(item.realized_pnl, 2),
    }));

    res.json({
      top: leaders,
      bottom: laggards,
      refreshedAt: new Date().toISOString(),
      universeSize: engine.getActiveSymbols().length,
    });
  });

  return router;
}
