import { z } from 'zod';
import {
  canUsePublicationContent,
  createPublicationArtifact,
  PUBLICATION_STATUSES,
} from '@genemap/shared';
import { authenticate } from '../middleware/auth.js';
import {
  checkEducationEntitlement,
  enforceUsageLimit,
  finalizeUsageSession,
  releaseUsageReservation,
} from '../middleware/entitlements.js';
import * as llm from '../services/llm.js';
import {
  withHonestyPrefix,
  QUIZ_HONESTY_NOTE,
} from '../services/scientificHonesty.js';
import { getSources } from '../services/educationSources.js';
import {
  CURATED_EDUCATION_VERSION,
  curatedEducationExplanation,
  curatedEducationQuiz,
} from '../services/curatedEducationFallback.js';
import { assertNoRawGenomicLLM } from '../services/genomicGuard.js';
import {
  sanitizeEducationQuizArtifact,
  sanitizePublicationArtifact,
} from '../services/publicationTaskOutput.js';
import { AppError } from '../utils/errors.js';
import {
  resolveEducationTopic,
  TOPICS_CATALOG,
} from '../config/educationCatalog.js';
import { composePublicationPrompt } from '../config/publicationTaskContracts.js';
import { assertModelPublicationEnabled } from './llm.js';
import { textRuntimeConfig } from '../config/llmRuntime.js';

const EDUCATION_LEVELS = [
  'elementary',
  'middle_school',
  'high_school',
  'undergraduate',
  'graduate',
  'postgraduate',
];
const EDU_TEXT_RUNTIME = textRuntimeConfig('education');
const EDU_TIMEOUT_MS = Number(process.env.LLM_EDU_TIMEOUT_MS || 24_000);
const USAGE_RESERVATION_TYPES = [
  'quota_reservation:explanation',
  'quota_reservation:quiz',
  'quota_reservation:chat',
];

const levelField = z.enum(EDUCATION_LEVELS);
const topicField = z.string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);

const explainSchema = z.object({
  topic: topicField,
  level: levelField,
}).strict();

const quizSchema = z.object({
  topic: topicField,
  level: levelField,
  questionCount: z.number().int().min(1).max(20).optional(),
}).strict();

const chatSchema = z.object({
  publicationTask: z.literal('genetics_education'),
  taskInput: z.object({
    version: z.literal(1),
    topic: topicField,
    level: z.enum(EDUCATION_LEVELS),
    interaction: z.enum([
      'explain_another_way',
      'give_example',
      'compare_concepts',
      'check_understanding',
    ]),
  }).strict(),
}).strict();

const progressSchema = z.object({
  topicId: topicField,
  score: z.coerce.number().int().min(0).max(1_000_000),
  totalQuestions: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
}).strict();

const LEVEL_PROMPTS = {
  elementary: 'Explain like you are talking to a 7-year-old. Use very simple words, fun comparisons to everyday things. Avoid all scientific jargon. Keep sentences short and fun.',
  middle_school: 'Explain for a middle school science class. Introduce basic scientific terms but always define them. Use relatable analogies.',
  high_school: 'Explain at a high school AP Biology level. Use proper scientific terminology with brief definitions. Include molecular details where relevant.',
  undergraduate: 'Explain at an undergraduate genetics/molecular biology level. Use full scientific terminology. Discuss mechanisms, pathways, and experimental evidence.',
  graduate: 'Explain at a graduate-level genetics depth. Discuss current research, nuances, conflicting evidence, and methodological considerations.',
  postgraduate: 'Explain at a postdoctoral / principal investigator level. Assume deep familiarity with genetics. Focus on cutting-edge research and unresolved questions.',
};

function canonicalTopic(topicId) {
  const topic = resolveEducationTopic(topicId);
  if (!topic) {
    throw new AppError('A canonical genetics education topic identifier is required.', 400);
  }
  return topic;
}

function topicMetadata(topic) {
  return {
    id: topic.id,
    title: topic.title,
    description: topic.description,
    category: topic.category,
    catalogVersion: topic.catalogVersion,
  };
}

function publicationCorrelationId(request, surface) {
  const normalizedRequestId = String(request.id || 'request')
    .replace(/[^A-Za-z0-9_.:-]/gu, '-')
    .slice(0, 96) || 'request';
  const requestId = /^[A-Za-z0-9]/u.test(normalizedRequestId)
    ? normalizedRequestId
    : `request-${normalizedRequestId}`.slice(0, 96);
  return `${requestId}:${surface}`;
}

