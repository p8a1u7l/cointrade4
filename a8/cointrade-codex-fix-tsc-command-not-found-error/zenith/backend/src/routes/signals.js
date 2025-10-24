import { Router } from '../http/router.js';
import { analyticsStore } from '../store/analyticsStore.js';

export function createSignalsRouter() {
  const router = new Router();

  router.get('/', (_req, res) => {
    const signals = analyticsStore.getRecentSignals(10);
    res.json(signals);
  });

  return router;
}
