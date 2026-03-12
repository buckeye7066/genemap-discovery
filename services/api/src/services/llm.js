import * as openaiService from './openai.js';
import * as anthropicService from './anthropic.js';

const TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const IMAGE_PROVIDER = process.env.LLM_IMAGE_PROVIDER || 'openai';

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

export async function generateExplanation(prompt, { provider, maxTokens = 2000, temperature = 0.7 } = {}) {
  const service = getTextProvider(provider);
  return service.generateText(prompt, { maxTokens, temperature });
}

export async function generateChatResponse(messages, { provider, maxTokens = 2000, temperature = 0.7 } = {}) {
  const service = getTextProvider(provider);
  return service.generateChatResponse(messages, { maxTokens, temperature });
}

export async function generateImage(prompt, { size = '1024x1024', quality = 'standard' } = {}) {
  return openaiService.generateImage(prompt, { size, quality });
}

export async function generateQuiz(prompt, { provider, maxTokens = 3000 } = {}) {
  const service = getTextProvider(provider);
  const raw = await service.generateText(prompt, { maxTokens, temperature: 0.5 });

  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Fall through
  }
  return raw;
}
