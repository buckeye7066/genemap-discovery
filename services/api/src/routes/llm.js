import {
  canUsePublicationContent,
  createPublicationArtifact,
  PUBLICATION_STATUSES,
} from '@genemap/shared';
import { authenticate } from '../middleware/auth.js';
import {
  checkEducationEntitlement,
  recordUsage,
  requireResearchAi,
} from '../middleware/entitlements.js';
import { generateExplanation } from '../services/llm.js';
import { withHonestyPrefix } from '../services/scientificHonesty.js';
import { assertNoRawGenomicLLM } from '../services/genomicGuard.js';
import { sanitizePublicationArtifact } from '../services/publicationTaskOutput.js';
import { createAuditLog } from '../utils/audit.js';
import { AppError, ValidationError } from '../utils/errors.js';
import { MAX_PROMPT_CHARS } from '../config/llmLimits.js';
import {
  composePublicationPrompt,
  hasRawGenerationInput,
  parsePublicationTaskInput,
} from '../config/publicationTaskContracts.js';
import { resolvePublicationTaskReferences } from '../services/publicationResolvers.js';
import { textRuntimeConfig } from '../config/llmRuntime.js';

const ABSOLUTE_MAX_TOKENS = 4096;
const DEFAULT_MAX_TOKENS = 1500;
const PREMIUM_MAX_TOKENS = 4096;
const STRUCTURED_LLM_TASKS = new Set([
  'aggregate_genomics_research',
  'candidate_gene_research',
  'research_hypothesis',
  'learning_activity_summary',
]);
const INVOKE_BODY_KEYS = new Set(['publicationTask', 'taskInput', 'options']);
const GENERATION_OPTION_KEYS = new Set([
  'temperature',
  'maxTokens',
]);

const DEFAULT_LLM_TIMEOUT_MS = 30_000;
const DEFAULT_CANDIDATE_TIMEOUT_MS = 90_000;
const MIN_CANDIDATE_TIMEOUT_MS = 30_000;
const MAX_CANDIDATE_TIMEOUT_MS = 120_000;
const INVOKE_TEXT_RUNTIME = textRuntimeConfig('invoke');

function configuredTimeoutMs(raw, fallback) {
  if (raw === undefined || raw === '') return fallback;
  const timeoutMs = Number(raw);
  return Number.isFinite(timeoutMs) && timeoutMs > 0
    ? Math.floor(timeoutMs)
    : fallback;
}

/**
 * Candidate-gene generation can use the full 4,096-token premium allowance,
 * so it receives a longer provider deadline than the other structured tasks.
 * Keep the override server-owned and bounded: callers cannot select a timeout,
 * and a bad deployment value cannot create an unbounded request.
 */
function publicationTaskTimeoutMs(publicationTask, source = process.env) {
  if (publicationTask !== 'candidate_gene_research') {
    return configuredTimeoutMs(source.LLM_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
  }

  const configured = configuredTimeoutMs(
    source.LLM_CANDIDATE_TIMEOUT_MS,
    DEFAULT_CANDIDATE_TIMEOUT_MS,
  );
  return Math.max(
    MIN_CANDIDATE_TIMEOUT_MS,
    Math.min(MAX_CANDIDATE_TIMEOUT_MS, configured),
  );
}

/** Return the exact state used by both /readyz and provider-facing routes. */
export function isModelPublicationEnabled(source = process.env) {
  return source.DISABLE_MODEL_PUBLICATION !== '1';
}

/**
 * Emergency fail-closed switch for every generated publication surface.
 * It precedes quota accounting, reference resolution, prompt composition, and
 * provider access, so disabled requests publish nothing and consume no quota.
 */
export function assertModelPublicationEnabled(source = process.env) {
  if (!isModelPublicationEnabled(source)) {
    throw new AppError(
      'Generated research and learning content is temporarily unavailable during safe recovery.',
      503,
    );
  }
}

/**
 * Fastify hook wrapper. It is deliberately async: a synchronous hook that
 * neither returns a promise nor calls `done` leaves the request suspended.
 */
async function requireModelPublicationEnabled(request) {
  if (isModelPublicationEnabled(process.env)) return;
  const error = new AppError(
    'Generated research and learning content is temporarily unavailable during safe recovery.',
    503,
  );
  error.code = 'MODEL_PUBLICATION_DISABLED';
  error.details = {
    publication: createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: 'model_publication_disabled',
      correlationId: publicationCorrelationId(request),
    }),
  };
  throw error;
}

