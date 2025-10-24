import { Router } from '../http/router.js';

const VALID_RISK_LEVELS = [1, 2, 3, 4, 5];

export function createControlRouter(engine) {
  const router = new Router();

  router.post('/start', async (_req, res) => {
    await engine.start();
    res.status(200).json({ status: 'started' });
  });

  router.post('/stop', (_req, res) => {
    engine.stop();
    res.status(200).json({ status: 'stopped' });
  });

  router.post('/risk/:level', (req, res) => {
    const level = Number(req.params.level);
    if (!VALID_RISK_LEVELS.includes(level)) {
      res.status(400).json({ error: 'Risk level must be between 1 and 5' });
      return;
    }
    engine.setRiskLevel(level);
    res.status(200).json({ riskLevel: level });
  });

  router.get('/state', (_req, res) => {
    res.json({ running: engine.isRunning(), riskLevel: engine.getRiskLevel() });
  });

  return router;
}
