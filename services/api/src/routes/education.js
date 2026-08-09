import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit } from '../middleware/entitlements.js';
import * as llm from '../services/llm.js';
import {
  withHonestyPrefix,
  honestySystemMessage,
  QUIZ_HONESTY_NOTE,
} from '../services/scientificHonesty.js';
import { getSources } from '../services/educationSources.js';
import { assertNoRawGenomicLLM } from '../services/genomicGuard.js';
import {
  sanitizeEducationQuizOutput,
  sanitizePublicationTaskOutput,
} from '../services/publicationTaskOutput.js';
import { AppError } from '../utils/errors.js';
import { TOPICS_CATALOG } from '../config/educationCatalog.js';
import { composePublicationPrompt } from '../config/publicationTaskContracts.js';
import { assertModelPublicationEnabled } from './llm.js';

const TOPIC_INDEX = new Map();
for (const { category, topics } of TOPICS_CATALOG) {
  for (const t of topics) {
    const meta = { id: t.id, category };
    TOPIC_INDEX.set(t.id.toLowerCase(), meta);
    TOPIC_INDEX.set(t.title.trim().toLowerCase(), meta);
  }
}

function sourcesForTopic(topic) {
  const meta = TOPIC_INDEX.get(String(topic ?? '').trim().toLowerCase());
  return getSources({ topicId: meta?.id, category: meta?.category });
}

const DEFAULT_LEVEL = 'undergraduate';
const EDU_TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const EDU_TEXT_MODEL = process.env.LLM_EDU_TEXT_MODEL
  || (EDU_TEXT_PROVIDER === 'openai' || EDU_TEXT_PROVIDER === 'gpt' ? 'gpt-4o-mini' : undefined);
const EDU_TIMEOUT_MS = Number(process.env.LLM_EDU_TIMEOUT_MS || 24_000);

const levelField = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() ? v.trim() : DEFAULT_LEVEL),
  z.string().min(1)
);

const explainSchema = z.object({
  topic: z.string().min(1).max(500),
  level: levelField,
}).strict();

const imageSchema = z.object({
  topic: z.string().min(1).max(500),
  level: levelField,
});

const quizSchema = z.object({
  topic: z.string().min(1).max(500),
  level: levelField,
  questionCount: z.number().min(1).max(20).optional(),
});

const chatSchema = z.object({
  publicationTask: z.literal('genetics_education'),
  taskInput: z.object({
    version: z.literal(1),
    topic: z.string().min(1).max(200),
    level: z.enum([
      'elementary',
      'middle_school',
      'high_school',
      'undergraduate',
      'graduate',
      'postgraduate',
    ]),
    interaction: z.enum([
      'explain_another_way',
      'give_example',
      'compare_concepts',
      'check_understanding',
    ]),
  }).strict(),
}).strict();

const progressSchema = z.object({
  topicId: z.string().min(1).max(200),
  score: z.coerce.number().int().min(0).max(1_000_000),
  totalQuestions: z.coerce.number().int().min(0).max(1_000_000).optional().default(0),
});

const LEVEL_PROMPTS = {
  elementary: 'Explain like you are talking to a 7-year-old. Use very simple words, fun comparisons to everyday things. Avoid all scientific jargon. Keep sentences short and fun.',
  middle_school: 'Explain for a middle school science class. Introduce basic scientific terms but always define them. Use relatable analogies.',
  high_school: 'Explain at a high school AP Biology level. Use proper scientific terminology with brief definitions. Include molecular details where relevant.',
  undergraduate: 'Explain at an undergraduate genetics/molecular biology level. Use full scientific terminology. Discuss mechanisms, pathways, and experimental evidence.',
  graduate: 'Explain at a graduate-level genetics depth. Discuss current research, nuances, conflicting evidence, and methodological considerations.',
  postgraduate: 'Explain at a postdoctoral / principal investigator level. Assume deep familiarity with genetics. Focus on cutting-edge research and unresolved questions.',
};

/**
 * The emergency recovery switch applies before quota accounting and before any
 * provider-facing education call. This keeps `/education/*` consistent with
 * `/llm/invoke` during an incident or rollback.
 */
async function requireModelPublicationEnabled() {
  assertModelPublicationEnabled(process.env);
}

