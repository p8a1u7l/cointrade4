function normalizeBalance(balances) {
  const usdt = balances.find((b) => b.asset === 'USDT');
  if (!usdt) {
    throw new Error('USDT balance not returned from Binance');
  }

  const balance = Number(usdt.balance);
  if (!Number.isFinite(balance)) {
    throw new Error('Invalid USDT balance value');
  }

  return balance;
}

function sumUnrealizedPnl(positions) {
  let total = 0;
  for (const position of positions) {
    const unrealized = Number(position.unrealizedProfit);
    if (!Number.isFinite(unrealized)) {
      throw new Error(`Invalid unrealized PnL for position ${position.symbol}`);
    }
    total += unrealized;
  }
  return total;
}

export function buildEquitySnapshot({
  balances,
  positions,
  baselineEquity,
  timestamp = new Date().toISOString(),
}) {
  const balance = normalizeBalance(balances);
  const unrealized = sumUnrealizedPnl(positions);
  const equity = balance + unrealized;
  const basis = baselineEquity ?? equity;
  const denominator = basis === 0 ? equity : basis;
  const pnlPercent = denominator === 0 ? 0 : ((equity - denominator) / denominator) * 100;

  return {
    balance,
    equity,
    pnlPercent,
    baseline: denominator,
    timestamp,
  };
}

export async function fetchEquitySnapshot(binance, baselineEquity) {
  const [balances, positions] = await Promise.all([
    binance.fetchAccountBalance(),
    binance.fetchPositions(),
  ]);

  return buildEquitySnapshot({ balances, positions, baselineEquity });
}