function validatePrompt(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    throw new ValidationError('prompt (string) is required');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new ValidationError(`prompt must be ${MAX_PROMPT_CHARS} characters or fewer`);
  }
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function hasOnlyKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function validateGenerationOptions(options) {
  if (options === undefined) return;
  if (options === null) {
    throw new ValidationError('generation options must be an object');
  }
  if (!hasOnlyKeys(options, GENERATION_OPTION_KEYS)) {
    throw new ValidationError('generation options contain unsupported fields');
  }
  for (const field of ['temperature', 'maxTokens']) {
    if (options[field] != null
      && (typeof options[field] !== 'number' || !Number.isFinite(options[field]))) {
      throw new ValidationError(`${field} must be a finite number`);
    }
  }
}

function structuredTaskRequest(body) {
  if (!hasOnlyKeys(body, INVOKE_BODY_KEYS)) {
    throw new ValidationError('a structured publication task is required');
  }
  validateGenerationOptions(body.options);
  if (hasRawGenerationInput(body)) {
    throw new ValidationError('raw prompt, messages, context, and topic fields are not accepted');
  }
  const topLevelTask = typeof body.publicationTask === 'string'
    ? body.publicationTask
    : '';
  if ((body.publicationTask != null && typeof body.publicationTask !== 'string')
    || topLevelTask !== topLevelTask.trim()) {
    throw new ValidationError('publication task identifiers must be exact canonical values');
  }
  const publicationTask = topLevelTask;
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

/**
 * Resolve only server-owned external references. Optional dependencies make the
 * boundary deterministic in integration tests without changing production's
 * default resolvers.
 */
export function prepareStructuredInvocation(dependencies = {}) {
  return async function preparePublicationInvocation(request) {
    const preliminary = request.publicationPreliminary || structuredTaskRequest(request.body);
    const resolvedReferences = await resolvePublicationTaskReferences(
      preliminary.publicationTask,
      preliminary.taskInput,
      dependencies,
    );
    request.publicationInvocation = structuredInvocation(request.body, resolvedReferences);
  };
}

async function prepareStructuredRequest(request) {
  request.publicationPreliminary = structuredTaskRequest(request.body);
}

function clampTokens(requested, isPremium) {
  const ceiling = isPremium
    ? PREMIUM_MAX_TOKENS
    : Math.min(DEFAULT_MAX_TOKENS, ABSOLUTE_MAX_TOKENS);
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested <= 0) {
    return Math.min(DEFAULT_MAX_TOKENS, ceiling);
  }
  return Math.min(Math.floor(requested), ceiling);
}

function clampTemperature(requested) {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return 0.7;
  return Math.max(0, Math.min(2, requested));
}

function publicationCorrelationId(request) {
  const normalizedRequestId = String(request.id || 'request')
    .replace(/[^A-Za-z0-9_.:-]/gu, '-')
    .slice(0, 96) || 'request';
  const requestId = /^[A-Za-z0-9]/u.test(normalizedRequestId)
    ? normalizedRequestId
    : `request-${normalizedRequestId}`.slice(0, 96);
  return `${requestId}:llm-invoke`;
}

function providerFailureReason(error) {
  if (error?.code === 'LLM_PROVIDER_TIMEOUT') return 'provider_timeout';
  if (error?.code === 'LLM_PROVIDER_CONNECTION') return 'provider_connection';
  if (error?.code === 'LLM_PROVIDER_ERROR') return 'provider_error';
  return 'provider_unavailable';
}

