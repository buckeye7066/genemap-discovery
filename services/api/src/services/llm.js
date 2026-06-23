import * as openaiService from './openai.js';
import * as anthropicService from './anthropic.js';

const TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

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

export async function generateExplanation(
  prompt,
  { provider, maxTokens = 2000, temperature = 0.7, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const service = getTextProvider(provider);
  return service.generateText(prompt, { maxTokens, temperature, timeoutMs });
}

export async function generateChatResponse(
  messages,
  { provider, maxTokens = 2000, temperature = 0.7, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const service = getTextProvider(provider);
  return service.generateChatResponse(messages, { maxTokens, temperature, timeoutMs });
}

export async function generateImage(
  prompt,
  { size = '1024x1024', quality = 'standard', timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  return openaiService.generateImage(prompt, { size, quality, timeoutMs });
}

export async function generateQuiz(prompt, { provider, maxTokens = 3000, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const service = getTextProvider(provider);
  const raw = await service.generateText(prompt, { maxTokens, temperature: 0.5, timeoutMs });

  // A quiz must be a non-empty array of question objects. If the model returns
  // malformed JSON, fall back to the raw text so the caller can surface a
  // formatting error rather than crash mid-parse.
  return parseJsonFromLLM(raw, {
    fallback: raw,
    validate: (v) => Array.isArray(v) && v.length > 0,
  });
}
