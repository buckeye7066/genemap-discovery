import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit, recordUsage } from '../middleware/entitlements.js';
import { generateExplanation, generateChatResponse, generateImage } from '../services/llm.js';
import { withHonestyPrefix, honestySystemMessage } from '../services/scientificHonesty.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError } from '../utils/errors.js';
import { MAX_PROMPT_CHARS, MAX_CHAT_MESSAGES, MAX_MESSAGE_CHARS } from '../config/llmLimits.js';

// Hard ceiling on tokens per call. Premium users can request up to this
// limit; free-tier users are additionally bounded by enforceUsageLimit.
const ABSOLUTE_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOKENS = 1500;
const PREMIUM_MAX_TOKENS = 4096;

// Input-size ceilings live in ../config/llmLimits.js (env-tunable, single source
// of truth). Token clamping only limits *output*; these bound the *input* so an
// unbounded prompt or a huge message array can't reach the provider unchecked.

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

// Match the education routes' model choice. The default gpt-4o "routinely runs
// 25-40s" on large prompts (see education.js), and Anastasia/Robert send LARGER
// prompts than education does — so on gpt-4o they intermittently blew past
// LLM_TIMEOUT_MS and returned the user an empty/timeout error. The faster model
// returns comfortably inside the window with more than enough quality here.
// Only applied when the caller doesn't pin a specific provider (so an explicit
// provider still uses its own default model). Override via LLM_INVOKE_TEXT_MODEL.
const INVOKE_TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const INVOKE_TEXT_MODEL = process.env.LLM_INVOKE_TEXT_MODEL
  || process.env.LLM_EDU_TEXT_MODEL
  || (INVOKE_TEXT_PROVIDER === 'openai' || INVOKE_TEXT_PROVIDER === 'gpt' ? 'gpt-4o-mini' : undefined);

const GENOMIC_LLM_CONSENT_TYPE = 'genomic_llm_upload';
const GENOMIC_LLM_CONSENT_VERSION = '1.0';

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

function looksLikeRawGenomicContent(text) {
  if (typeof text !== 'string') return false;
  if (/#CHROM\s+POS\s+ID\s+REF\s+ALT/i.test(text)) return true;
  const variantLines = text.split(/\r?\n/).filter((line) =>
    /^(chr)?([0-9]{1,2}|X|Y|MT|M)\s+\d+\s+(\S+|\.)\s+[ACGTN]+\s+[ACGTN,]+/i.test(line.trim())
  );
  return variantLines.length >= 3;
}

async function assertNoRawGenomicLLM(prisma, userId, text) {
  if (!looksLikeRawGenomicContent(text)) return;

  if (process.env.ALLOW_GENOMIC_LLM_UPLOAD !== 'true') {
    throw new ValidationError('Raw VCF/genomic file content is not allowed in LLM requests by default');
  }

  const consent = await prisma.consentRecord.findFirst({
    where: {
      userId,
      consentType: GENOMIC_LLM_CONSENT_TYPE,
      version: GENOMIC_LLM_CONSENT_VERSION,
      granted: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!consent) {
    throw new ValidationError(`Consent required: ${GENOMIC_LLM_CONSENT_TYPE} v${GENOMIC_LLM_CONSENT_VERSION}`);
  }

  await createAuditLog(
    prisma,
    {
      userId,
      action: 'llm.genomic_upload',
      entityType: 'llm',
      metadata: { contentLength: text.length },
    },
    { required: true }
  );
}

export default async function llmRoutes(fastify) {
  const prisma = fastify.prisma;

  // Every /llm/* route requires authentication, an active entitlement
  // (free or premium), and consumes the per-user daily usage budget.
  const guarded = [authenticate, checkEducationEntitlement, enforceUsageLimit];

  fastify.post('/invoke', { preHandler: guarded }, async (request) => {
    const { prompt, options = {} } = request.body || {};
    validatePrompt(prompt);
    await assertNoRawGenomicLLM(prisma, request.user.userId, prompt);

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    const result = await generateExplanation(withHonestyPrefix(prompt), {
      provider: options.provider,
      model: options.provider ? undefined : INVOKE_TEXT_MODEL,
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
    await assertNoRawGenomicLLM(
      prisma,
      request.user.userId,
      sanitized.map((message) => message.content).join('\n')
    );

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    // The generic proxy has no persona of its own; inject only the honesty
    // guard rails as the single leading system message. (recordUsage below
    // still counts `sanitized.length` so the extra message is not billed.)
    const result = await generateChatResponse([honestySystemMessage(), ...sanitized], {
      provider: options.provider,
      model: options.provider ? undefined : INVOKE_TEXT_MODEL,
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
