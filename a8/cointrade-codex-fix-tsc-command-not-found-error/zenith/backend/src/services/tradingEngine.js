import { BinanceClient, BinanceRealtimeFeed } from '../clients/binanceClient.js';
import { requestStrategy } from '../clients/openaiClient.js';
import { AnalyticsRecorder } from '../clients/analyticsRecorder.js';
import { config } from '../config.js';
import { analyticsStore } from '../store/analyticsStore.js';
import { logger } from '../utils/logger.js';
import { TypedEventEmitter } from '../utils/eventEmitter.js';
import { fetchEquitySnapshot } from './equitySnapshot.js';
import { getMarketSnapshot } from './marketIntelligence.js';

const RISK_LEVERAGE = {
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: config.trading.maxPositionLeverage,
};

const CONTEXT_SHIFT_THRESHOLD = 0.12;
const MIN_CONFIDENCE_TO_EXECUTE = 0.62;
const MIN_LOCAL_EDGE = 0.4;
const MIN_LOCAL_CONFIDENCE = 0.55;

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

function computeContextShift(previous, next) {
  if (!previous || !next) {
    return 0;
  }

  const prevBias = previous?.local_signal?.bias;
  const nextBias = next?.local_signal?.bias;
  if (prevBias && nextBias && prevBias !== nextBias) {
    return Infinity;
  }

  const fields = [
    ['change_5m_pct', 6],
    ['change_15m_pct', 10],
    ['rsi_14', 100],
    ['vol_ratio', 5],
    ['edge_score', 1],
    ['atr_pct', 5],
  ];

  let maxShift = 0;
  for (const [key, scale] of fields) {
    const previousValue = toNumber(previous[key]);
    const nextValue = toNumber(next[key]);
    if (!Number.isFinite(previousValue) || !Number.isFinite(nextValue)) {
      continue;
    }
    const normalized = Math.abs(nextValue - previousValue) / scale;
    if (normalized > maxShift) {
      maxShift = normalized;
    }
  }

  const prevConfidence = toNumber(previous?.local_signal?.confidence);
  const nextConfidence = toNumber(next?.local_signal?.confidence);
  if (Number.isFinite(prevConfidence) && Number.isFinite(nextConfidence)) {
    maxShift = Math.max(maxShift, Math.abs(nextConfidence - prevConfidence));
  }

  return maxShift;
}

export class TradingEngine extends TypedEventEmitter {
  constructor(symbols) {
    super();
    this.baseSymbols = Array.from(new Set(Array.isArray(symbols) ? symbols.map((s) => s.toUpperCase()) : []));
    this.activeSymbols = [...this.baseSymbols];
    this.cachedTopMovers = [];
    this.lastSymbolRefresh = 0;
    this.riskLevel = 3;
    this.running = false;
    this.loopTimer = undefined;
    this.binance = new BinanceClient();
    this.recorder = new AnalyticsRecorder();
    this.stream = new BinanceRealtimeFeed();
    this.latestTicks = new Map();
    this.decisionCache = new Map();
    this.loopInFlight = false;
    this.aiCooldownMs = 45_000;
    this.aiRevalidationMs = 240_000;

    this.stream.on('tick', (tick) => {
      this.latestTicks.set(tick.symbol, tick);
      this.emit('tick', tick);
    });
  }

  getActiveSymbols() {
    return [...this.activeSymbols];
  }

  getTopMovers() {
    return [...this.cachedTopMovers];
  }

  async refreshSymbolUniverse(options = {}) {
    const discovery = config.binance.symbolDiscovery ?? {};
    const enabled = discovery.enabled !== false;
    if (!enabled) {
      this._updateActiveSymbols(this.baseSymbols);
      return { symbols: this.getActiveSymbols(), movers: [] };
    }

    const now = Date.now();
    const intervalMs = Math.max(30_000, Number(discovery.refreshIntervalSeconds ?? 180) * 1000);
    const force = options.force === true;
    if (!force && now - this.lastSymbolRefresh < intervalMs) {
      return { symbols: this.getActiveSymbols(), movers: this.getTopMovers() };
    }

    const configuredMax = Math.max(Number(discovery.maxActiveSymbols ?? 0), this.baseSymbols.length);
    const dynamicBudget = Math.max(configuredMax - this.baseSymbols.length, 0);
    const fetchLimit = Math.max(
      Number(discovery.topMoverLimit ?? 0),
      dynamicBudget > 0 ? dynamicBudget : 0,
      20
    );

    try {
      const movers = await this.binance.fetchTopMovers({
        limit: fetchLimit,
        minQuoteVolume: discovery.minQuoteVolume,
        quoteAssets: discovery.quoteAssets,
      });
      this.cachedTopMovers = movers;
      this.lastSymbolRefresh = now;

      const baseSet = new Set(this.baseSymbols);
      const dynamicCandidates = movers
        .map((item) => item.symbol)
        .filter((symbol) => !baseSet.has(symbol));
      const limitedDynamics = dynamicBudget > 0
        ? dynamicCandidates.slice(0, dynamicBudget)
        : dynamicCandidates;

      const nextSymbols = [...this.baseSymbols, ...limitedDynamics];
      const changed = this._updateActiveSymbols(nextSymbols);

      if (changed) {
        logger.info(
          {
            base: this.baseSymbols.length,
            dynamic: nextSymbols.length - this.baseSymbols.length,
            total: nextSymbols.length,
          },
          'Updated active symbol universe from Binance movers scan'
        );
      }

      return { symbols: this.getActiveSymbols(), movers };
    } catch (error) {
      logger.error({ error }, 'Failed to refresh symbol universe');
      if (force && this.activeSymbols.length === 0 && this.baseSymbols.length > 0) {
        this._updateActiveSymbols(this.baseSymbols);
      }
      return { symbols: this.getActiveSymbols(), movers: this.getTopMovers() };
    }
  }