const modelRoutePreHandlers = [
  authenticate,
  checkEducationEntitlement,
  requireModelPublicationEnabled,
  enforceUsageLimit,
];

export default async function educationRoutes(fastify) {
  const prisma = fastify.prisma;

  fastify.get('/topics', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return { categories: TOPICS_CATALOG };
  });

  fastify.post('/explain', { preHandler: modelRoutePreHandlers }, async (request) => {
    const { topic, level } = explainSchema.parse(request.body);
    const allowGenomic = await assertNoRawGenomicLLM(prisma, request.user?.userId, topic);

    const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS.undergraduate;
    const prompt = [
      `You are a genetics educator. ${levelPrompt}`,
      `\nTopic to explain: ${topic}`,
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

    const rawExplanation = await llm.generateExplanation(withHonestyPrefix(prompt), {
      model: EDU_TEXT_MODEL,
      maxTokens: 1400,
      timeoutMs: EDU_TIMEOUT_MS,
      allowGenomic,
    });
    const explanation = sanitizePublicationTaskOutput(
      'genetics_education',
      { surface: 'explanation', topic, level },
      rawExplanation,
    );

    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: {
            userId: request.user.userId,
            topic,
            level,
            type: 'explanation',
            content: { explanation: explanation.substring(0, 500) },
          },
        });
      } catch {
        // Non-critical logging
      }
    }

    return {
      explanation,
      topic,
      level,
      sources: sourcesForTopic(topic),
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    };
  });

  fastify.post('/image', { preHandler: modelRoutePreHandlers }, async (request) => {
    const { topic, level } = imageSchema.parse(request.body);
    const allowGenomic = await assertNoRawGenomicLLM(prisma, request.user?.userId, topic);

    const styleMap = {
      elementary: 'Friendly cartoon-style educational illustration with bright colors, large labels, and cute characters. Children\'s science book style.',
      middle_school: 'Clean, colorful educational diagram for a middle school science textbook. Clear labels, moderate detail.',
      high_school: 'Detailed scientific diagram in textbook style. Proper labels, accurate structures, color coding.',
      undergraduate: 'University-level scientific figure. Molecular detail, proper nomenclature, pathway arrows.',
      graduate: 'Publication-quality scientific figure with detailed molecular representations and annotations.',
      postgraduate: 'Journal-quality figure with maximum detail, structural biology representations, multi-panel layout.',
    };

    const style = styleMap[level] || styleMap.undergraduate;
    const imagePrompt = `Create an educational genetics illustration about: ${topic}. ${style} The image should be clear, accurate, and educational. Do not include any text or labels in the image.`;

    let result;
    try {
      result = await llm.generateImage(imagePrompt, { timeoutMs: 40_000, allowGenomic });
    } catch (err) {
      request.log.warn({ err: err?.message, status: err?.status }, 'education image generation failed');
      const isConfig = err?.status === 400 || err?.status === 403 || err?.status === 404;
      throw new AppError(
        isConfig
          ? 'Image generation isn\'t enabled on this server — the configured AI key has no access to an image model. (Other AI features still work.)'
          : 'Image generation is temporarily unavailable. Please try again in a moment.',
        isConfig ? 501 : 503
      );
    }
    if (!result?.url) {
      throw new AppError('The image could not be generated for this topic. Please try a different topic.', 502);
    }

    const revisedPrompt = sanitizePublicationTaskOutput(
      'genetics_education',
      { surface: 'image_revised_prompt', topic, level },
      result.revisedPrompt || '',
    );
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic, level, type: 'image', content: { revisedPrompt } },
        });
      } catch { /* non-critical */ }
    }
    return {
      imageUrl: result.url,
      revisedPrompt,
      topic,
      level,
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    };
  });

  fastify.post('/quiz', { preHandler: modelRoutePreHandlers }, async (request) => {
    const { topic, level, questionCount = 5 } = quizSchema.parse(request.body);
    const allowGenomic = await assertNoRawGenomicLLM(prisma, request.user?.userId, topic);

    const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS.undergraduate;
    const difficultyMap = {
      elementary: 'very easy, multiple choice with 3 options, simple language',
      middle_school: 'easy to moderate, multiple choice with 4 options',
      high_school: 'moderate, multiple choice with 4 options',
      undergraduate: 'moderate to challenging, multiple choice with 4 options',
      graduate: 'challenging, multiple choice with 4 options, requires synthesis',
      postgraduate: 'expert-level, multiple choice with 4 options',
    };
    const difficulty = difficultyMap[level] || difficultyMap.undergraduate;

    const prompt = [
      `You are creating a genetics quiz. ${levelPrompt}`,
      `\nTopic: ${topic}`,
      `Difficulty: ${difficulty}`,
      `Number of questions: ${questionCount}`,
      '\nReturn ONLY a JSON array (no markdown fences, no other text) with this structure:',
      '[{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]',
    ].join('\n');

    const rawQuestions = await llm.generateQuiz(withHonestyPrefix(prompt, QUIZ_HONESTY_NOTE), {
      model: EDU_TEXT_MODEL,
      maxTokens: 1800,
      timeoutMs: EDU_TIMEOUT_MS,
      allowGenomic,
    });
    const questions = sanitizeEducationQuizOutput(rawQuestions, questionCount);
    if (questions.length === 0) {
      throw new AppError('The quiz could not be generated in a safe, usable format. Please try again.', 502);
    }
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic, level, type: 'quiz', content: { questionCount: questions.length } },
        });
      } catch { /* non-critical */ }
    }
    return {
      questions,
      topic,
      level,
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    };
  });

  fastify.post('/chat', { preHandler: modelRoutePreHandlers }, async (request) => {
    const { publicationTask, taskInput } = chatSchema.parse(request.body);
    const composed = composePublicationPrompt(publicationTask, taskInput, {
      routePath: '/education/chat',
    });
    if (!composed.ok) {
      throw new AppError(composed.reason || 'The guided tutor request is invalid.', 400);
    }
    const { topic, level } = composed.value;

    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      request.user?.userId,
      composed.prompt,
    );

    const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS.undergraduate;
    const systemMessage = honestySystemMessage(
      `You are a friendly genetics tutor. ${levelPrompt} Be encouraging, ask follow-up questions to check understanding, and provide examples when helpful. If the student seems confused, try a different approach or analogy.`,
    );

    const fullMessages = [systemMessage, { role: 'user', content: composed.prompt }];
    const rawResponse = await llm.generateChatResponse(fullMessages, {
      timeoutMs: EDU_TIMEOUT_MS,
      allowGenomic,
    });
    const response = sanitizePublicationTaskOutput(
      'genetics_education',
      { surface: 'guided_tutor', topic, level, interaction: taskInput.interaction },
      rawResponse,
    );
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: {
            userId: request.user.userId,
            topic,
            level,
            type: 'chat',
            content: { interaction: taskInput.interaction, taskInputVersion: taskInput.version },
          },
        });
      } catch { /* non-critical */ }
    }
    const sources = sourcesForTopic(topic);

    return {
      response,
      role: 'assistant',
      sources,
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    };
  });

  fastify.get('/progress', { preHandler: authenticate }, async (request) => {
    const [sessions, progress] = await Promise.all([
      prisma.learningSession.findMany({
        where: { userId: request.user.userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.learningProgress.findMany({
        where: { userId: request.user.userId },
      }),
    ]);

    return { sessions, progress };
  });

  fastify.post('/progress', { preHandler: authenticate }, async (request) => {
    const { topicId, score, totalQuestions } = progressSchema.parse(request.body);

    const existing = await prisma.learningProgress.findFirst({
      where: { userId: request.user.userId, topicId },
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
        topicId,
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const grouped = await prisma.learningSession.groupBy({
        by: ['type'],
        where: { userId: request.user.userId, createdAt: { gte: today } },
        _count: { type: true },
      });

      todayUsage = { explanation: 0, image: 0, quiz: 0, chat: 0 };
      for (const row of grouped) {
        if (row.type in todayUsage) {
          todayUsage[row.type] = row._count.type;
        }
      }
    }

    return {
      tier: request.entitlements.tier,
      isPremium: request.entitlements.isPremium,
      isInstitutional: request.entitlements.isInstitutional,
      limits: request.entitlements.limits,
      todayUsage,
    };
  });
}