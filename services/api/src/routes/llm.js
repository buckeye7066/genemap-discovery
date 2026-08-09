import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit, recordUsage } from '../middleware/entitlements.js';
import { generateExplanation } from '../services/llm.js';
import { withHonestyPrefix } from '../services/scientificHonesty.js';
import { assertNoRawGenomicLLM } from '../services/genomicGuard.js';
import { sanitizePublicationTaskOutput } from '../services/publicationTaskOutput.js';
import { createAuditLog } from '../utils/audit.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { MAX_PROMPT_CHARS } from '../config/llmLimits.js';
import {
  composePublicationPrompt,
  hasRawGenerationInput,
  parsePublicationTaskInput,
} from '../config/publicationTaskContracts.js';
import { resolvePublicationTaskReferences } from '../services/publicationResolvers.js';

// Hard ceiling on tokens per call. Premium users can request up to this
// limit; free-tier users are additionally bounded by enforceUsageLimit.
const ABSOLUTE_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOKENS = 1500;
const PREMIUM_MAX_TOKENS = 4096;
const STRUCTURED_LLM_TASKS = new Set([
  'aggregate_genomics_research',
  'candidate_gene_research',
  'research_hypothesis',
  'learning_activity_summary',
]);

// Input-size ceilings live in ../config/llmLimits.js (env-tunable, single source
// of truth). Token clamping only limits *output*; these bound the *input* so an
// unbounded prompt or a huge message array can't reach the provider unchecked.

const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

// Match the education routes' model choice. Structured research inputs can be
// larger than a guided tutor request, so keep a bounded fast default that stays
// inside LLM_TIMEOUT_MS. Explicit provider selection still uses its own model.
// Only applied when the caller doesn't pin a specific provider (so an explicit
// provider still uses its own default model). Override via LLM_INVOKE_TEXT_MODEL.
const INVOKE_TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const INVOKE_TEXT_MODEL = process.env.LLM_INVOKE_TEXT_MODEL
  || process.env.LLM_EDU_TEXT_MODEL
  || (INVOKE_TEXT_PROVIDER === 'openai' || INVOKE_TEXT_PROVIDER === 'gpt' ? 'gpt-4o-mini' : undefined);

/** Return the exact state used by both /readyz and provider-facing routes. */
export function isModelPublicationEnabled(source = process.env) {
  return source.DISABLE_MODEL_PUBLICATION !== '1';
}

/**
 * Emergency fail-closed switch for every generated publication surface.
 *
 * Set DISABLE_MODEL_PUBLICATION=1 before a risky recovery, provider incident,
 * or rollback. This check runs after authentication/entitlement but before
 * quota accounting, external-reference resolution, prompt composition, and the
 * provider call, so a disabled request neither publishes output nor consumes a
 * user's allowance.
 */
export function assertModelPublicationEnabled(source = process.env) {
  if (!isModelPublicationEnabled(source)) {
    throw new AppError(
      'Generated research and learning content is temporarily unavailable during safe recovery.',
      503,
    );
  }
}

/** Fastify prehandler wrapper; do not let request become the helper's source. */
function requireModelPublicationEnabled() {
  assertModelPublicationEnabled(process.env);
}

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new ValidationError('prompt (string) is required');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new ValidationError(`prompt must be ${MAX_PROMPT_CHARS} characters or fewer`);
  }
}

function structuredTaskRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('a structured publication task is required');
  }
  if (hasRawGenerationInput(body)) {
    throw new ValidationError('raw prompt, messages, context, and topic fields are not accepted');
  }
  const topLevelTask = typeof body.publicationTask === 'string'
    ? body.publicationTask.trim()
    : '';
  const optionTask = typeof body.options?.publicationTask === 'string'
    ? body.options.publicationTask.trim()
    : '';
  if (topLevelTask && optionTask && topLevelTask !== optionTask) {
    throw new ValidationError('conflicting publication tasks are not accepted');
  }
  const publicationTask = topLevelTask || optionTask;
  if (!STRUCTURED_LLM_TASKS.has(publicationTask)) {
    throw new ValidationError('a recognized structured LLM publication task is required');
  }
  const parsed = parsePublicationTaskInput(publicationTask, body.taskInput, {
    routePath: '/llm/invoke',
  });
  if (!parsed.ok) {
    throw new ValidationError(parsed.reason || 'invalid structured publication task');
  }
  return { publicationTask, taskInput: parsed.value };
}