  _updateActiveSymbols(nextSymbols) {
    const unique = Array.from(new Set((nextSymbols ?? []).map((symbol) => symbol.toUpperCase())));
    const changed =
      unique.length !== this.activeSymbols.length ||
      unique.some((symbol, index) => symbol !== this.activeSymbols[index]);
    if (!changed) {
      return false;
    }

    this.activeSymbols = unique;
    const activeSet = new Set(this.activeSymbols);
    for (const key of Array.from(this.latestTicks.keys())) {
      if (!activeSet.has(key)) {
        this.latestTicks.delete(key);
      }
    }
    for (const key of Array.from(this.decisionCache.keys())) {
      if (!activeSet.has(key)) {
        this.decisionCache.delete(key);
      }
    }
    if (this.running) {
      this.stream.start(this.activeSymbols);
    }
    this.emit('symbolsChanged', this.getActiveSymbols());
    return true;
  }

  getRiskLevel() {
    return this.riskLevel;
  }

  isRunning() {
    return this.running;
  }

  setRiskLevel(level) {
    if (this.riskLevel === level) return;
    this.riskLevel = level;
    this.emit('riskChanged', level);
  }

  async start() {
    if (this.running) return;
    await this.refreshSymbolUniverse({ force: true });
    if (this.activeSymbols.length === 0) {
      throw new Error('No Binance symbols available to trade');
    }
    this.stream.start(this.activeSymbols);
    try {
      await this.captureEquitySnapshot({ requireSuccess: true });
      this.running = true;
      this.scheduleNextLoop(0);
      this.emit('started');
      logger.info({ symbols: this.getActiveSymbols() }, 'Trading engine started');
    } catch (error) {
      this.stream.stop();
      throw error;
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = undefined;
    }
    this.stream.stop();
    this.emit('stopped');
    logger.info('Trading engine stopped');
  }

  scheduleNextLoop(delayMs) {
    if (!this.running) return;
    const timeout = delayMs ?? config.trading.loopIntervalSeconds * 1000;
    this.loopTimer = setTimeout(() => {
      this.executeLoop().catch(this.handleLoopError);
    }, timeout);
  }

  handleLoopError = (error) => {
    logger.error({ error }, 'Trading loop encountered an error');
    this.scheduleNextLoop();
  };

  async runOnce() {
    await this.executeLoop();
  }

  async executeLoop() {
    if (this.loopInFlight) {
      logger.warn('Loop already in flight, skipping runOnce invocation');
      return;
    }
    if (!this.running) return;
    this.loopInFlight = true;
    try {
      await this.refreshSymbolUniverse();
      const symbols = this.getActiveSymbols();
      if (symbols.length === 0) {
        logger.warn('No active symbols available, skipping evaluation loop');
        await this.captureEquitySnapshot();
        return;
      }
      for (const symbol of symbols) {
        try {
          const decision = await this.evaluateSymbol(symbol);
          await this.executeDecision(decision);
        } catch (error) {
          logger.error({ error, symbol }, 'Failed to execute trading decision');
        }
      }
      await this.captureEquitySnapshot();
    } finally {
      this.loopInFlight = false;
    }
    this.scheduleNextLoop();
  }

