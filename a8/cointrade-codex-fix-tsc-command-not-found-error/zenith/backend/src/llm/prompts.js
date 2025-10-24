export function buildPrompt(symbol, marketContext) {
  return [
    `Symbol: ${symbol}`,
    'Metrics JSON:',
    marketContext,
    'Focus on change_5m_pct, rsi_14, vol_ratio, edge_score, atr_pct and local_signal to pick the bias.',
  ].join('\n');
}
