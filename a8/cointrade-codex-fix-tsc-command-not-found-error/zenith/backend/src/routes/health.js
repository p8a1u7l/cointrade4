import { Router } from '../http/router.js';

export function createHealthRouter(engine) {
  const router = new Router();

  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      running: engine.isRunning(),
      riskLevel: engine.getRiskLevel(),
    });
  });

  return router;
}