  async evaluateSymbol(symbol) {
    const tick = this.latestTicks.get(symbol);
    let snapshot;
    try {
      snapshot = await getMarketSnapshot(this.binance, symbol, {
        interval: '1m',
        limit: 150,
      });
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to build market snapshot');
      const cached = this.decisionCache.get(symbol);
      if (cached) {
        const { usage: _usage, ...rest } = cached.decision;
        const fallback = {
          ...rest,
          reasoning: `${rest.reasoning} · Snapshot unavailable, maintaining prior stance`,
        };
        await this.recorder.recordStrategy(fallback, this.riskLevel);
        return fallback;
      }
      throw error;
    }

    const decision = await this.resolveDecision(symbol, snapshot, tick);
    await this.recorder.recordStrategy(decision, this.riskLevel);
    return decision;
  }

  async resolveDecision(symbol, snapshot, tick) {
    const round = (value, digits = 2) => {
      if (!Number.isFinite(value)) return 0;
      return Number(value.toFixed(digits));
    };

    const clampConfidence = (value, fallback = 0) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return Math.max(0, Math.min(1, fallback));
      }
      return Math.max(0, Math.min(1, numeric));
    };

    const priceReference = snapshot.metrics.lastPrice;
    const localSignal = snapshot.metrics.localSignal;
    const localEdge = Number.isFinite(localSignal?.edgeScore) ? localSignal.edgeScore : 0;
    const localConfidence = clampConfidence(localSignal?.confidence, 0);
    let promptSnapshot;
    try {
      promptSnapshot = JSON.parse(snapshot.promptContext);
    } catch (error) {
      logger.warn({ error, symbol }, 'Failed to parse prompt context for cache heuristics');
    }
    const now = Date.now();
    const cached = this.decisionCache.get(symbol);
    const priceDrift = cached?.price
      ? Math.abs((priceReference - cached.price) / cached.price)
      : Infinity;
    const ageMs = cached ? now - cached.timestamp : Infinity;

    const shouldBypassOpenAi =
      localSignal.bias !== 'flat' &&
      ((localSignal.confidence >= 0.68 && localEdge >= 0.48) || localSignal.confidence >= 0.82 || localEdge >= 0.62);

    if (shouldBypassOpenAi) {
      const decision = {
        symbol,
        bias: localSignal.bias,
        confidence: localConfidence,
        reasoning: `${localSignal.reasoning} · Local edge ${Math.round(localEdge * 100)}% · Executing local signal without OpenAI call`,
        localEdge,
        localConfidence,
        localBias: localSignal.bias,
        entryPrice: priceReference,
      };
      this.decisionCache.set(symbol, {
        decision,
        price: priceReference,
        timestamp: now,
        source: 'local',
        contextSnapshot: promptSnapshot ?? null,
        model: 'local',
      });
      logger.info({ symbol, localSignal }, 'Executing locally derived decision');
      return decision;
    }

    const previousContext = cached?.contextSnapshot;
    const hasContextSnapshots = Boolean(previousContext && promptSnapshot);
    const contextShift = hasContextSnapshots ? computeContextShift(previousContext, promptSnapshot) : 0;
    const contextStable = hasContextSnapshots
      ? Number.isFinite(contextShift) && contextShift < CONTEXT_SHIFT_THRESHOLD
      : true;
    const localBiasChanged =
      hasContextSnapshots &&
      previousContext?.local_signal?.bias &&
      promptSnapshot?.local_signal?.bias &&
      previousContext.local_signal.bias !== promptSnapshot.local_signal.bias;

    const stalePrice = !Number.isFinite(priceDrift) || priceDrift >= 0.0012;
    const staleTime = ageMs >= this.aiRevalidationMs;

    let reuseReason;
    if (cached && cached.source === 'openai' && contextStable && !localBiasChanged) {
      if (!stalePrice && !staleTime) {
        reuseReason = 'Maintaining stance';
      } else if (ageMs < this.aiCooldownMs && priceDrift < 0.0025) {
        reuseReason = 'Cooldown reuse';
      }
    }

    if (reuseReason && cached) {
      const driftPct = priceDrift * 100;
      const contextShiftValue = Number.isFinite(contextShift) ? Number(contextShift.toFixed(3)) : null;
      const { usage: _usage, ...rest } = cached.decision;
      const reused = {
        ...rest,
        reasoning: `${rest.reasoning} · ${reuseReason} (price drift ${round(driftPct, 3)}%)`,
        localEdge,
        localConfidence,
        localBias: localSignal.bias,
        entryPrice: priceReference,
        confidence: clampConfidence(rest.confidence, localConfidence),
      };
      this.decisionCache.set(symbol, {
        ...cached,
        decision: reused,
        price: priceReference,
        timestamp: now,
        contextSnapshot: promptSnapshot ?? cached.contextSnapshot ?? null,
      });
      logger.debug({ symbol, driftPct: round(driftPct, 3), contextShift: contextShiftValue }, 'Reusing cached OpenAI decision');
      return reused;
    }

    const llmDecision = await requestStrategy(symbol, snapshot.promptContext);
    const enhanced = {
      ...llmDecision,
      bias: llmDecision.bias ?? localSignal.bias,
      confidence: clampConfidence(llmDecision.confidence, localConfidence || 0.5),
      reasoning: `${llmDecision.reasoning} · Δ5m ${round(snapshot.metrics.change5mPct, 2)}%, RSI ${round(
        snapshot.metrics.rsi14,
        1
      )} · Vol ${round(snapshot.metrics.volumeRatio, 2)} · MFI ${round(snapshot.metrics.mfi14, 1)}`,
      localEdge,
      localConfidence,
      localBias: localSignal.bias,
      entryPrice: priceReference,
    };

    if (tick) {
      enhanced.marketTime = new Date(tick.eventTime).toISOString();
    }

    this.decisionCache.set(symbol, {
      decision: enhanced,
      price: priceReference,
      timestamp: now,
      source: 'openai',
      contextSnapshot: promptSnapshot ?? null,
      model: enhanced.model ?? llmDecision.model ?? 'openai',
    });
    return enhanced;
  }

  async executeDecision(decision) {
    if (!decision || decision.bias === 'flat') {
      logger.info({ decision }, 'Skipping execution due to neutral signal');
      return;
    }

    if (!this.hasStrongConviction(decision)) {
      logger.info({ decision }, 'Skipping execution due to insufficient conviction');
      return;
    }

    const leverage = RISK_LEVERAGE[this.riskLevel];
    const side = decision.bias === 'long' ? 'BUY' : 'SELL';
    const confidence = Number(decision.confidence ?? 0);

    let referencePrice = Number(decision.entryPrice);
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      const tick = this.latestTicks.get(decision.symbol);
      if (tick && Number.isFinite(tick.price) && tick.price > 0) {
        referencePrice = tick.price;
      }
    }

    const rawQuantity = this.calculateOrderSize(decision.symbol, leverage, confidence, referencePrice);
    const quantity = await this.binance.ensureTradableQuantity(decision.symbol, rawQuantity, referencePrice);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      logger.warn({ decision, referencePrice, rawQuantity }, 'Normalized order size invalid, skipping execution');
      return;
    }

    if (Math.abs(quantity - rawQuantity) > Math.max(1e-8, rawQuantity * 0.05)) {
      logger.debug({ decision, rawQuantity, quantity }, 'Adjusted quantity to satisfy Binance filters');
    }

    await this.binance.setLeverage(decision.symbol, leverage);
    const result = await this.binance.placeMarketOrder(decision.symbol, side, quantity);
    await this.recorder.recordExecution(
      {
        symbol: decision.symbol,
        orderId: String(result.orderId),
        status: result.status,
        filledQty: result.executedQty,
        avgPrice: result.avgPrice,
      },
      decision
    );
    logger.info({ decision, result }, 'Executed market order');
  }

  calculateOrderSize(symbol, leverage, confidence, referencePrice) {
    const safeConfidence = Number.isFinite(confidence) ? Math.max(confidence, 0.1) : 0.1;
    const baseNotional = 40;
    const targetNotional = baseNotional * Math.max(leverage, 1) * safeConfidence;
    if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
      const fallbackQty = Number((targetNotional / 1000).toFixed(6));
      logger.debug({ symbol, fallbackQty }, 'Calculated fallback order size without reference price');
      return fallbackQty;
    }
    const quantity = targetNotional / referencePrice;
    logger.debug({ symbol, quantity, referencePrice, targetNotional }, 'Calculated order size');
    return Number(quantity.toFixed(6));
  }

  hasStrongConviction(decision) {
    const confidence = Number(decision?.confidence ?? 0);
    if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE_TO_EXECUTE) {
      return false;
    }

    const localEdge = Number(decision?.localEdge ?? decision?.edgeScore ?? 0);
    if (!Number.isFinite(localEdge) || localEdge < MIN_LOCAL_EDGE) {
      return false;
    }

    const localConfidence = Number(decision?.localConfidence ?? 0);
    if (Number.isFinite(localConfidence) && localConfidence < MIN_LOCAL_CONFIDENCE) {
      return false;
    }

    return true;
  }

  async captureEquitySnapshot(options = {}) {
    try {
      const baseline = analyticsStore.getBaselineEquity();
      const snapshot = await fetchEquitySnapshot(this.binance, baseline);
      await this.recorder.recordEquity(snapshot);
    } catch (error) {
      logger.error({ error }, 'Failed to capture equity snapshot');
      if (options?.requireSuccess) {
        throw error;
      }
    }
  }
}
