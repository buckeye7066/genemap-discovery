import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit } from '../middleware/entitlements.js';
import * as llm from '../services/llm.js';

const TOPICS_CATALOG = [
  {
    category: 'DNA Basics',
    topics: [
      { id: 'what-is-dna', title: 'What is DNA?', description: 'The molecule of life' },
      { id: 'dna-structure', title: 'DNA Structure', description: 'The double helix and base pairing' },
      { id: 'dna-replication', title: 'DNA Replication', description: 'How DNA copies itself' },
      { id: 'genes-and-chromosomes', title: 'Genes & Chromosomes', description: 'How DNA is organized' },
    ],
  },
  {
    category: 'How Genes Work',
    topics: [
      { id: 'transcription', title: 'Transcription', description: 'From DNA to RNA' },
      { id: 'translation', title: 'Translation', description: 'From RNA to Protein' },
      { id: 'gene-expression', title: 'Gene Expression', description: 'When and how genes are turned on' },
      { id: 'gene-regulation', title: 'Gene Regulation', description: 'Controlling gene activity' },
    ],
  },
  {
    category: 'Inheritance',
    topics: [
      { id: 'mendelian-genetics', title: 'Mendelian Genetics', description: 'Dominant and recessive traits' },
      { id: 'punnett-squares', title: 'Punnett Squares', description: 'Predicting offspring traits' },
      { id: 'sex-linked-traits', title: 'Sex-Linked Traits', description: 'Genes on the X and Y chromosomes' },
      { id: 'complex-inheritance', title: 'Complex Inheritance', description: 'Beyond simple dominance' },
    ],
  },
  {
    category: 'Mutations & Variation',
    topics: [
      { id: 'what-are-mutations', title: 'What Are Mutations?', description: 'Changes in the DNA sequence' },
      { id: 'types-of-mutations', title: 'Types of Mutations', description: 'Point mutations, insertions, deletions' },
      { id: 'genetic-variation', title: 'Genetic Variation', description: 'Why we are all different' },
      { id: 'snps-and-polymorphisms', title: 'SNPs & Polymorphisms', description: 'Common genetic differences' },
    ],
  },
  {
    category: 'Genomics & Technology',
    topics: [
      { id: 'human-genome-project', title: 'The Human Genome Project', description: 'Mapping all human genes' },
      { id: 'dna-sequencing', title: 'DNA Sequencing', description: 'Reading the genetic code' },
      { id: 'crispr', title: 'CRISPR Gene Editing', description: 'Editing genes with molecular scissors' },
      { id: 'genetic-testing', title: 'Genetic Testing', description: 'What your DNA can tell you' },
    ],
  },
  {
    category: 'Genetics & Health',
    topics: [
      { id: 'genetic-diseases', title: 'Genetic Diseases', description: 'When genes cause illness' },
      { id: 'cancer-genetics', title: 'Cancer Genetics', description: 'How genes relate to cancer' },
      { id: 'pharmacogenomics', title: 'Pharmacogenomics', description: 'How genes affect drug response' },
      { id: 'gene-therapy', title: 'Gene Therapy', description: 'Treating disease by fixing genes' },
    ],
  },
  {
    category: 'Evolution & Population Genetics',
    topics: [
      { id: 'natural-selection', title: 'Natural Selection', description: 'Survival of the fittest' },
      { id: 'population-genetics', title: 'Population Genetics', description: 'Genes in groups' },
      { id: 'molecular-evolution', title: 'Molecular Evolution', description: 'How DNA changes over time' },
      { id: 'phylogenetics', title: 'Phylogenetics', description: 'The tree of life' },
    ],
  },
  {
    category: 'Advanced Topics',
    topics: [
      { id: 'epigenetics', title: 'Epigenetics', description: 'Changes beyond the DNA sequence' },
      { id: 'rna-world', title: 'The RNA World', description: 'Non-coding RNA and regulation' },
      { id: 'systems-biology', title: 'Systems Biology', description: 'Networks and pathways' },
      { id: 'synthetic-biology', title: 'Synthetic Biology', description: 'Engineering life' },
    ],
  },
];

const explainSchema = z.object({
  topic: z.string().min(1).max(500),
  level: z.string().min(1),
  context: z.string().optional(),
});

