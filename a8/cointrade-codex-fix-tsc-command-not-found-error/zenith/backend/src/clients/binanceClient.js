import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { TypedEventEmitter } from '../utils/eventEmitter.js';

const REST_BASE_URL = config.binance.useTestnet
  ? 'https://testnet.binancefuture.com'
  : 'https://fapi.binance.com';

export class BinanceRealtimeFeed extends TypedEventEmitter {
  constructor() {
    super();
    this.pollTimer = undefined;
    this.symbols = [];
  }

  start(symbols) {
    this.stop();
    this.symbols = Array.from(new Set(Array.isArray(symbols) ? symbols : []));
    if (this.symbols.length === 0) {
      return;
    }
    const poll = () => {
      void this._pollPrices(this.symbols);
    };
    poll();
    this.pollTimer = setInterval(poll, 1000);
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.symbols = [];
  }

  async _pollPrices(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return;
    }

    if (symbols.length > 40) {
      await this._pollBulkPrices(symbols);
      return;
    }

    for (const symbol of symbols) {
      try {
        const response = await fetch(
          `${REST_BASE_URL}/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`
        );
        if (!response.ok) {
          throw new Error(`Binance price request failed: ${response.status}`);
        }
        const payload = await response.json();
        const price = Number(payload.price);
        if (Number.isNaN(price)) {
          throw new Error('Received invalid price from Binance');
        }
        this.emit('tick', {
          symbol: payload.symbol ?? symbol,
          price,
          eventTime: Date.now(),
        });
      } catch (error) {
        logger.error({ error, symbol }, 'Failed to fetch Binance ticker price');
      }
    }
  }

  async _pollBulkPrices(symbols) {
    try {
      const response = await fetch(`${REST_BASE_URL}/fapi/v1/ticker/price`);
      if (!response.ok) {
        throw new Error(`Binance bulk price request failed: ${response.status}`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error('Binance bulk price payload was not an array');
      }
      const wanted = new Set(symbols);
      const now = Date.now();
      for (const entry of payload) {
        const symbol = entry?.symbol;
        if (!wanted.has(symbol)) continue;
        const price = Number(entry.price);
        if (Number.isNaN(price)) continue;
        this.emit('tick', {
          symbol,
          price,
          eventTime: now,
        });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to fetch Binance bulk ticker prices');
    }
  }
}

export class BinanceClient {
  constructor() {
    this.baseUrl = REST_BASE_URL;
    this.symbolFilters = new Map();
  }

  async fetchKlines(symbol, interval = '1m', limit = 120) {
    const params = new URLSearchParams({
      symbol,
      interval,
      limit: String(Math.max(1, Math.min(limit, 500))),
    });
    const response = await fetch(`${this.baseUrl}/fapi/v1/klines?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Binance klines request failed: ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Binance klines payload was not an array');
    }
    return data.map((entry) => ({
      openTime: Number(entry[0]),
      open: Number(entry[1]),
      high: Number(entry[2]),
      low: Number(entry[3]),
      close: Number(entry[4]),
      volume: Number(entry[5]),
      closeTime: Number(entry[6]),
    }));
  }

  async fetchHistoricalKlines(symbol, interval = '1m', options = {}) {
    const maxCandles = Math.max(1, Math.min(Number(options.maxCandles ?? 500), 5000));
    const endTime = options.endTime ? Number(options.endTime) : undefined;
    let cursor = options.startTime ? Number(options.startTime) : undefined;
    let fetched = 0;
    const candles = [];

    while (fetched < maxCandles) {
      const batchLimit = Math.min(500, maxCandles - fetched);
      const params = new URLSearchParams({
        symbol,
        interval,
        limit: String(batchLimit),
      });
      if (cursor !== undefined) {
        params.set('startTime', String(cursor));
      }
      if (endTime !== undefined) {
        params.set('endTime', String(endTime));
      }

      const response = await fetch(`${this.baseUrl}/fapi/v1/klines?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Binance klines request failed: ${response.status}`);
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        break;
      }

      for (const entry of data) {
        candles.push({
          openTime: Number(entry[0]),
          open: Number(entry[1]),
          high: Number(entry[2]),
          low: Number(entry[3]),
          close: Number(entry[4]),
          volume: Number(entry[5]),
          closeTime: Number(entry[6]),
        });
      }

      fetched += data.length;
      const last = candles[candles.length - 1];
      if (!last) {
        break;
      }

      const nextCursor = last.closeTime + 1;
      if (cursor !== undefined && nextCursor <= cursor) {
        break;
      }

      cursor = nextCursor;
      if (endTime !== undefined && cursor > endTime) {
        break;
      }

      if (data.length < batchLimit) {
        break;
      }
    }

    return candles.slice(0, maxCandles);
  }

  async fetch24hTicker(symbol) {
    try {
      const response = await fetch(
        `${this.baseUrl}/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`
      );
      if (!response.ok) {
        throw new Error(`Binance 24hr ticker request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        priceChangePercent: Number(payload.priceChangePercent ?? 0),
        lastPrice: Number(payload.lastPrice ?? 0),
        openPrice: Number(payload.openPrice ?? 0),
        highPrice: Number(payload.highPrice ?? 0),
        lowPrice: Number(payload.lowPrice ?? 0),
        volume: Number(payload.volume ?? 0),
        quoteVolume: Number(payload.quoteVolume ?? 0),
        closeTime: Number(payload.closeTime ?? Date.now()),
      };
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to fetch Binance 24hr ticker');
      throw error;
    }
  }

  async fetchFundingRate(symbol) {
    try {
      const response = await fetch(
        `${this.baseUrl}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`
      );
      if (!response.ok) {
        throw new Error(`Binance funding rate request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        markPrice: Number(payload.markPrice ?? 0),
        indexPrice: Number(payload.indexPrice ?? 0),
        lastFundingRate: Number(payload.lastFundingRate ?? 0),
        nextFundingTime: Number(payload.nextFundingTime ?? 0),
        estimatedSettlePrice: Number(payload.estimatedSettlePrice ?? 0),
      };
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to fetch Binance funding data');
      throw error;
    }
  }

  async fetchOpenInterest(symbol) {
    try {
      const response = await fetch(
        `${this.baseUrl}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`
      );
      if (!response.ok) {
        throw new Error(`Binance open interest request failed: ${response.status}`);
      }
      const payload = await response.json();
      return {
        openInterest: Number(payload.openInterest ?? 0),
        time: Number(payload.time ?? Date.now()),
      };
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to fetch Binance open interest');
      throw error;
    }
  }

  async fetchTakerLongShortRatio(symbol, period = '5m', limit = 12) {
    try {
      const params = new URLSearchParams({
        symbol,
        period,
        limit: String(Math.max(1, Math.min(limit, 500))),
      });
      const response = await fetch(
        `${this.baseUrl}/futures/data/takerlongshortRatio?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(`Binance taker ratio request failed: ${response.status}`);
      }
      const raw = await response.text();
      if (!raw || raw.trim().length === 0) {
        return [];
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch (parseError) {
        logger.warn({ error: parseError, symbol, period, limit }, 'Unable to parse Binance taker ratio payload');
        return [];
      }
      if (!Array.isArray(payload)) {
        logger.warn({ symbol, period, limit }, 'Binance taker ratio payload was not an array');
        return [];
      }
      return payload.map((entry) => ({
        buyVolume: Number(entry.buyVol ?? 0),
        sellVolume: Number(entry.sellVol ?? 0),
        buySellRatio: Number(entry.buySellRatio ?? 0),
        timestamp: Number(entry.timestamp ?? entry.time ?? 0),
      }));
    } catch (error) {
      logger.error({ error, symbol, period, limit }, 'Failed to fetch Binance taker long/short ratio');
      return [];
    }
  }

  signParams(params) {
    const timestamp = Date.now();
    const query = new URLSearchParams({ ...params, timestamp: String(timestamp) });
    const hmac = crypto.createHmac('sha256', config.binance.apiSecret);
    hmac.update(query.toString());
    query.append('signature', hmac.digest('hex'));
    return query.toString();
  }

  async request(method, path, params = {}) {
    const query = this.signParams(params);
    const url = `${this.baseUrl}${path}?${query}`;
    const response = await fetch(url, {
      method,
      headers: { 'X-MBX-APIKEY': config.binance.apiKey },
    });
    const text = await response.text();
    if (!response.ok) {
      let details = '';
      if (text) {
        try {
          const payload = JSON.parse(text);
          if (payload?.msg) {
            details = ` (${payload.msg})`;
          }
        } catch (_error) {
          details = ` (${text})`;
        }
      }
      throw new Error(`Binance request failed: ${response.status}${details}`);
    }
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      logger.error({ error, path, method }, 'Failed to parse Binance response payload');
      throw error;
    }
  }

  async fetchSymbolFilters(symbol) {
    const key = symbol.toUpperCase();
    if (this.symbolFilters.has(key)) {
      return this.symbolFilters.get(key);
    }

    const response = await fetch(
      `${this.baseUrl}/fapi/v1/exchangeInfo?symbol=${encodeURIComponent(key)}`
    );
    if (!response.ok) {
      throw new Error(`Binance exchange info request failed: ${response.status}`);
    }
    const payload = await response.json();
    const info = Array.isArray(payload?.symbols) ? payload.symbols[0] : null;
    if (!info) {
      throw new Error(`Exchange info missing symbol data for ${key}`);
    }

    const findFilter = (type) =>
      Array.isArray(info.filters) ? info.filters.find((filter) => filter?.filterType === type) : undefined;

    const lotFilter = findFilter('MARKET_LOT_SIZE') ?? findFilter('LOT_SIZE');
    const notionalFilter = findFilter('NOTIONAL') ?? findFilter('MIN_NOTIONAL');

    const toNumber = (value, fallback = 0) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : fallback;
    };

    const filters = {
      stepSize: toNumber(lotFilter?.stepSize, 0),
      minQty: toNumber(lotFilter?.minQty, 0),
      maxQty: toNumber(lotFilter?.maxQty, Number.POSITIVE_INFINITY),
      minNotional: toNumber(notionalFilter?.minNotional ?? notionalFilter?.notional, 0),
      maxNotional: toNumber(notionalFilter?.maxNotional, Number.POSITIVE_INFINITY),
    };

    this.symbolFilters.set(key, filters);
    return filters;
  }

  static quantize(value, stepSize) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (!Number.isFinite(stepSize) || stepSize <= 0) {
      return Number(value.toFixed(6));
    }
    const precision = Math.min(8, Math.max(0, Math.round(-Math.log10(stepSize))));
    const steps = Math.floor(value / stepSize);
    const quantized = steps * stepSize;
    return Number(quantized.toFixed(precision));
  }

  async ensureTradableQuantity(symbol, desiredQty, referencePrice) {
    if (!Number.isFinite(desiredQty) || desiredQty <= 0) {
      return 0;
    }

    try {
      const filters = await this.fetchSymbolFilters(symbol);
      let quantity = BinanceClient.quantize(desiredQty, filters.stepSize);

      if (quantity < filters.minQty) {
        const minSteps = Math.ceil(filters.minQty / Math.max(filters.stepSize, 1e-9));
        quantity = BinanceClient.quantize(minSteps * filters.stepSize, filters.stepSize);
      }

      if (Number.isFinite(referencePrice) && referencePrice > 0 && filters.minNotional > 0) {
        const notional = quantity * referencePrice;
        if (notional < filters.minNotional) {
          const requiredQty = filters.minNotional / referencePrice;
          quantity = BinanceClient.quantize(requiredQty, filters.stepSize);
        }
      }

      if (quantity > filters.maxQty) {
        quantity = BinanceClient.quantize(filters.maxQty, filters.stepSize);
      }

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return 0;
      }

      if (Number.isFinite(referencePrice) && referencePrice > 0) {
        const notional = quantity * referencePrice;
        if (filters.maxNotional && Number.isFinite(filters.maxNotional) && notional > filters.maxNotional) {
          return 0;
        }
      }

      return quantity >= filters.minQty ? quantity : 0;
    } catch (error) {
      logger.error({ error, symbol }, 'Failed to normalize Binance quantity');
      return 0;
    }
  }

  async fetchAccountBalance() {
    try {
      const data = await this.request('GET', '/fapi/v2/account');
      return (data.assets ?? []).map((asset) => ({
        asset: asset.asset,
        balance: Number(asset.walletBalance),
        available: Number(asset.availableBalance),
      }));
    } catch (error) {
      logger.error({ error }, 'Unable to fetch Binance account balance');
      throw error;
    }
  }

  async fetchPositions() {
    try {
      const data = await this.request('GET', '/fapi/v2/positionRisk');
      return (data ?? []).map((position) => ({
        symbol: position.symbol,
        positionAmt: Number(position.positionAmt),
        entryPrice: Number(position.entryPrice),
        unrealizedProfit: Number(position.unRealizedProfit ?? position.unrealizedProfit ?? 0),
      }));
    } catch (error) {
      logger.error({ error }, 'Unable to fetch Binance positions');
      throw error;
    }
  }

  async setLeverage(symbol, leverage) {
    try {
      await this.request('POST', '/fapi/v1/leverage', { symbol, leverage });
    } catch (error) {
      logger.error({ error, symbol, leverage }, 'Failed to set Binance leverage');
      throw error;
    }
  }

  async placeMarketOrder(symbol, side, quantity) {
    try {
      const data = await this.request('POST', '/fapi/v1/order', {
        symbol,
        side,
        type: 'MARKET',
        quantity,
      });
      return {
        orderId: String(data.orderId),
        status: data.status,
        avgPrice: Number(data.avgPrice ?? data.price ?? 0),
        executedQty: Number(data.executedQty ?? data.origQty ?? 0),
      };
    } catch (error) {
      logger.error({ error, symbol, side, quantity }, 'Failed to execute Binance market order');
      throw error;
    }
  }

  async fetchTopMovers(options = {}) {
    const limit = Number.isFinite(options.limit) ? Number(options.limit) : 50;
    const minQuoteVolume = Number.isFinite(options.minQuoteVolume)
      ? Number(options.minQuoteVolume)
      : 0;
    const quoteAssets = Array.isArray(options.quoteAssets) && options.quoteAssets.length > 0
      ? options.quoteAssets.map((asset) => asset.toUpperCase())
      : ['USDT'];

    const response = await fetch(`${this.baseUrl}/fapi/v1/ticker/24hr`);
    if (!response.ok) {
      throw new Error(`Binance 24hr ticker request failed: ${response.status}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Binance 24hr ticker payload was not an array');
    }

    const ranked = [];
    for (const entry of data) {
      const symbol = typeof entry.symbol === 'string' ? entry.symbol.toUpperCase() : undefined;
      if (!symbol) continue;
      const matchingQuote = quoteAssets.find((asset) => symbol.endsWith(asset));
      if (!matchingQuote) continue;

      const priceChangePercent = Number(entry.priceChangePercent ?? entry.priceChange_pct ?? entry.priceChange);
      const lastPrice = Number(entry.lastPrice ?? entry.prevClosePrice ?? entry.close ?? entry.price);
      const quoteVolume = Number(entry.quoteVolume ?? entry.volume ?? 0);
      const baseVolume = Number(entry.volume ?? 0);

      if (
        !Number.isFinite(priceChangePercent) ||
        !Number.isFinite(lastPrice) ||
        !Number.isFinite(quoteVolume)
      ) {
        continue;
      }
      if (quoteVolume < minQuoteVolume) {
        continue;
      }

      const absChange = Math.abs(priceChangePercent);
      const liquidityBoost = Math.log10(Math.max(quoteVolume, 1) + 10);
      const score = absChange * liquidityBoost;

      ranked.push({
        symbol,
        quoteAsset: matchingQuote,
        priceChangePercent,
        lastPrice,
        quoteVolume,
        baseVolume,
        score,
        direction: priceChangePercent >= 0 ? 'up' : 'down',
      });
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, limit);
  }
}
