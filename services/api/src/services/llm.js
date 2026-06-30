import * as openaiService from './openai.js';
import * as anthropicService from './anthropic.js';

const TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const PROVIDER_HOSTS = {
  anthropic: 'api.anthropic.com',
  claude: 'api.anthropic.com',
  openai: 'api.openai.com',
  gpt: 'api.openai.com',
};
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = Number(process.env.LLM_RETRY_BASE_MS || 150);

/**
 * Robustly extract a JSON value from a raw LLM completion.
 *
 * LLMs routinely wrap JSON in ```json fences, prepend prose ("Here is the
 * quiz:"), or append a trailing explanation. Each call-site reinventing a
 * regex + bare JSON.parse() means a single formatting quirk silently breaks a
 * core flow. This helper centralizes that handling:
 *   1. strips Markdown code fences,
 *   2. extracts the first balanced JSON object/array,
 *   3. parses safely (never throws),
 *   4. optionally runs a validator (e.g. a Zod schema's safeParse or a
 *      predicate) and falls back if the shape is wrong.
 *
 * @param {string} raw                      the model's text output
 * @param {object} [opts]
 * @param {*}      [opts.fallback=null]     returned when parsing/validation fails
 * @param {function} [opts.validate]        (value) => boolean | { success: boolean, data?: * }
 * @returns the parsed (and validated) value, or `fallback`
 */
export function parseJsonFromLLM(raw, { fallback = null, validate } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;

  // Drop ```json ... ``` (or plain ```) fences if present.
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Grab the first {...} or [...] block so trailing prose doesn't break parse.
  const objMatch = text.match(/[[{][\s\S]*[\]}]/);
  const candidate = objMatch ? objMatch[0] : text;

  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    return fallback;
  }

  if (validate) {
    const result = validate(parsed);
    // Support both a boolean predicate and Zod's { success, data } shape.
    if (result === false) return fallback;
    if (result && typeof result === 'object' && 'success' in result) {
      return result.success ? (result.data ?? parsed) : fallback;
    }
  }
  return parsed;
}

function getTextProvider(providerOverride) {
  const provider = providerOverride || TEXT_PROVIDER;
  switch (provider) {
    case 'anthropic':
    case 'claude':
      return anthropicService;
    case 'openai':
    case 'gpt':
    default:
      return openaiService;
  }
}

function providerHost(provider) {
  return PROVIDER_HOSTS[provider || TEXT_PROVIDER] || 'llm-provider';
}

// A client-side timeout (the SDK aborted the request after `timeoutMs`) is
// fundamentally different from a transient 5xx: retrying it almost always times
// out again, and each attempt burns the FULL timeout window. Three 30s attempts
// is 90s — long enough for the upstream gateway/CDN to drop the connection and
// hand the browser an empty body, which surfaces as the dreaded "server
// returned an empty response". So timeouts must fail fast, not retry.
function isTimeoutError(error) {
  if (!error) return false;
  const name = error.name || error.constructor?.name || '';
  if (/timeout/i.test(name) || name === 'AbortError') return true;
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') return true;
  return /timed?\s*out|timeout/i.test(String(error.message || ''));
}

function isRetryableProviderError(error) {
  if (String(error?.message || '').includes('_API_KEY')) return false;
  if (isTimeoutError(error)) return false;
  if (typeof error?.status === 'number') {
    return RETRYABLE_STATUS.has(error.status);
  }
  if (typeof error?.statusCode === 'number') {
    return RETRYABLE_STATUS.has(error.statusCode);
  }
  return true;
}

function sanitizeProviderError(error, host, attempts) {
  const status = error?.status ?? error?.statusCode;
  const statusText = typeof status === 'number' ? ` HTTP ${status}` : '';
  const sanitized = new Error(`LLM provider ${host} failed${statusText} after ${attempts} attempt(s)`);
  // Preserve the status so callers can distinguish a permanent config problem
  // (e.g. 400/403/404 model-access) from a transient outage without seeing the
  // raw upstream details.
  if (typeof status === 'number') sanitized.status = status;
  return sanitized;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withProviderRetry(operation, {
  provider,
  attempts = DEFAULT_ATTEMPTS,
  baseDelayMs = DEFAULT_RETRY_BASE_MS,
} = {}) {
  const host = providerHost(provider);
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const backoff = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseDelayMs);
      await sleep(backoff);
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableProviderError(error) || attempt === attempts - 1) {
        throw sanitizeProviderError(error, host, attempt + 1);
      }
    }
  }

  throw sanitizeProviderError(lastError, host, attempts);
}

export async function generateExplanation(
  prompt,
  { provider, model, maxTokens = 2000, temperature = 0.7, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const service = getTextProvider(provider);
  return withProviderRetry(
    () => service.generateText(prompt, { model, maxTokens, temperature, timeoutMs }),
    { provider }
  );
}

export async function generateChatResponse(
  messages,
  { provider, model, maxTokens = 2000, temperature = 0.7, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const service = getTextProvider(provider);
  return withProviderRetry(
    () => service.generateChatResponse(messages, { model, maxTokens, temperature, timeoutMs }),
    { provider }
  );
}

export async function generateImage(
  prompt,
  { size = '1024x1024', quality = 'standard', timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  return withProviderRetry(
    () => openaiService.generateImage(prompt, { size, quality, timeoutMs }),
    { provider: 'openai' }
  );
}

export async function generateQuiz(prompt, { provider, model, maxTokens = 3000, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const service = getTextProvider(provider);
  const raw = await withProviderRetry(
    () => service.generateText(prompt, { model, maxTokens, temperature: 0.5, timeoutMs }),
    { provider }
  );

  // A quiz must be a non-empty array of question objects. If the model returns
  // malformed JSON, fall back to the raw text so the caller can surface a
  // formatting error rather than crash mid-parse.
  return parseJsonFromLLM(raw, {
    fallback: raw,
    validate: (v) => Array.isArray(v) && v.length > 0,
  });
}
