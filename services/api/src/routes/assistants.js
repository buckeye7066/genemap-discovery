import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { requireProfileAssistants } from '../middleware/entitlements.js';
import { createAuditLog } from '../utils/audit.js';
import { decrypt, encrypt } from '../utils/encryption.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import {
  ASSISTANT_DEFINITIONS,
  buildAssistantContext,
  buildAssistantMessages,
  buildVerifiedContextFallback,
  reviewAssistantResponse,
} from '../services/assistantContext.js';
import { assertNoRawGenomicLLM } from '../services/genomicGuard.js';
import {
  MEDICAL_DATA_AI_CONSENT,
  requireLatestConsent,
} from '../services/healthRecords.js';
import { generateChatResponse } from '../services/llm.js';
import { textRuntimeConfig } from '../config/llmRuntime.js';

const ASSISTANT_RUNTIME = textRuntimeConfig('assistant');
const ASSISTANT_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 30_000);

const ChatBodySchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  conversationId: z.string().uuid().optional(),
  recordIds: z.array(z.string().uuid()).max(10).default([]),
}).strict();

function parseChatBody(body) {
  const result = ChatBodySchema.safeParse(body || {});
  if (!result.success) {
    const reason = result.error.issues.slice(0, 4)
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new ValidationError(`Invalid assistant request: ${reason}`);
  }
  return result.data;
}

function assertAssistantModelEnabled(source = process.env) {
  if (source.DISABLE_MODEL_PUBLICATION !== '1') return;
  const error = new AppError(
    'Generated assistant content is temporarily unavailable during safe recovery.',
    503,
  );
  error.code = 'MODEL_PUBLICATION_DISABLED';
  throw error;
}

function conversationTitle(message) {
  const normalized = message.replace(/\s+/gu, ' ').trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

function conversationHistory(conversation) {
  if (!conversation) return [];
  const messages = decrypt(conversation.messages);
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
    .slice(-40);
}

function conversationMetadata(conversation) {
  if (!conversation) return null;
  const metadata = decrypt(conversation.metadata);
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : null;
}

function conversationContainsMedicalData(conversation) {
  if (!conversation) return false;
  const metadata = conversationMetadata(conversation);
  if (typeof metadata?.containsMedicalData === 'boolean') {
    return metadata.containsMedicalData;
  }
  const receipt = metadata?.lastContextReceipt;
  if (receipt && typeof receipt === 'object') {
    return Boolean(receipt.healthProfileIncluded || receipt.records?.length);
  }
  // Legacy conversations predate the server-controlled metadata flag and may
  // have been created by the retired generic write route. Their history is
  // therefore unclassified saved data and must fail closed behind consent.
  return conversationHistory(conversation).length > 0;
}

function generatedText(generated) {
  if (generated && typeof generated === 'object' && generated.completion !== 'complete') {
    return '';
  }
  return typeof generated === 'string' ? generated : generated?.text;
}

function isProviderGenerationFailure(error) {
  return /^LLM_PROVIDER_(?:ERROR|TIMEOUT|CONNECTION)$/u.test(String(error?.code || ''));
}

function correctiveMessages(messages) {
  return [
    messages[0],
    {
      role: 'system',
      content: [
        'REWRITE REQUIREMENT: the prior draft was not publishable.',
        'Answer the user again and explicitly cite at least one relevant value, name, record, profile field, gene, project, or search from USER_CONTEXT.',
        'When USER_CONTEXT contains structured lab observations, cite both an analyte name and its recorded value.',
        'Do not diagnose the user or direct them to start, stop, change, dose, or take medication or treatment. Phrase testing and treatment topics as questions to discuss with a qualified clinician.',
      ].join(' '),
    },
    ...messages.slice(1),
  ];
}

async function loadConversation(prisma, userId, assistantType, conversationId) {
  if (!conversationId) return null;
  const conversation = await prisma.aIConversation.findFirst({
    where: { id: conversationId, userId, assistantType },
  });
  if (!conversation) throw new NotFoundError('Conversation not found');
  return conversation;
}

async function saveConversation(prisma, {
  conversation,
  userId,
  assistantType,
  history,
  userMessage,
  assistantMessage,
  contextReceipt,
  containsMedicalData,
}) {
  const messages = [
    ...history,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantMessage },
  ].slice(-40);
  const metadata = {
    contextVersion: contextReceipt.contextVersion,
    containsMedicalData,
    lastContextReceipt: contextReceipt,
  };
  if (conversation) {
    return prisma.aIConversation.update({
      where: { id: conversation.id },
      data: {
        messages: encrypt(messages),
        metadata: encrypt(metadata),
      },
    });
  }
  return prisma.aIConversation.create({
    data: {
      userId,
      assistantType,
      title: encrypt(conversationTitle(userMessage)),
      messages: encrypt(messages),
      metadata: encrypt(metadata),
    },
  });
}

