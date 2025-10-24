import { config } from '../config.js';
import { buildPrompt } from '../llm/prompts.js';

const REQUEST_TIMEOUT_MS = 20_000;

const STRATEGY_SYSTEM_PROMPT = [
  'You are Zenith, a professional crypto futures strategist.',
  'Respond with strict JSON: {"symbol":"string","bias":"long|short|flat","confidence":0-1,"reasoning":"<=22 words"}.',
  'Confidence must be between 0.30 and 0.95 (two decimals). Reference at least one metric in reasoning.',
  'Prefer concise language and never add extra commentary.',
].join(' ');

const STRATEGY_RESPONSE_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'zenith_strategy',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['bias', 'confidence', 'reasoning'],
      properties: {
        symbol: { type: 'string', minLength: 1 },
        bias: { type: 'string', enum: ['long', 'short', 'flat'] },
        confidence: {
          oneOf: [
            { type: 'number', minimum: 0, maximum: 1 },
            { type: 'string', minLength: 1 },
          ],
        },
        reasoning: { type: 'string', minLength: 1 },
      },
    },
  },
};

const MODEL_PIPELINE = [
  {
    id: 'gpt-5.1-nano',
    maxOutputTokens: 60,
    temperature: 0.1,
    minConfidence: 0.58,
  },
  {
    id: 'gpt-5.1-mini',
    maxOutputTokens: 80,
    temperature: 0.15,
  },
];

function safeNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function extractUsage(data, model, finishReason) {
  const usage = data?.usage;
  if (!usage || typeof usage !== 'object') {
    return model ? { model, finishReason } : undefined;
  }

  const promptTokens =
    safeNumber(usage.input_tokens) ?? safeNumber(usage.prompt_tokens) ?? safeNumber(usage.promptTokens) ?? 0;
  const completionTokens =
    safeNumber(usage.output_tokens) ?? safeNumber(usage.completion_tokens) ?? safeNumber(usage.completionTokens) ?? 0;
  const totalTokens =
    safeNumber(usage.total_tokens) ?? safeNumber(usage.totalTokens) ?? promptTokens + completionTokens;

  const inputCost = safeNumber(usage.input_cost) ?? safeNumber(usage.prompt_cost) ?? safeNumber(usage.inputCost) ?? 0;
  const outputCost =
    safeNumber(usage.output_cost) ?? safeNumber(usage.completion_cost) ?? safeNumber(usage.outputCost) ?? 0;
  const totalCost = safeNumber(usage.total_cost) ?? safeNumber(usage.totalCost) ?? inputCost + outputCost;

  return {
    model,
    finishReason,
    promptTokens,
    completionTokens,
    totalTokens,
    inputCost,
    outputCost,
    totalCost,
  };
}

function sanitizeReasoning(reasoning) {
  if (typeof reasoning !== 'string') {
    return 'No reasoning provided';
  }
  const normalized = reasoning.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'No reasoning provided';
  }
  const words = normalized.split(' ');
  if (words.length <= 22) {
    return normalized;
  }
  return `${words.slice(0, 22).join(' ')}…`;
}

function parseStrategyPayload(payload, fallbackSymbol) {
  let parsed = payload;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) {
      throw new Error('OpenAI strategy payload was empty');
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      const parseError = new Error('Failed to parse OpenAI strategy JSON');
      parseError.cause = error;
      parseError.body = trimmed;
      throw parseError;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OpenAI strategy payload was not an object');
  }

  const rawBias = typeof parsed.bias === 'string' ? parsed.bias.trim().toLowerCase() : '';
  if (!['long', 'short', 'flat'].includes(rawBias)) {
    throw new Error('Invalid bias returned from OpenAI');
  }

  let confidence = safeNumber(parsed.confidence);
  if (!Number.isFinite(confidence)) {
    const raw = typeof parsed.confidence === 'string' ? parsed.confidence.trim() : '';
    if (raw.endsWith('%')) {
      const percentValue = safeNumber(raw.slice(0, -1));
      if (Number.isFinite(percentValue)) {
        confidence = percentValue / 100;
      }
    } else {
      const numeric = safeNumber(raw);
      if (Number.isFinite(numeric)) {
        confidence = numeric;
      }
    }
  }

  if (!Number.isFinite(confidence)) {
    throw new Error('Invalid confidence returned from OpenAI');
  }

  const reasoning = sanitizeReasoning(parsed.reasoning);
  const symbol =
    typeof parsed.symbol === 'string' && parsed.symbol.trim().length > 0
      ? parsed.symbol.trim().toUpperCase()
      : fallbackSymbol;

  return {
    symbol,
    bias: rawBias,
    confidence: Math.max(0, Math.min(1, confidence)),
    reasoning,
  };
}

