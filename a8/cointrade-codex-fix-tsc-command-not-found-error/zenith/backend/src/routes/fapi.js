import { Router } from '../http/router.js';
import { BinanceClient } from '../clients/binanceClient.js';

export function createFapiRouter(binance) {
  const router = new Router();

  router.get('/account', async (_req, res) => {
    const balances = await binance.fetchAccountBalance();
    res.json({ balances });
  });

  router.get('/positions', async (_req, res) => {
    const positions = await binance.fetchPositions();
    res.json({ positions });
  });

  return router;
}
