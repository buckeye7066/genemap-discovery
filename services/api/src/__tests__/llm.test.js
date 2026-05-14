import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { __test as llmInternals } from '../routes/llm.js';

// Mock the LLM service so tests do not call real OpenAI/Anthropic APIs.
vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async (prompt, opts) => `EXPL(${prompt.length}):${opts.maxTokens}`),
  generateChatResponse: vi.fn(async (msgs, opts) => `CHAT(${msgs.length}):${opts.maxTokens}`),
  generateImage: vi.fn(async (prompt, opts) => ({ url: `https://img/${opts.size}` })),
}));

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false, includeLlm: true });
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
  prisma._store.user.push({
    id: 'free-user',
    email: 'free@example.com',
    role: 'user',
    banned: false,
    subscriptions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  prisma._store.user.push({
    id: 'premium-user',
    email: 'premium@example.com',
    role: 'user',
    banned: false,
    subscriptions: [{ status: 'active' }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

describe('LLM route protection', () => {
  it('rejects anonymous /llm/invoke calls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      payload: { prompt: 'hello' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects anonymous /llm/chat calls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/chat',
      payload: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects anonymous /llm/image calls', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/image',
      payload: { prompt: 'hi' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('caps maxTokens at the absolute ceiling for premium users', () => {
    expect(llmInternals.clampTokens(999_999, true)).toBe(llmInternals.PREMIUM_MAX_TOKENS);
    expect(llmInternals.clampTokens(999_999, false)).toBeLessThanOrEqual(llmInternals.DEFAULT_MAX_TOKENS);
  });

  it('treats negative or NaN maxTokens as the default', () => {
    expect(llmInternals.clampTokens(-1, false)).toBe(llmInternals.DEFAULT_MAX_TOKENS);
    expect(llmInternals.clampTokens(NaN, false)).toBe(llmInternals.DEFAULT_MAX_TOKENS);
  });

  it('clamps temperature to [0, 2]', () => {
    expect(llmInternals.clampTemperature(-5)).toBe(0);
    expect(llmInternals.clampTemperature(99)).toBe(2);
    expect(llmInternals.clampTemperature(0.4)).toBe(0.4);
  });

  it('successful free-tier /llm/invoke returns disclaimer + result', async () => {
    // Pre-fill learningSession so we are nowhere near the daily limit
    prisma.learningSession.count = vi.fn(async () => 0);
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);
    prisma.user.findUnique = vi.fn(async ({ where }) => prisma._store.user.find((u) => u.id === where.id));

    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' }) },
      payload: { prompt: 'Explain BRCA1', options: { maxTokens: 999999 } },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.disclaimer).toMatch(/educational/i);
    // Server clamped maxTokens, never sent the user's giant value
    expect(body.result).toMatch(/EXPL\(\d+\):\d+$/);
    const reportedMax = Number(body.result.split(':')[1]);
    expect(reportedMax).toBeLessThanOrEqual(llmInternals.DEFAULT_MAX_TOKENS);
  });

  it('refuses /llm/invoke when daily free-tier explanations are exhausted', async () => {
    // Force usage limit to be hit
    prisma.learningSession.count = vi.fn(async () => 9999);
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);
    prisma.user.findUnique = vi.fn(async ({ where }) => prisma._store.user.find((u) => u.id === where.id));

    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' }) },
      payload: { prompt: 'too many calls' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/daily limit/i);
  });
});