function unavailablePublication(request, error) {
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.UNAVAILABLE,
    reasonCode: providerFailureReason(error),
    correlationId: publicationCorrelationId(request),
  });
}

export default async function llmRoutes(fastify, options = {}) {
  const prisma = fastify.prisma;
  const invokeGuards = [
    authenticate,
    checkEducationEntitlement,
    requireResearchAi,
    requireModelPublicationEnabled,
    prepareStructuredRequest,
    prepareStructuredInvocation(options.publicationResolverDependencies || {}),
  ];

  fastify.post('/invoke', { preHandler: invokeGuards }, async (request) => {
    const { options: generationOptions = {} } = request.body || {};
    const { publicationTask, taskInput, prompt } = request.publicationInvocation;
    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      request.user.userId,
      prompt,
    );

    const isPremium = Boolean(request.entitlements?.isPremium);
    const maxTokens = clampTokens(generationOptions.maxTokens, isPremium);
    const temperature = clampTemperature(generationOptions.temperature);

    let publication;
    try {
      const providerResult = await generateExplanation(withHonestyPrefix(prompt), {
        provider: INVOKE_TEXT_RUNTIME.provider,
        model: INVOKE_TEXT_RUNTIME.model,
        maxTokens,
        temperature,
        timeoutMs: publicationTaskTimeoutMs(publicationTask),
        allowGenomic,
        includeMetadata: true,
      });
      publication = sanitizePublicationArtifact(
        publicationTask,
        taskInput,
        providerResult,
        { correlationId: publicationCorrelationId(request) },
      );
    } catch (error) {
      request.log.warn({ code: error?.code, publicationTask }, 'publication provider failed');
      publication = unavailablePublication(request, error);
    }

    const publicationHasContent = canUsePublicationContent(publication);
    const sessionType = publicationHasContent ? 'explanation' : 'publication_status';
    try {
      await prisma.$transaction(async (tx) => {
        await recordUsage(tx, request.user.userId, sessionType, {
          maxTokens,
          provider: INVOKE_TEXT_RUNTIME.provider,
          publicationTask,
          publication,
          publicationStatus: publication.status,
          publicationReasonCode: publication.reasonCode,
        });

        await createAuditLog(tx, {
          userId: request.user.userId,
          action: 'llm_invoke',
          entityType: 'llm',
          metadata: {
            publicationTask,
            taskInputVersion: taskInput.version,
            maxTokens,
            provider: INVOKE_TEXT_RUNTIME.provider,
            publicationStatus: publication.status,
            publicationReasonCode: publication.reasonCode,
          },
        }, { required: true });
      });
    } catch (error) {
      if (error?.code === 'USAGE_ACCOUNTING_UNAVAILABLE') throw error;
      request.log.error(
        { code: error?.code || 'RESEARCH_RESULT_ACCOUNTING_FAILED' },
        'research result accounting transaction failed',
      );
      const unavailable = new AppError(
        'Research result accounting is temporarily unavailable. Please retry shortly.',
        503,
      );
      unavailable.code = 'RESULT_ACCOUNTING_UNAVAILABLE';
      throw unavailable;
    }

    return {
      publication,
      disclaimer: 'For educational purposes only. Not medical advice.',
    };
  });
}

export const __test = {
  isModelPublicationEnabled,
  assertModelPublicationEnabled,
  clampTokens,
  clampTemperature,
  validatePrompt,
  validateGenerationOptions,
  publicationTaskTimeoutMs,
  structuredInvocation,
  structuredTaskRequest,
  prepareStructuredRequest,
  ABSOLUTE_MAX_TOKENS,
  DEFAULT_MAX_TOKENS,
  PREMIUM_MAX_TOKENS,
  DEFAULT_LLM_TIMEOUT_MS,
  DEFAULT_CANDIDATE_TIMEOUT_MS,
  MIN_CANDIDATE_TIMEOUT_MS,
  MAX_CANDIDATE_TIMEOUT_MS,
  MAX_PROMPT_CHARS,
};
