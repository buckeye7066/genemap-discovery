// Lazy-load the OpenAI SDK so the rest of the API can boot when
// OPENAI_API_KEY is unset and so tests can mock the wrapper.

import { withHonestyPrefix, withHonestySystem } from './scientificHonesty.js';

let client = null;

async function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    const { default: OpenAI } = await import('openai');
    // llm.js withProviderRetry is the only caller and owns retry policy. The
    // SDK's own default retries (2, including 429s and timeouts) multiplied
    // each wrapper attempt and retried failures the wrapper deliberately stops on.
    client = new OpenAI({ apiKey, maxRetries: 0 });
  }
  return client;
}

function normalizeCompletion(response) {
  const choice = response.choices?.[0];
  const finishReason = choice?.finish_reason;
  // Chat Completions can carry a message-level refusal while still reporting
  // `finish_reason: "stop"` (and often `content: null`). Treat any non-null
  // refusal payload as provider filtering before classifying the finish reason.
  // The refusal itself is never returned, so downstream publication and
  // persistence boundaries cannot accidentally expose provider refusal text.
  const refused = choice?.message?.refusal != null;
  const completion = refused
    ? 'filtered'
    : finishReason === 'length'
      ? 'truncated'
      : finishReason === 'content_filter'
        ? 'filtered'
        : finishReason === 'stop'
          ? 'complete'
          : 'failed';
  return {
    text: refused ? '' : choice?.message?.content || '',
    completion,
  };
}

function protectedTextPrompt(prompt) {
  return withHonestyPrefix(prompt);
}

function protectedChatMessages(messages, honestyPersona = '') {
  return withHonestySystem(messages, honestyPersona);
}

export async function generateTextResult(
  prompt,
  { model = 'gpt-4o', maxTokens = 2000, temperature = 0.7, timeoutMs = 30_000 } = {}
) {
  const openai = await getClient();
  // The OpenAI SDK accepts a per-request timeout that aborts the underlying
  // HTTP call, so we no longer rely solely on a wrapper Promise.race that
  // would resolve the route handler while the upstream kept burning tokens.
  const response = await openai.chat.completions.create(
    {
      model,
      messages: [{ role: 'user', content: protectedTextPrompt(prompt) }],
      max_tokens: maxTokens,
      temperature,
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
    model = 'gpt-4o',
    maxTokens = 2000,
    temperature = 0.7,
    timeoutMs = 30_000,
    honestyPersona = '',
  } = {}
) {
  const openai = await getClient();
  const response = await openai.chat.completions.create(
    {
      model,
      messages: protectedChatMessages(messages, honestyPersona),
      max_tokens: maxTokens,
      temperature,
    },
    { timeout: timeoutMs }
  );
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
