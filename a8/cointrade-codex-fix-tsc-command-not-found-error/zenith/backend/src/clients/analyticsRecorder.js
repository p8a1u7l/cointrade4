import { analyticsStore } from '../store/analyticsStore.js';

export class AnalyticsRecorder {
  async recordStrategy(decision, riskLevel) {
    analyticsStore.addSignal(decision, riskLevel);
    if (decision?.usage) {
      analyticsStore.recordOpenAiUsage(decision.usage);
    }
  }

  async recordExecution(result, decision) {
    analyticsStore.addExecution(result, decision);
  }

  async recordEquity(snapshot) {
    analyticsStore.addEquity(snapshot);
  }
}
