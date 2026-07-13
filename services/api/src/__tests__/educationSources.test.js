import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import {
  getSources,
  GENERAL_SOURCES,
  TOPIC_GLOSSARY,
  CATEGORY_SOURCES,
} from '../services/educationSources.js';

vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async () => 'explanation body'),
  generateChatResponse: vi.fn(async () => 'chat'),
  generateQuiz: vi.fn(async () => [{ question: 'q', options: ['a', 'b'], correctIndex: 0, explanation: 'e' }]),
  generateImage: vi.fn(async () => ({ url: 'https://img/x' })),
}));

// ─── Pure unit tests ─────────────────────────────────────────────────────────

describe('education source resolver', () => {
  it('all curated URLs are https and from authoritative hosts', () => {
    const all = [
      ...GENERAL_SOURCES,
      ...Object.values(TOPIC_GLOSSARY),
      ...Object.values(CATEGORY_SOURCES).flat(),
    ];
    const allowedHosts = ['medlineplus.gov', 'www.genome.gov', 'www.ncbi.nlm.nih.gov', 'www.ensembl.org', 'hpo.jax.org'];
    for (const s of all) {
      expect(s.url.startsWith('https://')).toBe(true);
      const host = new URL(s.url).host;
      expect(allowedHosts).toContain(host);
      expect(s.label).toBeTruthy();
      expect(s.publisher).toBeTruthy();
    }
  });

  it('always returns the general NIH/NHGRI references, even for an unknown topic', () => {
    const sources = getSources({});
    expect(sources.length).toBeGreaterThanOrEqual(GENERAL_SOURCES.length);
    for (const g of GENERAL_SOURCES) {
      expect(sources.some((s) => s.url === g.url)).toBe(true);
    }
  });

  it('leads with the topic glossary entry, then category, then general — deduped', () => {
    const sources = getSources({ topicId: 'crispr', category: 'Genomics & Technology' });
    expect(sources[0].url).toBe(TOPIC_GLOSSARY.crispr.url);
    // No duplicate URLs.
    const urls = sources.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

// ─── Route integration ───────────────────────────────────────────────────────

describe('/education/explain attaches sources', () => {
  let app;
  let prisma;
  const user = { userId: 'src-user', email: 'src@example.com', role: 'user' };

  beforeAll(async () => {
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeEducation: true });
  });
  afterAll(async () => app.close());

  beforeEach(() => {
    prisma._reset();
    vi.clearAllMocks();
    prisma._store.user.push({
      id: user.userId, email: user.email, role: 'user', banned: false, subscriptions: [],
      createdAt: new Date(), updatedAt: new Date(),
    });
    prisma.learningSession.count = vi.fn(async () => 0);
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);
  });

  it('returns a non-empty, verified-shape sources array for a known topic', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topic: 'CRISPR', level: 'high_school' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.sources)).toBe(true);
    expect(body.sources.length).toBeGreaterThan(0);
    // 'CRISPR' resolves to the crispr topic id → its glossary entry leads.
    expect(body.sources[0].url).toContain('genome.gov/genetics-glossary/CRISPR');
    for (const s of body.sources) {
      expect(s.url.startsWith('https://')).toBe(true);
      expect(typeof s.label).toBe('string');
    }
  });

  it('still returns general sources for an unknown/custom topic', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topic: 'some obscure made-up topic', level: 'undergraduate' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sources.length).toBeGreaterThanOrEqual(1);
    expect(body.sources.some((s) => s.url === 'https://medlineplus.gov/genetics/')).toBe(true);
  });
});
