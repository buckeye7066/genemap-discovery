import { authenticate } from '../middleware/auth.js';
import { checkEducationEntitlement, enforceUsageLimit } from '../middleware/entitlements.js';
import { generateExplanation, generateChatResponse, generateImage } from '../services/llm.js';
import { createAuditLog } from '../utils/audit.js';
import { ValidationError } from '../utils/errors.js';

export default async function llmRoutes(fastify) {
  const prisma = fastify.prisma;

  // General-purpose LLM text generation
  fastify.post('/invoke', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { prompt, options = {} } = request.body || {};
    if (!prompt) throw new ValidationError('prompt is required');

    const result = await generateExplanation(prompt, {
      provider: options.provider,
      maxTokens: options.maxTokens || 3000,
      temperature: options.temperature || 0.7,
    });

    await createAuditLog(prisma, {
      userId: request.user.userId,
      action: 'llm_invoke',
      entityType: 'llm',
      metadata: { promptLength: prompt.length, provider: options.provider },
    });

    return { result };
  });

  // LLM chat (multi-turn)
  fastify.post('/chat', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { messages, options = {} } = request.body || {};
    if (!messages || !Array.isArray(messages)) throw new ValidationError('messages array is required');

    const result = await generateChatResponse(messages, {
      provider: options.provider,
      maxTokens: options.maxTokens || 3000,
      temperature: options.temperature || 0.7,
    });

    return { result };
  });

  // LLM image generation
  fastify.post('/image', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const { prompt, options = {} } = request.body || {};
    if (!prompt) throw new ValidationError('prompt is required');

    const result = await generateImage(prompt, {
      size: options.size || '1024x1024',
      quality: options.quality || 'standard',
    });

    return { result };
  });
}
