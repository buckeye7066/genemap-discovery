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
import { AppError } from '../utils/errors.js';
import { MAX_MESSAGE_CHARS } from '../config/llmLimits.js';
import { TOPICS_CATALOG } from '../config/educationCatalog.js';

// Index every catalog topic by BOTH its id and its lower-cased title, so a
// request that passes either (the client sends the title) resolves to the
// topic's id + category for authoritative-source lookup.
const TOPIC_INDEX = new Map();
for (const { category, topics } of TOPICS_CATALOG) {
  for (const t of topics) {
    const meta = { id: t.id, category };
    TOPIC_INDEX.set(t.id.toLowerCase(), meta);
    TOPIC_INDEX.set(t.title.trim().toLowerCase(), meta);
  }
}

/**
 * Resolve authoritative references for a requested topic. A known topic gets
 * its glossary + category + general sources; an unknown/custom topic still gets
 * the general NIH/NHGRI references so every explanation is source-grounded.
 */
function sourcesForTopic(topic) {
  const meta = TOPIC_INDEX.get(String(topic ?? '').trim().toLowerCase());
  return getSources({ topicId: meta?.id, category: meta?.category });
}

// A missing/blank/`null` level used to hard-fail Zod (`z.string().min(1)`),
// surfacing to the user as a cryptic "Validation failed". The level only
// selects a prompt persona, so coerce anything falsy to a sane default rather
// than rejecting the whole request. Unknown strings fall back at prompt time.
const DEFAULT_LEVEL = 'undergraduate';

// Education explanations and quizzes are long single-shot generations. On the
// default gpt-4o they routinely run 25-40s and exceed the upstream gateway's
// response window, which then returns the browser an empty body — the
// "server returned an empty response. The request may have timed out" error
// every /education/* learning feature was hitting. A smaller, faster model
// returns comfortably inside the budget with more than enough quality for a
// level-tuned explanation or a multiple-choice quiz. Override per-provider via
// LLM_EDU_TEXT_MODEL; leave undefined for non-OpenAI providers so their own
// default model stands.
const EDU_TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || 'openai';
const EDU_TEXT_MODEL = process.env.LLM_EDU_TEXT_MODEL
  || (EDU_TEXT_PROVIDER === 'openai' || EDU_TEXT_PROVIDER === 'gpt' ? 'gpt-4o-mini' : undefined);
// Keep a single attempt comfortably under a ~30s gateway. Timeouts are no
// longer retried (see services/llm.js), so this is the real worst case.
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

// Reject client-supplied system prompts. Allowing role: 'system' from the
// browser lets a user override the educational guard rails (level, persona,
// safety instructions). Only the server adds the system message.
const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(MAX_MESSAGE_CHARS),
  })).min(1).max(50),
  level: z.string().min(1),
  // Optional topic context so the tutor turn can carry the same authoritative
  // references the explanation does. Falls back to the latest user message.
  topic: z.string().trim().max(500).optional(),
});

// Validate quiz-progress writes. Without this, a missing `topicId` made Prisma
// drop the filter (`where: { userId, topicId: undefined }`) so findFirst matched
// an UNRELATED topic's row and updated the wrong progress record; a non-numeric
// `score` wrote NaN into an Int column (a 500). Bounding the input closes both.
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

