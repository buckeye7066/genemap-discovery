import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit } from '../middleware/entitlements.js';
import { generateExplanation, generateChatResponse, generateImage } from '../services/llm.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError } from '../utils/errors.js';

// Hard ceiling on tokens per call. Premium users can request up to this
// limit; free-tier users are additionally bounded by enforceUsageLimit.
// Caps cost amplification from a malicious or buggy client passing
// `options.maxTokens = 200000`.
const ABSOLUTE_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOKENS = 1500;
const PREMIUM_MAX_TOKENS = 4096;

// LLM upstream call timeout (ms). Anything beyond this is dropped to
// avoid unbounded request hold time.
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

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

function withTimeout(promise, ms, label = 'LLM call') {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export default async function llmRoutes(fastify) {
  const prisma = fastify.prisma;

  // Every /llm/* route requires authentication, an active entitlement
  // (free or premium), and consumes the per-user daily usage budget.
  // Educational disclaimer: outputs are not medical advice; UI surfaces
  // this disclaimer at render time.
  const guarded = [authenticate, checkEducationEntitlement, enforceUsageLimit];

  fastify.post('/invoke', { preHandler: guarded }, async (request) => {
    const { prompt, options = {} } = request.body || {};
    if (!prompt || typeof prompt !== 'string') {
      throw new ValidationError('prompt (string) is required');
    }

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    const result = await withTimeout(
      generateExplanation(prompt, { provider: options.provider, maxTokens, temperature }),
      LLM_TIMEOUT_MS,
      'llm.invoke',
    );

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_invoke',
      entityType: 'llm',
      // Never log the prompt itself — only metadata.
      metadata: { promptLength: prompt.length, maxTokens, provider: options.provider || null },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });

  fastify.post('/chat', { preHandler: guarded }, async (request) => {
    const { messages, options = {} } = request.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('messages (non-empty array) is required');
    }

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    const result = await withTimeout(
      generateChatResponse(messages, { provider: options.provider, maxTokens, temperature }),
      LLM_TIMEOUT_MS,
      'llm.chat',
    );

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_chat',
      entityType: 'llm',
      metadata: { messageCount: messages.length, maxTokens, provider: options.provider || null },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });

  fastify.post('/image', { preHandler: guarded }, async (request) => {
    const { prompt, options = {} } = request.body || {};
    if (!prompt || typeof prompt !== 'string') {
      throw new ValidationError('prompt (string) is required');
    }

    const result = await withTimeout(
      generateImage(prompt, { size: options.size || '1024x1024', quality: options.quality || 'standard' }),
      LLM_TIMEOUT_MS,
      'llm.image',
    );

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_image',
      entityType: 'llm',
      metadata: { promptLength: prompt.length, size: options.size || '1024x1024' },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });
}

// Exported for tests that want to assert clamping behaviour.
export const __test = { clampTokens, clampTemperature, ABSOLUTE_MAX_TOKENS, DEFAULT_MAX_TOKENS, PREMIUM_MAX_TOKENS };
