import * as openaiService from './openai.js';
import * as anthropicService from './anthropic.js';

const TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const DEFAULT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

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

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through; return raw text so the caller can debug formatting issues.
  }
  return raw;
}
