import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit, recordUsage } from '../middleware/entitlements.js';
import { generateExplanation, generateChatResponse, generateImage } from '../services/llm.js';
import { withHonestyPrefix, honestySystemMessage } from '../services/scientificHonesty.js';
import { assertNoRawGenomicLLM } from '../services/genomicGuard.js';
import { consumePeerBriefing, recordProviderFailureLesson } from '../services/agentMesh.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError } from '../utils/errors.js';
import { MAX_PROMPT_CHARS, MAX_CHAT_MESSAGES, MAX_MESSAGE_CHARS } from '../config/llmLimits.js';
import { isRegisteredAgent } from '@genemap/shared';

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

// ─── Agent mesh wiring ───────────────────────────────────────────────────────
//
// The optional `agent` body field finally tells this persona-less proxy WHO is
// calling (see packages/shared/src/agentRegistry.ts). It is identity metadata,
// never a generation parameter, and it is the only thing gating mesh access.
//
// An unregistered/absent id is IGNORED rather than rejected: the field is
// additive, older web bundles and every non-persona caller (gene cards, VCF
// analysis, autocomplete, ...) send no agent at all, and a 400 here would turn
// a metadata mismatch into a broken feature. Every other field on this route
// keeps its existing loud ValidationError behaviour.
function resolveAgent(body) {
  const candidate = body?.agent;
  return isRegisteredAgent(candidate) ? candidate : null;
}

// The model this route actually asks for, as a stable string for mesh evidence.
function effectiveModel(options) {
  if (options?.provider) return String(options.provider);
  return INVOKE_TEXT_MODEL || 'default';
}

// Detached mesh work. Mesh calls are a SIDE CHANNEL: they must never fail, slow,
// or alter a user's request. Handles are retained only so tests can await the
// background work deterministically instead of racing a floating promise.
const backgroundMeshWork = [];

function fireAndForgetMeshWork(request, promise) {
  const tracked = Promise.resolve(promise).catch((error) => {
    request?.log?.warn?.({ err: error }, '[agentMesh] background work failed');
  });
  backgroundMeshWork.push(tracked);
  return tracked;
}

/**
 * Run-start: pull this agent's peer briefing. Fail-open — a mesh outage returns
 * null and the request proceeds exactly as it did before the mesh existed.
 */
async function peerNoteFor(request, prisma, agent) {
  if (!agent) return null;
  try {
    const briefing = await consumePeerBriefing(prisma, agent);
    return briefing?.note || null;
  } catch (error) {
    request?.log?.warn?.({ err: error }, '[agentMesh] peer briefing failed');
    return null;
  }
}

