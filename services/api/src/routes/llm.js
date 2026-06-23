import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit, recordUsage } from '../middleware/entitlements.js';
import { generateExplanation, generateChatResponse, generateImage } from '../services/llm.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError } from '../utils/errors.js';

// Hard ceiling on tokens per call. Premium users can request up to this
// limit; free-tier users are additionally bounded by enforceUsageLimit.
const ABSOLUTE_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOKENS = 1500;
const PREMIUM_MAX_TOKENS = 4096;

// Bound the *input* too. Token clamping only limits output; without these an
// unbounded prompt or a 10k-message array reaches the provider, burning cost
// (and possibly OOMing the request) before the API rejects it.
const MAX_PROMPT_CHARS = 24_000; // ~6k tokens of input
const MAX_CHAT_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 24_000;

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new ValidationError('prompt (string) is required');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new ValidationError(`prompt must be ${MAX_PROMPT_CHARS} characters or fewer`);
  }
}

function clampTokens(requested, isPremium) {
  const ceiling = isPremium ? PREMIUM_MAX_TOKENS : Math.min(DEFAULT_MAX_TOKENS, ABSOLUTE_MAX_TOKENS);
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return Math.min(DEFAULT_MAX_TOKENS, ceiling);
  }
  return Math.min(Math.floor(requested), ceiling);
}

function clampTemperature(requested) {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return 0.7;
  return Math.max(0, Math.min(2, requested));
}

export default async function llmRoutes(fastify) {
  const prisma = fastify.prisma;

  // Every /llm/* route requires authentication, an active entitlement
  // (free or premium), and consumes the per-user daily usage budget.
  const guarded = [authenticate, checkEducationEntitlement, enforceUsageLimit];

  fastify.post('/invoke', { preHandler: guarded }, async (request) => {
    const { prompt, options = {} } = request.body || {};
    validatePrompt(prompt);

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    const result = await generateExplanation(prompt, {
      provider: options.provider,
      maxTokens,
      temperature,
      timeoutMs: LLM_TIMEOUT_MS,
    });

    await recordUsage(prisma, request.user.userId, 'explanation', {
      maxTokens,
      provider: options.provider || null,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_invoke',
      entityType: 'llm',
      metadata: { promptLength: prompt.length, maxTokens, provider: options.provider || null },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });

  fastify.post('/chat', { preHandler: guarded }, async (request) => {
    const { messages, options = {} } = request.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('messages (non-empty array) is required');
    }
    if (messages.length > MAX_CHAT_MESSAGES) {
      throw new ValidationError(`messages must contain ${MAX_CHAT_MESSAGES} turns or fewer`);
    }
    if (messages.some((m) => typeof m?.content === 'string' && m.content.length > MAX_MESSAGE_CHARS)) {
      throw new ValidationError(`each message must be ${MAX_MESSAGE_CHARS} characters or fewer`);
    }

    // Strip any client-supplied system messages. The /llm/chat surface is
    // intentionally a thin proxy, but allowing role:'system' here would let
    // the SPA bypass the safety prompts in /education/chat.
    const sanitized = messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant'));
    if (sanitized.length === 0) {
      throw new ValidationError('messages must contain at least one user/assistant turn');
    }

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    const result = await generateChatResponse(sanitized, {
      provider: options.provider,
      maxTokens,
      temperature,
      timeoutMs: LLM_TIMEOUT_MS,
    });

    await recordUsage(prisma, request.user.userId, 'chat', {
      messageCount: sanitized.length,
      maxTokens,
      provider: options.provider || null,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_chat',
      entityType: 'llm',
      metadata: { messageCount: sanitized.length, maxTokens, provider: options.provider || null },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });

  fastify.post('/image', { preHandler: guarded }, async (request) => {
    const { prompt, options = {} } = request.body || {};
    validatePrompt(prompt);

    const result = await generateImage(prompt, {
      size: options.size || '1024x1024',
      quality: options.quality || 'standard',
      timeoutMs: LLM_TIMEOUT_MS,
    });

    await recordUsage(prisma, request.user.userId, 'image', {
      size: options.size || '1024x1024',
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_image',
      entityType: 'llm',
      metadata: { promptLength: prompt.length, size: options.size || '1024x1024' },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });
}

export const __test = {
  clampTokens,
  clampTemperature,
  validatePrompt,
  ABSOLUTE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
  PREMIUM_MAX_TOKENS,
  MAX_PROMPT_CHARS,
  MAX_CHAT_MESSAGES,
  MAX_MESSAGE_CHARS,
};