export default async function assistantRoutes(fastify, options = {}) {
  const prisma = fastify.prisma;
  const generateChat = options.generateChat || generateChatResponse;
  const contextBuilder = options.buildContext || buildAssistantContext;

  fastify.post('/:assistantType/chat', {
    preHandler: [authenticate, requireProfileAssistants],
  }, async (request) => {
    assertAssistantModelEnabled(process.env);
    const assistantType = String(request.params?.assistantType || '').toLowerCase();
    const definition = ASSISTANT_DEFINITIONS[assistantType];
    if (!definition) throw new NotFoundError('Assistant not found');
    const body = parseChatBody(request.body);
    const userId = request.user.userId;
    // Every assistant message can itself contain new health or genetic data,
    // even when the caller selects no saved record. Require current,
    // versioned AI-processing consent before reading prior assistant history,
    // hydrating saved context, or sending any text to the provider.
    await requireLatestConsent(prisma, userId, MEDICAL_DATA_AI_CONSENT);
    const conversation = await loadConversation(
      prisma,
      userId,
      assistantType,
      body.conversationId,
    );
    const history = conversationHistory(conversation);
    const historyContainsMedicalData = conversationContainsMedicalData(conversation);
    const { context, contextReceipt, includesMedicalData } = await contextBuilder(prisma, userId, {
      assistantType,
      recordIds: body.recordIds,
    });

    if (includesMedicalData || historyContainsMedicalData) {
      await createAuditLog(
        prisma,
        {
          userId,
          action: 'assistant.medical_context.read',
          entityType: 'medical_data',
          metadata: {
            assistantType,
            recordIds: contextReceipt.records.map((record) => record.id),
            healthProfileIncluded: contextReceipt.healthProfileIncluded,
            historyContainsMedicalData,
          },
        },
        { required: true },
      );
    }

    const providerMessages = buildAssistantMessages(
      assistantType,
      context,
      history,
      body.message,
    );
    const allowGenomic = await assertNoRawGenomicLLM(
      prisma,
      userId,
      JSON.stringify(providerMessages),
    );

    const generationOptions = {
      provider: ASSISTANT_RUNTIME.provider,
      model: ASSISTANT_RUNTIME.model,
      maxTokens: 1_800,
      temperature: 0.35,
      timeoutMs: ASSISTANT_TIMEOUT_MS,
      allowGenomic,
      includeMetadata: true,
      honestyPersona: `${definition.displayName} is an educational assistant, not a clinician.`,
    };
    let generated = null;
    let assistantMessage = '';
    let responseReview = reviewAssistantResponse('', context);
    let generationAttempts = 0;
    let generationSource = 'provider';
    let providerFailureCode = null;

    try {
      generationAttempts = 1;
      generated = await generateChat(providerMessages, generationOptions);
      assistantMessage = generatedText(generated);
      responseReview = reviewAssistantResponse(assistantMessage, context);

      if (!responseReview.publishable) {
        generationAttempts = 2;
        generated = await generateChat(correctiveMessages(providerMessages), generationOptions);
        assistantMessage = generatedText(generated);
        responseReview = reviewAssistantResponse(assistantMessage, context);
      }
    } catch (error) {
      if (!isProviderGenerationFailure(error)) throw error;
      providerFailureCode = error.code;
    }

    if (!responseReview.publishable) {
      assistantMessage = buildVerifiedContextFallback(assistantType, context);
      responseReview = reviewAssistantResponse(assistantMessage, context);
      generationSource = 'verified_context_fallback';
      if (!responseReview.publishable) {
        const error = new AppError(
          'The assistant could not produce a safe, context-grounded response. Please rephrase the question.',
          502,
        );
        error.code = 'ASSISTANT_RESPONSE_REJECTED';
        throw error;
      }
    }

    const reviewedContextReceipt = {
      ...contextReceipt,
      responseReview: {
        status: 'passed',
        generationAttempts,
        generationSource,
        matchedContextKinds: responseReview.matchedContextKinds,
        requiredContextKinds: responseReview.requiredContextKinds,
      },
    };

    const saved = await prisma.$transaction(async (tx) => {
      const storedConversation = await saveConversation(tx, {
        conversation,
        userId,
        assistantType,
        history,
        userMessage: body.message,
        assistantMessage: assistantMessage.trim(),
        contextReceipt: reviewedContextReceipt,
        // Assistant messages are conservatively classified because the new
        // user message may introduce health data not present in saved context.
        containsMedicalData: true,
      });
      await createAuditLog(tx, {
        userId,
        action: 'assistant.response.generated',
        entityType: 'ai_conversation',
        entityId: storedConversation.id,
        metadata: {
          assistantType,
          contextVersion: reviewedContextReceipt.contextVersion,
          completion: generated && typeof generated === 'object'
            ? generated.completion || 'unknown'
            : 'unknown',
          generationAttempts,
          generationSource,
          matchedContextKinds: responseReview.matchedContextKinds,
          ...(providerFailureCode ? { providerFailureCode } : {}),
        },
      }, { required: true });
      return storedConversation;
    });

    return {
      assistant: { id: definition.id, displayName: definition.displayName },
      conversationId: saved.id,
      message: assistantMessage.trim(),
      contextReceipt: reviewedContextReceipt,
    };
  });
}

export const __test = {
  assertAssistantModelEnabled,
  conversationContainsMedicalData,
  conversationHistory,
  conversationTitle,
  correctiveMessages,
  isProviderGenerationFailure,
  parseChatBody,
  saveConversation,
};
