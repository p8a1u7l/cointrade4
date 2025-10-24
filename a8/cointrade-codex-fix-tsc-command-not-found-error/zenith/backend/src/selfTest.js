import { startOrchestrator } from './index.js';

async function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const port = 9090;
  const orchestrator = startOrchestrator(port);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await new Promise((resolve) => setTimeout(resolve, 200));

    const healthResponse = await fetch(`${baseUrl}/health`);
    await expect(healthResponse.ok, 'health endpoint should respond');
    const health = await healthResponse.json();
    await expect(health.status === 'ok', 'health status should be ok');

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    await expect(
      metricsResponse.ok || metricsResponse.status === 503,
      'metrics endpoint should respond or report service unavailable'
    );
    if (metricsResponse.ok) {
      const metrics = await metricsResponse.json();
      await expect(typeof metrics.balance === 'number', 'metrics should include balance');
    }

    const signalsResponse = await fetch(`${baseUrl}/signals`);
    await expect(signalsResponse.ok, 'signals endpoint should respond');
    await signalsResponse.json();

    console.log('Self-test completed successfully');
  } finally {
    await orchestrator.close();
  }
}

run().catch((error) => {
  console.error('Self-test failed:', error);
  process.exit(1);
});