function unavailablePublication(request, surface, reasonCode = 'provider_unavailable') {
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.UNAVAILABLE,
    reasonCode,
    correlationId: publicationCorrelationId(request, surface),
  });
}

function providerFailureReason(error) {
  if (error?.code === 'LLM_PROVIDER_TIMEOUT') return 'provider_timeout';
  if (error?.code === 'LLM_PROVIDER_CONNECTION') return 'provider_connection';
  if (error?.code === 'LLM_PROVIDER_ERROR') return 'provider_error';
  return 'provider_unavailable';
}

function curatedFallbackArtifact(publication, request, surface, upstreamReason, details = []) {
  if (!canUsePublicationContent(publication)) return publication;
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.PARTIAL,
    content: publication.content,
    reasonCode: 'curated_curriculum_fallback',
    correlationId: publicationCorrelationId(request, surface),
    limitations: [
      `The configured model provider did not return reusable content (${upstreamReason || 'provider_unavailable'}).`,
      `Reviewed continuity curriculum version ${CURATED_EDUCATION_VERSION} was published instead.`,
      ...publication.limitations,
      ...details,
    ],
  });
}

function curatedExplanationPublication(request, topic, level, upstreamReason) {
  const surface = 'education-explanation';
  const publication = sanitizePublicationArtifact(
    'genetics_education',
    { surface: 'curated_explanation', topic: topic.id, level },
    curatedEducationExplanation(topic, level),
    { correlationId: publicationCorrelationId(request, surface) },
  );
  return curatedFallbackArtifact(publication, request, surface, upstreamReason);
}

function curatedQuizPublication(request, topic, level, questionCount, upstreamReason) {
  const surface = 'education-quiz';
  const questions = curatedEducationQuiz(topic, level, questionCount);
  const publication = sanitizeEducationQuizArtifact(questions, questions.length, {
    correlationId: publicationCorrelationId(request, surface),
  });
  const details = questions.length < questionCount
    ? [`The continuity quiz provides ${questions.length} of ${questionCount} requested questions.`]
    : [];
  return curatedFallbackArtifact(publication, request, surface, upstreamReason, details);
}

async function persistPublicationSession(prisma, request, {
  topic,
  level,
  type,
  publication,
  metadata = {},
}) {
  if (!request.user?.userId) return;
  await finalizeUsageSession(prisma, request, {
    topic: topic.id,
    level,
    type,
    content: { publication, ...metadata },
    counted: canUsePublicationContent(publication),
  });
}

function replayPublication(session, index) {
  const stored = session?.content?.publication;
  if (stored?.contractVersion === 1 && typeof stored.status === 'string') {
    try {
      return createPublicationArtifact({
        status: stored.status,
        content: stored.content,
        reasonCode: stored.reasonCode,
        correlationId: stored.correlationId,
        limitations: stored.limitations,
      });
    } catch {
      // Invalid or incomplete stored envelopes are legacy data, not publishable content.
    }
  }
  const sessionId = String(session?.id || index)
    .replace(/[^A-Za-z0-9_.:-]/gu, '-')
    .slice(0, 96) || String(index);
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.SUPERSEDED,
    reasonCode: 'legacy_status_missing',
    correlationId: `learning-session:${sessionId}`,
  });
}

/**
 * The emergency recovery switch applies before quota accounting and before any
 * provider-facing education call. This keeps `/education/*` consistent with
 * `/llm/invoke` during an incident or rollback.
 */
async function requireModelPublicationEnabled(request) {
  try {
    assertModelPublicationEnabled(process.env);
  } catch (error) {
    error.code = 'MODEL_PUBLICATION_DISABLED';
    error.details = {
      publication: createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'model_publication_disabled',
        correlationId: publicationCorrelationId(request, 'education-recovery'),
      }),
    };
    throw error;
  }
}

function prepareEducationRequest(schema) {
  return async function validateAndResolveEducationRequest(request) {
    const parsed = schema.parse(request.body);
    request.educationInput = {
      ...parsed,
      topic: canonicalTopic(parsed.topic),
    };
  };
}

async function prepareTutorRequest(request) {
  const parsed = chatSchema.parse(request.body);
  request.educationInput = {
    ...parsed,
    topic: canonicalTopic(parsed.taskInput.topic),
  };
}

function modelRoutePreHandlers(prepareRequest) {
  return [
    authenticate,
    checkEducationEntitlement,
    requireModelPublicationEnabled,
    prepareRequest,
    enforceUsageLimit,
  ];
}