export default async function educationRoutes(fastify) {
  const prisma = fastify.prisma;

  fastify.get('/topics', async (request, reply) => {
    reply.header('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    // Must `return` (not a bare reply.send) inside an async handler: with
    // @fastify/compress global mode, a bare reply.send() races the handler's
    // undefined return and the gzip stream is finalized with Content-Length: 0
    // — an empty body. This is why every sizable /education/* response (topics,
    // explanations, quizzes) came back blank in the browser while curl with
    // `Accept-Encoding: identity` returned the full payload.
    return { categories: TOPICS_CATALOG };
  });

  fastify.post('/explain', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request) => {
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

    const explanation = await llm.generateExplanation(withHonestyPrefix(prompt), {
      model: EDU_TEXT_MODEL,
      maxTokens: 1400,
      timeoutMs: EDU_TIMEOUT_MS,
      allowGenomic,
    });

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

  fastify.post('/image', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request) => {
    const { topic, level } = imageSchema.parse(request.body);

    // `topic` (up to 500 chars) is embedded in the image prompt sent to a cloud
    // model — long enough to carry a small VCF. Guard it like every other surface.
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

    // Image generation depends on an external model (DALL·E) that can fail for
    // reasons the user can act on (slow/unavailable, content policy). Without
    // this catch the raw provider error fell through to the generic 500
    // "Internal server error" the tester saw. Turn it into a clear, operational
    // error so the client renders an actionable message.
    let result;
    try {
      result = await llm.generateImage(imagePrompt, { timeoutMs: 40_000, allowGenomic });
    } catch (err) {
      request.log.warn({ err: err?.message, status: err?.status }, 'education image generation failed');
      // A 4xx means the AI key can't use any image model (it returns "model
      // does not exist") — that's a server config problem the user can't retry
      // away, so say so honestly instead of "try again in a moment".
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
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic, level, type: 'image', content: { revisedPrompt: result.revisedPrompt } },
        });
      } catch { /* non-critical */ }
    }
    return { imageUrl: result.url, revisedPrompt: result.revisedPrompt, topic, level, usage: request.usageInfo || null, tier: request.entitlements?.tier || 'free' };
  });

  fastify.post('/quiz', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request) => {
    const { topic, level, questionCount = 5 } = quizSchema.parse(request.body);

    // `topic` (up to 500 chars) is embedded verbatim in the quiz prompt sent to
    // a cloud LLM — guard it so a VCF header + rows can't be smuggled through.
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

    const questions = await llm.generateQuiz(withHonestyPrefix(prompt, QUIZ_HONESTY_NOTE), {
      model: EDU_TEXT_MODEL,
      maxTokens: 1800,
      timeoutMs: EDU_TIMEOUT_MS,
      allowGenomic,
    });
    // generateQuiz returns the raw (unparseable) string instead of an array when
    // the model's output can't be coerced into questions. Fail BEFORE recording
    // a learningSession so a malformed generation doesn't silently consume the
    // free tier's daily quiz quota (that row is what enforceUsageLimit counts).
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new AppError('The quiz could not be generated in a usable format. Please try again.', 502);
    }
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic, level, type: 'quiz', content: { questionCount } },
        });
      } catch { /* non-critical */ }
    }
    return { questions, topic, level, usage: request.usageInfo || null, tier: request.entitlements?.tier || 'free' };
  });

  fastify.post('/chat', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request) => {
    const { messages, level, topic } = chatSchema.parse(request.body);

    // Tutor-chat turns also reach a cloud LLM; block a raw genomic dump pasted
    // into the conversation by default (same policy as /llm/chat).
    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      request.user?.userId,
      messages.map((m) => m.content).join('\n'),
    );

    const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS.undergraduate;
    const systemMessage = honestySystemMessage(
      `You are a friendly genetics tutor. ${levelPrompt} Be encouraging, ask follow-up questions to check understanding, and provide examples when helpful. If the student seems confused, try a different approach or analogy.`,
    );

    const fullMessages = [systemMessage, ...messages];
    // Keep the chat on the default (higher-quality) model — tutor turns are
    // short, so latency is not the problem here — but still cap the wait so a
    // stalled upstream returns a clean error instead of an empty gateway body.
    const response = await llm.generateChatResponse(fullMessages, { timeoutMs: EDU_TIMEOUT_MS, allowGenomic });
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic: 'chat', level, type: 'chat', content: { messageCount: messages.length } },
        });
      } catch { /* non-critical */ }
    }
    // Ground the tutor turn too: prefer an explicit topic, else fall back to
    // the latest user message. Unknown topics still yield the general refs.
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const sources = sourcesForTopic(topic || lastUserMessage?.content || '');

    return { response, role: 'assistant', sources, usage: request.usageInfo || null, tier: request.entitlements?.tier || 'free' };
  });

  fastify.get('/progress', { preHandler: authenticate }, async (request, reply) => {
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

  fastify.post('/progress', { preHandler: authenticate }, async (request, reply) => {
    const { topicId, score, totalQuestions } = progressSchema.parse(request.body);

    const existing = await prisma.learningProgress.findFirst({
      where: { userId: request.user.userId, topicId },
    });

    if (existing) {
      const updated = await prisma.learningProgress.update({
        where: { id: existing.id },
        data: {
          bestScore: Math.max(existing.bestScore, score),
          attempts: existing.attempts + 1,
          lastAttemptAt: new Date(),
        },
      });
      return updated;
    } else {
      const created = await prisma.learningProgress.create({
        data: {
          userId: request.user.userId,
          topicId,
          bestScore: score,
          totalQuestions,
          attempts: 1,
          lastAttemptAt: new Date(),
        },
      });
      return created;
    }
  });

  fastify.get('/entitlements', { preHandler: [authenticate, checkEducationEntitlement] }, async (request, reply) => {
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
