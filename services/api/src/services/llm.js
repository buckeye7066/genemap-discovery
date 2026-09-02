import * as openaiService from './openai.js';
import * as anthropicService from './anthropic.js';
import { looksLikeRawGenomicContent } from './genomicGuard.js';
import {
  QUIZ_HONESTY_NOTE,
  withHonestyPrefix,
  withHonestySystem,
} from './scientificHonesty.js';
import { ValidationError } from '../utils/errors.js';

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
    console.warn('Invalid JSON input detected, returning fallback value.');
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

// ─── No-cloud-genomic chokepoint ─────────────────────────────────────────────
//
// EVERY cloud-provider call in the app goes through one of the exported
// functions below. Enforcing the raw-genomic guard HERE (not only at the route
// layer) means no call site — present or future, authenticated or not — can
// reach OpenAI/Anthropic with raw VCF/variant text by importing this module
// directly or by constructing a payload shape a route-level check missed (e.g.
// array-form message content). The guard extracts the EXACT provider-visible
// text and refuses it unless the caller passes `allowGenomic: true`, a marker
// only set after a successful consent check (services/genomicGuard.js).

// Structural keys whose VALUES are never user content the model reads as text
// (they select roles/part-types, not payload). Skipping them keeps the extracted
// text clean without missing any provider-visible payload.
const NON_CONTENT_KEYS = new Set(['role', 'type']);

/**
 * Recursively collect EVERY provider-visible text fragment from a prompt string
 * or a messages array. Crucially this includes text hidden in sibling fields
 * the model still reads — `tool_calls[].function.arguments`, `function_call.
 * arguments`, array-form `content` parts (`{type,text}`), etc. — not just
 * `content`. The chokepoint runs its genomic check over THIS text, so a payload
 * smuggled into tool/function arguments is inspected like any other.
 */
export function extractProviderText(input) {
  const parts = [];
  const visit = (node) => {
    if (node == null) return;
    if (typeof node === 'string') { parts.push(node); return; }
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (NON_CONTENT_KEYS.has(key)) continue;
        visit(value);
      }
    }
  };
  visit(input);
  return parts.join('\n');
}

/**
 * The chokepoint. Throws unless the text is clearly non-genomic or the caller
 * has an explicit, consent-backed `allowGenomic` marker.
 */
export function assertProviderPayloadAllowed(payload, allowGenomic) {
  if (allowGenomic === true) return;
  if (looksLikeRawGenomicContent(extractProviderText(payload))) {
    throw new ValidationError('Raw VCF/genomic file content is not allowed in LLM requests by default');
  }
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

// A dropped/reset connection ("Premature close", ECONNRESET, "socket hang up",
// EPIPE, undici socket errors) is almost always a transient keep-alive race:
// the pool handed us a socket the remote had already half-closed. Unlike a
// timeout, retrying gets a FRESH connection and typically succeeds — so these
// must be retried, not surfaced. We also match the raw message because
// `ERR_STREAM_PREMATURE_CLOSE` can bubble out of body parsing WITHOUT the SDK
// wrapping it (so it carries no HTTP status), which is exactly how a bare
// "Premature close" escaped un-sanitized before this guard existed.
const CONNECTION_RESET_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

export function isConnectionResetError(error) {
  if (!error) return false;
  if (CONNECTION_RESET_CODES.has(error.code) || CONNECTION_RESET_CODES.has(error.cause?.code)) {
    return true;
  }
  const haystack = `${error.message || ''} ${error.cause?.message || ''}`;
  return /premature close|socket hang ?up|econnreset|epipe|connection reset|other side closed/i.test(
    haystack
  );
}

function isRetryableProviderError(error) {
  if (String(error?.message || '').includes('_API_KEY')) return false;
  if (isTimeoutError(error)) return false;
  // Check connection resets BEFORE the status checks: an HTTP/2 body-read reset
  // can arrive with a stale/misleading status attached, but it is still a
  // transport failure that a fresh connection recovers from.
  if (isConnectionResetError(error)) return true;
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
  sanitized.code = isTimeoutError(error)
    ? 'LLM_PROVIDER_TIMEOUT'
    : isConnectionResetError(error)
      ? 'LLM_PROVIDER_CONNECTION'
      : 'LLM_PROVIDER_ERROR';
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
  { provider, model, maxTokens = 2000, temperature = 0.7, timeoutMs = DEFAULT_TIMEOUT_MS, allowGenomic = false, includeMetadata = false } = {}
) {
  assertProviderPayloadAllowed(prompt, allowGenomic);
  const protectedPrompt = withHonestyPrefix(prompt);
  const service = getTextProvider(provider);
  const result = await withProviderRetry(
    () => service.generateTextResult
      ? service.generateTextResult(protectedPrompt, { model, maxTokens, temperature, timeoutMs })
      : service.generateText(protectedPrompt, { model, maxTokens, temperature, timeoutMs }),
    { provider }
  );
  const normalized = typeof result === 'string'
    ? { text: result, completion: 'unknown' }
    : result;
  return includeMetadata ? normalized : normalized.text;
}

export async function generateChatResponse(
  messages,
  { provider, model, maxTokens = 2000, temperature = 0.7, timeoutMs = DEFAULT_TIMEOUT_MS, allowGenomic = false, includeMetadata = false, honestyPersona = '' } = {}
) {
  assertProviderPayloadAllowed(messages, allowGenomic);
  const protectedMessages = withHonestySystem(messages, honestyPersona);
  const service = getTextProvider(provider);
  const result = await withProviderRetry(
    () => service.generateChatResponseResult
      ? service.generateChatResponseResult(protectedMessages, {
        model,
        maxTokens,
        temperature,
        timeoutMs,
        honestyPersona,
      })
      : service.generateChatResponse(protectedMessages, {
        model,
        maxTokens,
        temperature,
        timeoutMs,
        honestyPersona,
      }),
    { provider }
  );
  const normalized = typeof result === 'string'
    ? { text: result, completion: 'unknown' }
    : result;
  return includeMetadata ? normalized : normalized.text;
}

export async function generateQuiz(prompt, { provider, model, maxTokens = 3000, timeoutMs = DEFAULT_TIMEOUT_MS, allowGenomic = false, includeMetadata = false } = {}) {
  assertProviderPayloadAllowed(prompt, allowGenomic);
  const protectedPrompt = withHonestyPrefix(prompt, QUIZ_HONESTY_NOTE);
  const service = getTextProvider(provider);
  const result = await withProviderRetry(
    () => service.generateTextResult
      ? service.generateTextResult(protectedPrompt, {
        model,
        maxTokens,
        temperature: 0.5,
        timeoutMs,
      })
      : service.generateText(protectedPrompt, {
        model,
        maxTokens,
        temperature: 0.5,
        timeoutMs,
      }),
    { provider }
  );
  const normalized = typeof result === 'string'
    ? { text: result, completion: 'unknown' }
    : result;

  // A quiz must be a non-empty array of question objects. If the model returns
  // malformed JSON, fall back to the raw text so the caller can surface a
  // formatting error rather than crash mid-parse.
  const parsed = parseJsonFromLLM(normalized.text, {
    fallback: normalized.text,
    validate: (v) => Array.isArray(v) && v.length > 0,
  });
  return includeMetadata ? { ...normalized, text: parsed, rawText: normalized.text } : parsed;
}