export default async function educationRoutes(fastify) {
  const prisma = fastify.prisma;

  // A reservation is normally finalized by the handler. Release it when a
  // later guard or handler throws so validation/provider failures do not pin a
  // free-tier allowance. Process crashes are covered by the reservation TTL.
  fastify.addHook('onError', async (request) => {
    await releaseUsageReservation(prisma, request);
  });

  fastify.get('/topics', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return { categories: TOPICS_CATALOG };
  });

  fastify.post('/explain', {
    preHandler: modelRoutePreHandlers(prepareEducationRequest(explainSchema)),
  }, async (request) => {
    const { topic, level } = request.educationInput;
    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      request.user?.userId,
      topic.title,
    );

    const levelPrompt = LEVEL_PROMPTS[level];
    const prompt = [
      `You are a genetics educator. ${levelPrompt}`,
      `\nCatalog topic to explain: ${topic.title} (${topic.id}, catalog v${topic.catalogVersion})`,
      '\nStructure your response with these sections:',
      '## The Big Picture',
      'A high-level overview.',
      '## How It Works',
      'The mechanism or process.',
      '## Why It Matters',
      'Real-world relevance.',
      '## Key Takeaways',
      '3-5 bullet points summarizing the essentials.',
    ].join('\n');

    let publication;
    try {
      const providerResult = await llm.generateExplanation(withHonestyPrefix(prompt), {
        provider: EDU_TEXT_RUNTIME.provider,
        model: EDU_TEXT_RUNTIME.model,
        maxTokens: 1400,
        timeoutMs: EDU_TIMEOUT_MS,
        allowGenomic,
        includeMetadata: true,
      });
      publication = sanitizePublicationArtifact(
        'genetics_education',
        { surface: 'explanation', topic: topic.id, level },
        providerResult,
        { correlationId: publicationCorrelationId(request, 'education-explanation') },
      );
      if (publication.status === PUBLICATION_STATUSES.UNAVAILABLE) {
        publication = curatedExplanationPublication(
          request,
          topic,
          level,
          publication.reasonCode,
        );
      }
    } catch (error) {
      request.log.warn({ code: error?.code }, 'education explanation provider failed');
      publication = curatedExplanationPublication(
        request,
        topic,
        level,
        providerFailureReason(error),
      );
    }

    await persistPublicationSession(prisma, request, {
      topic,
      level,
      type: 'explanation',
      publication,
    });

    return {
      publication,
      topic: topic.id,
      topicMetadata: topicMetadata(topic),
      level,
      sources: getSources(topic),
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    };
  });

  fastify.post('/quiz', {
    preHandler: modelRoutePreHandlers(prepareEducationRequest(quizSchema)),
  }, async (request) => {
    const { topic, level, questionCount = 5 } = request.educationInput;
    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      request.user?.userId,
      topic.title,
    );

    const levelPrompt = LEVEL_PROMPTS[level];
    const difficultyMap = {
      elementary: 'very easy, multiple choice with 3 options, simple language',
      middle_school: 'easy to moderate, multiple choice with 4 options',
      high_school: 'moderate, multiple choice with 4 options',
      undergraduate: 'moderate to challenging, multiple choice with 4 options',
      graduate: 'challenging, multiple choice with 4 options, requires synthesis',
      postgraduate: 'expert-level, multiple choice with 4 options',
    };
    const difficulty = difficultyMap[level];

    const prompt = [
      `You are creating a genetics quiz. ${levelPrompt}`,
      `\nCatalog topic: ${topic.title} (${topic.id}, catalog v${topic.catalogVersion})`,
      `Difficulty: ${difficulty}`,
      `Number of questions: ${questionCount}`,
      '\nReturn ONLY a JSON array (no markdown fences, no other text) with this structure:',
      '[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]',
    ].join('\n');

    let publication;
    try {
      const providerResult = await llm.generateQuiz(withHonestyPrefix(prompt, QUIZ_HONESTY_NOTE), {
        provider: EDU_TEXT_RUNTIME.provider,
        model: EDU_TEXT_RUNTIME.model,
        maxTokens: 1800,
        timeoutMs: EDU_TIMEOUT_MS,
        allowGenomic,
        includeMetadata: true,
      });
      publication = sanitizeEducationQuizArtifact(providerResult, questionCount, {
        correlationId: publicationCorrelationId(request, 'education-quiz'),
      });
      if (publication.status === PUBLICATION_STATUSES.UNAVAILABLE) {
        publication = curatedQuizPublication(
          request,
          topic,
          level,
          questionCount,
          publication.reasonCode,
        );
      }
    } catch (error) {
      request.log.warn({ code: error?.code }, 'education quiz provider failed');
      publication = curatedQuizPublication(
        request,
        topic,
        level,
        questionCount,
        providerFailureReason(error),
      );
    }
    await persistPublicationSession(prisma, request, {
      topic,
      level,
      type: 'quiz',
      publication,
      metadata: { requestedQuestionCount: questionCount },
    });

    return {
      publication,
      topic: topic.id,
      topicMetadata: topicMetadata(topic),
      level,
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    };
  });

  fastify.post('/chat', {
    preHandler: modelRoutePreHandlers(prepareTutorRequest),
  }, async (request) => {
    const { publicationTask, taskInput, topic } = request.educationInput;
    const composed = composePublicationPrompt(publicationTask, taskInput, {
      routePath: '/education/chat',
    });
    if (!composed.ok) {
      throw new AppError(composed.reason || 'The guided tutor request is invalid.', 400);
    }
    const { level } = composed.value;

    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      request.user?.userId,
      composed.prompt,
    );

    const levelPrompt = LEVEL_PROMPTS[level];
    const honestyPersona = `You are a friendly genetics tutor. ${levelPrompt} Be encouraging, ask follow-up questions to check understanding, and provide examples when helpful. If the student seems confused, try a different approach or analogy.`;

    const fullMessages = [{ role: 'user', content: composed.prompt }];
    let publication;
    try {
      const providerResult = await llm.generateChatResponse(fullMessages, {
        timeoutMs: EDU_TIMEOUT_MS,
        allowGenomic,
        includeMetadata: true,
        honestyPersona,
      });
      publication = sanitizePublicationArtifact(
        'genetics_education',
        {
          surface: 'guided_tutor',
          topic: topic.id,
          level,
          interaction: taskInput.interaction,
        },
        providerResult,
        { correlationId: publicationCorrelationId(request, 'education-chat') },
      );
    } catch (error) {
      request.log.warn({ code: error?.code }, 'education chat provider failed');
      publication = unavailablePublication(request, 'education-chat', providerFailureReason(error));
    }
    await persistPublicationSession(prisma, request, {
      topic,
      level,
      type: 'chat',
      publication,
      metadata: {
        interaction: taskInput.interaction,
        taskInputVersion: taskInput.version,
      },
    });
    return {
      publication,
      role: 'assistant',
      topicMetadata: topicMetadata(topic),
      sources: getSources(topic),
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    };
  });

  fastify.get('/progress', { preHandler: authenticate }, async (request) => {
    const [sessions, progress] = await Promise.all([
      prisma.learningSession.findMany({
        where: {
          userId: request.user.userId,
          type: { notIn: USAGE_RESERVATION_TYPES },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.learningProgress.findMany({
        where: { userId: request.user.userId },
      }),
    ]);

    return {
      sessions: sessions.map((session, index) => ({
        ...session,
        content: { publication: replayPublication(session, index) },
      })),
      progress,
    };
  });

  fastify.post('/progress', { preHandler: authenticate }, async (request) => {
    const { topicId, score, totalQuestions } = progressSchema.parse(request.body);
    const topic = canonicalTopic(topicId);

    const existing = await prisma.learningProgress.findFirst({
      where: { userId: request.user.userId, topicId: topic.id },
    });

    if (existing) {
      return prisma.learningProgress.update({
        where: { id: existing.id },
        data: {
          bestScore: Math.max(existing.bestScore, score),
          attempts: existing.attempts + 1,
          lastAttemptAt: new Date(),
        },
      });
    }

    return prisma.learningProgress.create({
      data: {
        userId: request.user.userId,
        topicId: topic.id,
        bestScore: score,
        totalQuestions,
        attempts: 1,
        lastAttemptAt: new Date(),
      },
    });
  });

  fastify.get('/entitlements', { preHandler: [authenticate, checkEducationEntitlement] }, async (request) => {
    let todayUsage = null;

    if (!request.entitlements.isPremium) {
      const current = new Date();
      const today = new Date(Date.UTC(
        current.getUTCFullYear(),
        current.getUTCMonth(),
        current.getUTCDate(),
      ));

      const grouped = await prisma.learningSession.groupBy({
        by: ['type'],
        where: { userId: request.user.userId, createdAt: { gte: today } },
        _count: { type: true },
      });

      todayUsage = { explanation: 0, quiz: 0, chat: 0 };
      for (const row of grouped) {
        if (row.type in todayUsage) {
          todayUsage[row.type] = row._count.type;
        }
      }
    }

    return {
      ...request.entitlements,
      todayUsage,
    };
  });
}