function extractPayload(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim().length > 0) {
    return data.output_text;
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (block && typeof block.json === 'object') {
        return block.json;
      }
      if (typeof block?.text === 'string' && block.text.trim().length > 0) {
        return block.text;
      }
    }
  }

  return undefined;
}

function summarizeAttempts(attempts) {
  const summary = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    inputCost: 0,
    outputCost: 0,
    totalCost: 0,
    calls: 0,
    model: attempts.length > 0 ? attempts[attempts.length - 1].model : undefined,
    attempts: [],
  };

  for (const attempt of attempts) {
    summary.calls += 1;
    const usage = attempt.usage ?? {};
    const promptTokens = safeNumber(usage.promptTokens) ?? 0;
    const completionTokens = safeNumber(usage.completionTokens) ?? 0;
    const totalTokens = safeNumber(usage.totalTokens) ?? promptTokens + completionTokens;
    const inputCost = safeNumber(usage.inputCost) ?? 0;
    const outputCost = safeNumber(usage.outputCost) ?? 0;
    const totalCost = safeNumber(usage.totalCost) ?? inputCost + outputCost;

    summary.promptTokens += promptTokens;
    summary.completionTokens += completionTokens;
    summary.totalTokens += totalTokens;
    summary.inputCost += inputCost;
    summary.outputCost += outputCost;
    summary.totalCost += totalCost;

    summary.attempts.push({
      model: attempt.model,
      promptTokens,
      completionTokens,
      totalTokens,
      inputCost,
      outputCost,
      totalCost,
      finishReason: usage.finishReason,
      disposition: attempt.disposition,
      error: attempt.error,
    });
  }

  return summary;
}

async function callOpenAi(prompt, spec) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openAi.apiKey}`,
      },
      body: JSON.stringify({
        model: spec.id,
        input: [
          { role: 'system', content: STRATEGY_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_output_tokens: spec.maxOutputTokens,
        temperature: spec.temperature ?? 0.2,
        response_format: STRATEGY_RESPONSE_SCHEMA,
        metadata: {
          application: 'zenith-trader',
          intent: 'strategy',
        },
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data;
    try {
      data = raw.length > 0 ? JSON.parse(raw) : {};
    } catch (error) {
      const parseError = new Error('Failed to parse OpenAI response payload');
      parseError.cause = error;
      parseError.body = raw;
      throw parseError;
    }

    if (!response.ok) {
      const message =
        typeof data?.error?.message === 'string'
          ? `OpenAI responded with status ${response.status}: ${data.error.message}`
          : `OpenAI responded with status ${response.status}`;
      const error = new Error(message);
      error.body = data;
      throw error;
    }

    const firstOutput = Array.isArray(data?.output) ? data.output[0] : undefined;
    const finishReason = firstOutput?.finish_reason ?? firstOutput?.metadata?.finish_reason;
    const usage = extractUsage(data, spec.id, finishReason);
    const payload = extractPayload(data);

    if (payload === undefined) {
      const error = new Error('OpenAI response did not include strategy content');
      error.body = data;
      throw error;
    }

    return { payload, usage };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MS}ms`);
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestStrategy(symbol, marketContext) {
  const prompt = buildPrompt(symbol, marketContext);
  const attempts = [];
  let lastError;

  for (const spec of MODEL_PIPELINE) {
    let attemptUsage;
    try {
      const { payload, usage } = await callOpenAi(prompt, spec);
      attemptUsage = usage;
      const strategy = parseStrategyPayload(payload, symbol);
      strategy.model = spec.id;

      const guardBreached = spec.minConfidence !== undefined && strategy.confidence < spec.minConfidence;
      attempts.push({
        model: spec.id,
        usage,
        disposition: guardBreached ? 'below_guard' : 'accepted',
      });

      if (guardBreached) {
        lastError = new Error(
          `Model ${spec.id} returned low confidence ${strategy.confidence.toFixed(2)} (< ${spec.minConfidence.toFixed(2)})`
        );
        continue;
      }

      const usageSummary = summarizeAttempts(attempts);
      usageSummary.model = strategy.model;
      strategy.usage = usageSummary;
      return strategy;
    } catch (error) {
      attempts.push({
        model: spec.id,
        usage: attemptUsage,
        disposition: 'error',
        error: error.message,
      });
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error('Failed to obtain strategy from OpenAI');
}
