import { Router } from '../http/router.js';

export function createRunRouter(engine) {
  const router = new Router();

  router.post('/', async (_req, res) => {
    if (!engine.isRunning()) {
      res.status(409).json({ error: 'Engine is not running' });
      return;
    }
    await engine.runOnce();
    res.status(200).json({ status: 'queued' });
  });

  return router;
}