export default async function llmRoutes(fastify) {
  const prisma = fastify.prisma;

  // Every /llm/* route requires authentication, an active entitlement
  // (free or premium), and consumes the per-user daily usage budget.
  const guarded = [authenticate, checkEducationEntitlement, enforceUsageLimit];

  fastify.post('/invoke', { preHandler: guarded }, async (request) => {
    const { prompt, options = {} } = request.body || {};
    validatePrompt(prompt);
    const agent = resolveAgent(request.body);
    const allowGenomic = await assertNoRawGenomicLLM(prisma, request.user.userId, prompt);

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    // Peer note rides in withHonestyPrefix's `extra` slot, which places it
    // AFTER the scientific-honesty directive and BEFORE the user prompt. The
    // guard rails stay the leading text of every generation — see
    // services/scientificHonesty.js and __tests__/llm-chokepoint.test.js.
    const peerNote = await peerNoteFor(request, prisma, agent);

    let result;
    try {
      result = await generateExplanation(withHonestyPrefix(prompt, peerNote || ''), {
        provider: options.provider,
        model: options.provider ? undefined : INVOKE_TEXT_MODEL,
        maxTokens,
        temperature,
        timeoutMs: LLM_TIMEOUT_MS,
        allowGenomic,
      });
    } catch (error) {
      // Run-end teaching hook. Fire-and-forget so the caller still gets the
      // real provider error at the normal speed.
      fireAndForgetMeshWork(
        request,
        recordProviderFailureLesson(prisma, {
          agent,
          model: effectiveModel(options),
          error,
          userId: request.user.userId,
        })
      );
      throw error;
    }

    await recordUsage(prisma, request.user.userId, 'explanation', {
      maxTokens,
      provider: options.provider || null,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_invoke',
      entityType: 'llm',
      metadata: { promptLength: prompt.length, maxTokens, provider: options.provider || null, agent },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });

  fastify.post('/chat', { preHandler: guarded }, async (request) => {
    const { messages, options = {} } = request.body || {};
    const agent = resolveAgent(request.body);
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('messages (non-empty array) is required');
    }
    if (messages.length > MAX_CHAT_MESSAGES) {
      throw new ValidationError(`messages must contain ${MAX_CHAT_MESSAGES} turns or fewer`);
    }
    // Message content MUST be a plain string. Array/object content (e.g.
    // [{type:'text',text:'<VCF>'}]) is not a supported input here and, if
    // forwarded, would let a caller slip raw genomic text past a string-only
    // check while the provider still reads every part. Reject it outright.
    if (messages.some((m) => typeof m?.content !== 'string')) {
      throw new ValidationError('each message content must be a string');
    }
    if (messages.some((m) => m.content.length > MAX_MESSAGE_CHARS)) {
      throw new ValidationError(`each message must be ${MAX_MESSAGE_CHARS} characters or fewer`);
    }
    // Reject client-supplied tool/function fields. The model reads
    // tool_calls[].function.arguments and function_call.arguments as input, so
    // allowing them here would be a channel to smuggle raw genomic text past a
    // content-only check. This is a plain text proxy — tool calling is not a
    // supported input.
    if (messages.some((m) => m && (m.tool_calls != null || m.function_call != null || m.tool_call_id != null))) {
      throw new ValidationError('tool_calls/function_call are not allowed on this endpoint');
    }

    // Strip any client-supplied system messages, and whitelist each surviving
    // turn to exactly { role, content } so no other client-supplied field can
    // ride along to the provider. Allowing role:'system' would let the SPA
    // bypass the safety prompts in /education/chat.
    const sanitized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: m.content }));
    if (sanitized.length === 0) {
      throw new ValidationError('messages must contain at least one user/assistant turn');
    }
    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      request.user.userId,
      sanitized.map((message) => message.content).join('\n')
    );

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    // The generic proxy has no persona of its own; the honesty guard rails are
    // ALWAYS the leading system message. A server-composed peer note (only when
    // a registered agent is named, and only when the mesh has something to say)
    // may follow it as a second system message — never before it, never
    // replacing it. Client-supplied system messages remain stripped above.
    // (recordUsage below still counts `sanitized.length` so the server's own
    // system messages are not billed to the user.)
    const peerNote = await peerNoteFor(request, prisma, agent);
    const systemMessages = [honestySystemMessage()];
    if (peerNote) systemMessages.push({ role: 'system', content: peerNote });

    let result;
    try {
      result = await generateChatResponse([...systemMessages, ...sanitized], {
        provider: options.provider,
        model: options.provider ? undefined : INVOKE_TEXT_MODEL,
        maxTokens,
        temperature,
        timeoutMs: LLM_TIMEOUT_MS,
        allowGenomic,
      });
    } catch (error) {
      fireAndForgetMeshWork(
        request,
        recordProviderFailureLesson(prisma, {
          agent,
          model: effectiveModel(options),
          error,
          userId: request.user.userId,
        })
      );
      throw error;
    }

    await recordUsage(prisma, request.user.userId, 'chat', {
      messageCount: sanitized.length,
      maxTokens,
      provider: options.provider || null,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_chat',
      entityType: 'llm',
      metadata: { messageCount: sanitized.length, maxTokens, provider: options.provider || null, agent },
    });

    return { result, disclaimer: 'For educational purposes only. Not medical advice.' };
  });

  fastify.post('/image', { preHandler: guarded }, async (request) => {
    const { prompt, options = {} } = request.body || {};
    validatePrompt(prompt);
    const allowGenomic = await assertNoRawGenomicLLM(prisma, request.user.userId, prompt);

    const result = await generateImage(prompt, {
      size: options.size || '1024x1024',
      quality: options.quality || 'standard',
      timeoutMs: LLM_TIMEOUT_MS,
      allowGenomic,
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
  resolveAgent,
  effectiveModel,
  /** Await every detached mesh task so assertions never race the side channel. */
  flushMeshWork: () => Promise.all(backgroundMeshWork.splice(0)),
  ABSOLUTE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
  PREMIUM_MAX_TOKENS,
  MAX_PROMPT_CHARS,
  MAX_CHAT_MESSAGES,
  MAX_MESSAGE_CHARS,
};