function structuredInvocation(body, resolvedReferences = {}) {
  const { publicationTask } = structuredTaskRequest(body);
  const composed = composePublicationPrompt(publicationTask, body.taskInput, {
    routePath: '/llm/invoke',
    ...resolvedReferences,
  });
  if (!composed.ok) {
    throw new ValidationError(composed.reason || 'invalid structured publication task');
  }
  validatePrompt(composed.prompt);
  return {
    publicationTask,
    taskInput: composed.value,
    prompt: composed.prompt,
  };
}

export function prepareStructuredInvocation(dependencies = {}) {
  return async function preparePublicationInvocation(request) {
    const preliminary = structuredTaskRequest(request.body);
    const resolvedReferences = await resolvePublicationTaskReferences(
      preliminary.publicationTask,
      preliminary.taskInput,
      dependencies,
    );
    request.publicationInvocation = structuredInvocation(request.body, resolvedReferences);
  };
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

  // Every /llm/* route requires authentication and an active entitlement.
  // The recovery switch precedes quota accounting and all provider-facing work.
  // External identifiers are then server-resolved in preHandler. The route
  // handler is never entered for a disabled publication surface or for
  // forged/mismatched gene IDs and nonexistent/obsolete HPO IDs.
  const guarded = [
    authenticate,
    checkEducationEntitlement,
    requireModelPublicationEnabled,
    enforceUsageLimit,
    prepareStructuredInvocation(),
  ];

  fastify.post('/invoke', { preHandler: guarded }, async (request) => {
    const { options = {} } = request.body || {};
    const { publicationTask, taskInput, prompt } = request.publicationInvocation;
    const allowGenomic = await assertNoRawGenomicLLM(prisma, request.user.userId, prompt);

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(options.maxTokens, isPremium);
    const temperature = clampTemperature(options.temperature);

    const result = await generateExplanation(withHonestyPrefix(prompt), {
      provider: options.provider,
      model: options.provider ? undefined : INVOKE_TEXT_MODEL,
      maxTokens,
      temperature,
      timeoutMs: LLM_TIMEOUT_MS,
      allowGenomic,
    });
    const safeResult = sanitizePublicationTaskOutput(publicationTask, taskInput, result);

    await recordUsage(prisma, request.user.userId, 'explanation', {
      maxTokens,
      provider: options.provider || null,
      publicationTask,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_invoke',
      entityType: 'llm',
      metadata: {
        publicationTask,
        taskInputVersion: taskInput.version,
        maxTokens,
        provider: options.provider || null,
      },
    });

    return { result: safeResult, disclaimer: 'For educational purposes only. Not medical advice.' };
  });

  fastify.post('/chat', { preHandler: guarded }, async () => {
    throw new ValidationError(
      'arbitrary chat is not available; use a structured publication task or the guided genetics tutor'
    );
  });

  fastify.post('/image', { preHandler: guarded }, async () => {
    throw new ValidationError(
      'arbitrary image generation is not available; use the bounded genetics education image route'
    );
  });
}

export const __test = {
  isModelPublicationEnabled,
  assertModelPublicationEnabled,
  clampTokens,
  clampTemperature,
  validatePrompt,
  structuredInvocation,
  structuredTaskRequest,
  ABSOLUTE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
  PREMIUM_MAX_TOKENS,
  MAX_PROMPT_CHARS,
};
