// Lazy-load Anthropic SDK — same rationale as ./openai.js.

import { withHonestyPrefix, withHonestySystem } from './scientificHonesty.js';

/**
 * Default Claude model. `claude-sonnet-4-20250514` is past EOL (deprecated,
 * retires 2026-06-15); `claude-sonnet-5` is the current Sonnet. Override with
 * ANTHROPIC_MODEL so the next migration is config-only, no code change.
 */
export const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

/**
 * Current-generation Claude models REJECT sampling parameters (`temperature`,
 * `top_p`, `top_k`) with a 400, and default to adaptive thinking that shares the
 * `max_tokens` budget with the visible answer. Our callers pass a temperature
 * (llm.js defaults to 0.7) and a small max_tokens (2000), so for those models we
 * drop the sampling parameter and keep thinking off — preserving the latency,
 * cost, and no-truncation profile the previous model had.
 */
const CURRENT_GEN_MODEL = /^claude-(fable-5|mythos-5|opus-5|opus-4-[78]|sonnet-5)/;

export function isCurrentGenerationModel(model) {
  return CURRENT_GEN_MODEL.test(String(model || ''));
}

/** Build the model-appropriate request body shared by both entry points. */
function buildParams(model, maxTokens, temperature) {
  const params = { model, max_tokens: maxTokens };
  if (isCurrentGenerationModel(model)) {
    // Sampling params are a 400 on these models; thinking would otherwise eat
    // the max_tokens budget and truncate the answer.
    params.thinking = { type: 'disabled' };
  } else if (temperature !== undefined) {
    params.temperature = temperature;
  }
  return params;
}

let client = null;

async function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set in environment variables');
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    // llm.js withProviderRetry is the only caller and owns retry policy. The
    // SDK's own default retries (2, including 429s and timeouts) multiplied
    // each wrapper attempt and retried failures the wrapper deliberately stops on.
    client = new Anthropic({ apiKey, maxRetries: 0 });
  }
  return client;
}

function normalizeCompletion(response) {
  const textBlock = response.content.find((block) => block.type === 'text');
  const completion = response.stop_reason === 'max_tokens'
    || response.stop_reason === 'model_context_window_exceeded'
    ? 'truncated'
    : response.stop_reason === 'refusal'
      ? 'filtered'
      : response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence'
        ? 'complete'
        : 'failed';
  return { text: textBlock?.text || '', completion };
}

function protectedTextPrompt(prompt) {
  return withHonestyPrefix(prompt);
}

function protectedChatMessages(messages, honestyPersona = '') {
  return withHonestySystem(messages, honestyPersona);
}

export async function generateTextResult(
  prompt,
  { model = DEFAULT_ANTHROPIC_MODEL, maxTokens = 2000, temperature = 0.7, timeoutMs = 30_000 } = {}
) {
  const anthropic = await getClient();
  const response = await anthropic.messages.create(
    {
      ...buildParams(model || DEFAULT_ANTHROPIC_MODEL, maxTokens, temperature),
      messages: [{ role: 'user', content: protectedTextPrompt(prompt) }],
    },
    { timeout: timeoutMs }
  );
  return normalizeCompletion(response);
}

export async function generateText(prompt, options = {}) {
  return (await generateTextResult(prompt, options)).text;
}

export async function generateChatResponseResult(
  messages,
  {
    model = DEFAULT_ANTHROPIC_MODEL,
    maxTokens = 2000,
    temperature = 0.7,
    timeoutMs = 30_000,
    honestyPersona = '',
  } = {}
) {
  const anthropic = await getClient();

  // Only the FIRST system message is honoured. Concatenating user-supplied
  // system messages would let a chat client keep injecting "ignore previous
  // instructions" without ever evicting the server-side guard rails.
  let systemPrompt = '';
  const chatMessages = [];

  for (const msg of protectedChatMessages(messages, honestyPersona)) {
    if (msg.role === 'system') {
      if (!systemPrompt) systemPrompt = msg.content;
      // Subsequent system messages are silently dropped.
      continue;
    }
    chatMessages.push({ role: msg.role, content: msg.content });
  }

  const params = {
    ...buildParams(model || DEFAULT_ANTHROPIC_MODEL, maxTokens, temperature),
    messages: chatMessages,
  };

  if (systemPrompt) {
    params.system = systemPrompt;
  }

  const response = await anthropic.messages.create(params, { timeout: timeoutMs });
  return normalizeCompletion(response);
}

export async function generateChatResponse(messages, options = {}) {
  return (await generateChatResponseResult(messages, options)).text;
}

export const __test = {
  normalizeCompletion,
  protectedChatMessages,
  protectedTextPrompt,
};
