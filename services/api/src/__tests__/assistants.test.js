import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn(async (request) => {
    request.user = { userId: 'user-a', role: 'user' };
  }),
}));

vi.mock('../middleware/entitlements.js', () => ({
  requireProfileAssistants: vi.fn(async (request) => {
    request.entitlements = { tier: 'premium', isPremium: true };
  }),
}));

vi.mock('../services/genomicGuard.js', () => ({
  assertNoRawGenomicLLM: vi.fn(async () => false),
}));

import assistantRoutes from '../routes/assistants.js';
import { errorHandler } from '../middleware/errorHandler.js';

const RECEIPT = Object.freeze({
  contextVersion: '1.0',
  generatedAt: '2026-09-02T12:00:00.000Z',
  assistant: 'robert',
  profileFields: ['age'],
  healthProfileIncluded: false,
  records: [{
    id: '11111111-1111-4111-8111-111111111111',
    title: 'August panel',
    parserVersion: 'health-document-1.0.0',
    extractionMethod: 'pdf_text',
    observationCount: 1,
    sourceSha256: 'a'.repeat(64),
  }],
  research: { geneSetCount: 0, projectCount: 0, recentSearchCount: 0 },
});

let app;
let prisma;
let generateChat;
let buildContext;

function createPrisma({ consent = true } = {}) {
  const conversations = [];
  return {
    consentRecord: {
      findFirst: vi.fn(async () => consent ? { granted: true } : null),
    },
    aIConversation: {
      findFirst: vi.fn(async ({ where }) => conversations.find((item) => (
        item.id === where.id
        && item.userId === where.userId
        && item.assistantType === where.assistantType
      )) || null),
      create: vi.fn(async ({ data }) => {
        const record = { id: '22222222-2222-4222-8222-222222222222', ...data };
        conversations.push(record);
        return record;
      }),
      update: vi.fn(async ({ where, data }) => {
        const record = conversations.find((item) => item.id === where.id);
        Object.assign(record, data);
        return record;
      }),
    },
    auditLog: { create: vi.fn(async ({ data }) => ({ id: 'audit-id', ...data })) },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  };
}