const imageSchema = z.object({
  topic: z.string().min(1).max(500),
  level: z.string().min(1),
});

const quizSchema = z.object({
  topic: z.string().min(1).max(500),
  level: z.string().min(1),
  questionCount: z.number().min(1).max(20).optional(),
});

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  level: z.string().min(1),
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
    reply.send({ categories: TOPICS_CATALOG });
  });

  fastify.post('/explain', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request, reply) => {
    const { topic, level, context } = explainSchema.parse(request.body);

    const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS.undergraduate;
    const prompt = [
      `You are a genetics educator. ${levelPrompt}`,
      context ? `\nAdditional context: ${context}` : '',
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

    const explanation = await llm.generateExplanation(prompt);

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

    reply.send({
      explanation,
      topic,
      level,
      usage: request.usageInfo || null,
      tier: request.entitlements?.tier || 'free',
    });
  });

  fastify.post('/image', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request, reply) => {
    const { topic, level } = imageSchema.parse(request.body);

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

    const result = await llm.generateImage(imagePrompt);
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic, level, type: 'image', content: { revisedPrompt: result.revisedPrompt } },
        });
      } catch { /* non-critical */ }
    }
    reply.send({ imageUrl: result.url, revisedPrompt: result.revisedPrompt, topic, level, usage: request.usageInfo || null, tier: request.entitlements?.tier || 'free' });
  });

  fastify.post('/quiz', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request, reply) => {
    const { topic, level, questionCount = 5 } = quizSchema.parse(request.body);

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

    const questions = await llm.generateQuiz(prompt);
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic, level, type: 'quiz', content: { questionCount } },
        });
      } catch { /* non-critical */ }
    }
    reply.send({ questions, topic, level, usage: request.usageInfo || null, tier: request.entitlements?.tier || 'free' });
  });

  fastify.post('/chat', { preHandler: [authenticate, checkEducationEntitlement, enforceUsageLimit] }, async (request, reply) => {
    const { messages, level } = chatSchema.parse(request.body);

    const levelPrompt = LEVEL_PROMPTS[level] || LEVEL_PROMPTS.undergraduate;
    const systemMessage = {
      role: 'system',
      content: `You are a friendly genetics tutor. ${levelPrompt} Be encouraging, ask follow-up questions to check understanding, and provide examples when helpful. If the student seems confused, try a different approach or analogy.`,
    };

    const fullMessages = [systemMessage, ...messages];
    const response = await llm.generateChatResponse(fullMessages);
    if (request.user?.userId) {
      try {
        await prisma.learningSession.create({
          data: { userId: request.user.userId, topic: 'chat', level, type: 'chat', content: { messageCount: messages.length } },
        });
      } catch { /* non-critical */ }
    }
    reply.send({ response, role: 'assistant', usage: request.usageInfo || null, tier: request.entitlements?.tier || 'free' });
  });

  fastify.get('/progress', { preHandler: authenticate }, async (request, reply) => {
    const sessions = await prisma.learningSession.findMany({
      where: { userId: request.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const progress = await prisma.learningProgress.findMany({
      where: { userId: request.user.userId },
    });

    reply.send({ sessions, progress });
  });

  fastify.post('/progress', { preHandler: authenticate }, async (request, reply) => {
    const { topicId, score, totalQuestions } = request.body;

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
      reply.send(updated);
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
      reply.send(created);
    }
  });

  fastify.get('/entitlements', { preHandler: [authenticate, checkEducationEntitlement] }, async (request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let todayUsage = {};
    if (!request.entitlements.isPremium) {
      const types = ['explanation', 'image', 'quiz', 'chat'];
      for (const type of types) {
        const count = await prisma.learningSession.count({
          where: { userId: request.user.userId, type, createdAt: { gte: today } },
        });
        todayUsage[type] = count;
      }
    }

    reply.send({
      tier: request.entitlements.tier,
      isPremium: request.entitlements.isPremium,
      isInstitutional: request.entitlements.isInstitutional,
      limits: request.entitlements.limits,
      todayUsage: request.entitlements.isPremium ? null : todayUsage,
    });
  });
}