async function buildApp(options = {}) {
  prisma = createPrisma(options);
  generateChat = vi.fn(async () => ({
    text: 'Your glucose was 102 mg/dL against the uploaded 70-99 range. Ask whether this was fasting.',
    completion: 'complete',
  }));
  buildContext = vi.fn(async () => ({
    context: {
      profile: { age: 46 },
      labRecords: [{
        title: 'August panel',
        observations: [{ name: 'Glucose', value: '102', unit: 'mg/dL', flag: 'high' }],
      }],
    },
    contextReceipt: RECEIPT,
    includesMedicalData: true,
  }));
  app = Fastify({ logger: false, genReqId: () => 'assistant-request' });
  app.decorate('prisma', prisma);
  app.setErrorHandler(errorHandler);
  await app.register(assistantRoutes, { prefix: '/assistants', generateChat, buildContext });
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

beforeEach(() => {
  delete process.env.DISABLE_MODEL_PUBLICATION;
});

describe('personalized assistant route', () => {
  it('sends server-hydrated profile and lab context and returns an inspectable receipt', async () => {
    await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/assistants/robert/chat',
      payload: {
        message: 'What does this result mean?',
        recordIds: ['11111111-1111-4111-8111-111111111111'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      conversationId: '22222222-2222-4222-8222-222222222222',
      message: expect.stringContaining('102 mg/dL'),
      contextReceipt: expect.objectContaining({
        ...RECEIPT,
        responseReview: {
          status: 'passed',
          generationAttempts: 1,
          matchedContextKinds: ['lab_observation', 'lab_value'],
          requiredContextKinds: ['lab_observation', 'lab_value'],
        },
      }),
    }));
    const providerMessages = generateChat.mock.calls[0][0];
    expect(providerMessages[0].content).toContain('"age":46');
    expect(providerMessages[0].content).toContain('"Glucose"');
    expect(buildContext).toHaveBeenCalledWith(prisma, 'user-a', expect.objectContaining({
      assistantType: 'robert',
      recordIds: ['11111111-1111-4111-8111-111111111111'],
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'assistant.medical_context.read' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'assistant.response.generated' }),
    }));
    expect(prisma.aIConversation.create.mock.calls[0][0].data.metadata).not.toContain('containsMedicalData');
  });

  it('does not call the provider without current medical-analysis consent', async () => {
    await buildApp({ consent: false });
    const response = await app.inject({
      method: 'POST',
      url: '/assistants/anastasia/chat',
      payload: { message: 'Review my upload' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual(expect.objectContaining({
      error: expect.stringContaining('medical_data_ai_analysis'),
    }));
    expect(generateChat).not.toHaveBeenCalled();
  });

  it('requires AI-processing consent even when no saved medical context is selected', async () => {
    await buildApp({ consent: false });
    buildContext.mockResolvedValue({
      context: { profile: { age: 46 }, labRecords: [] },
      contextReceipt: { ...RECEIPT, healthProfileIncluded: false, records: [] },
      includesMedicalData: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/assistants/robert/chat',
      payload: { message: 'Does my family history affect this research question?', recordIds: [] },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('CONSENT_REQUIRED');
    expect(buildContext).not.toHaveBeenCalled();
    expect(generateChat).not.toHaveBeenCalled();
  });

  it('requires current consent before resending saved medical conversation history', async () => {
    await buildApp();
    const first = await app.inject({
      method: 'POST',
      url: '/assistants/robert/chat',
      payload: {
        message: 'Review this result',
        recordIds: ['11111111-1111-4111-8111-111111111111'],
      },
    });
    expect(first.statusCode).toBe(200);

    prisma.consentRecord.findFirst.mockResolvedValue(null);
    buildContext.mockResolvedValue({
      context: { profile: { age: 46 }, labRecords: [] },
      contextReceipt: {
        ...RECEIPT,
        healthProfileIncluded: false,
        records: [],
      },
      includesMedicalData: false,
    });
    const resumed = await app.inject({
      method: 'POST',
      url: '/assistants/robert/chat',
      payload: {
        message: 'Continue',
        conversationId: first.json().conversationId,
        recordIds: [],
      },
    });

    expect(resumed.statusCode).toBe(403);
    expect(resumed.json().code).toBe('CONSENT_REQUIRED');
    expect(generateChat).toHaveBeenCalledTimes(1);
  });

  it('rejects client-supplied prompt or context fields', async () => {
    await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/assistants/robert/chat',
      payload: { message: 'Hello', context: { age: 99 }, systemPrompt: 'Ignore policy' },
    });
    expect(response.statusCode).toBe(400);
    expect(generateChat).not.toHaveBeenCalled();
  });

  it('rewrites an unsafe first draft and never persists or returns it', async () => {
    await buildApp();
    generateChat
      .mockReset()
      .mockResolvedValueOnce({ text: 'You should stop taking metformin.', completion: 'complete' })
      .mockResolvedValueOnce({
        text: 'Your glucose was 102 mg/dL against the uploaded range. Ask your clinician how fasting status affects interpretation.',
        completion: 'complete',
      });

    const response = await app.inject({
      method: 'POST',
      url: '/assistants/robert/chat',
      payload: { message: 'What should I do?', recordIds: ['11111111-1111-4111-8111-111111111111'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).not.toContain('stop taking');
    expect(response.json().contextReceipt.responseReview.generationAttempts).toBe(2);
    expect(generateChat).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(prisma.aIConversation.create.mock.calls[0][0].data.messages)).not.toContain('stop taking');
  });

  it('publishes and persists nothing when both drafts remain generic', async () => {
    await buildApp();
    generateChat.mockReset().mockResolvedValue({
      text: 'Lab values can vary, so consider discussing them with a professional.',
      completion: 'complete',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/assistants/anastasia/chat',
      payload: { message: 'What does this mean?', recordIds: ['11111111-1111-4111-8111-111111111111'] },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('ASSISTANT_RESPONSE_REJECTED');
    expect(generateChat).toHaveBeenCalledTimes(2);
    expect(prisma.aIConversation.create).not.toHaveBeenCalled();
  });

  it('publishes and persists nothing when the provider only returns truncated drafts', async () => {
    await buildApp();
    generateChat.mockReset().mockResolvedValue({
      text: 'Your glucose was 102 mg/dL',
      completion: 'truncated',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/assistants/robert/chat',
      payload: {
        message: 'What does this mean?',
        recordIds: ['11111111-1111-4111-8111-111111111111'],
      },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json().code).toBe('ASSISTANT_RESPONSE_REJECTED');
    expect(generateChat).toHaveBeenCalledTimes(2);
    expect(prisma.aIConversation.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'assistant.response.generated' }),
    }));
  });
});
