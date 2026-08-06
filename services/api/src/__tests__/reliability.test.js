import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { parseJsonFromLLM, isConnectionResetError } from '../services/llm.js';
import { normalizeQuery } from '../services/genomicDatabases.js';
import { __test as llmInternals } from '../routes/llm.js';
import { __test as reporterInternals } from '../services/errorReporter.js';
import { routeLabel } from '../middleware/errorHandler.js';

// ─── routeLabel (no PII to logs / Sentry / owner email) ──────────────────────
describe('routeLabel', () => {
  it('prefers the route pattern, which carries no user values', () => {
    const req = { routeOptions: { url: '/genomics/gene/:symbol' }, url: '/genomics/gene/BRCA1?token=secret' };
    expect(routeLabel(req)).toBe('/genomics/gene/:symbol');
  });

  it('strips the query string when no route pattern is available (e.g. 404s)', () => {
    // request.routerPath was removed in Fastify v5; without routeOptions.url the
    // old code logged the FULL url incl. query — which can be PII on a medical app.
    const req = { url: '/genomics/variant/search?q=patient%20phenotype&token=abc' };
    expect(routeLabel(req)).toBe('/genomics/variant/search');
    expect(routeLabel(req)).not.toContain('?');
    expect(routeLabel(req)).not.toContain('phenotype');
  });

  it('is safe when url is missing', () => {
    expect(routeLabel({})).toBe('');
  });
});

// ─── parseJsonFromLLM ────────────────────────────────────────────────────────
describe('parseJsonFromLLM', () => {
  it('parses bare JSON', () => {
    expect(parseJsonFromLLM('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n[{"q":"x"}]\n```';
    expect(parseJsonFromLLM(raw)).toEqual([{ q: 'x' }]);
  });

  it('ignores leading/trailing prose around a JSON object', () => {
    const raw = 'Sure! Here is the result:\n{"genes":["BRCA1"]}\nHope that helps.';
    expect(parseJsonFromLLM(raw)).toEqual({ genes: ['BRCA1'] });
  });

  it('returns the fallback on malformed JSON instead of throwing', () => {
    expect(parseJsonFromLLM('{not json', { fallback: 'FALLBACK' })).toBe('FALLBACK');
  });

  it('returns the fallback for empty / non-string input', () => {
    expect(parseJsonFromLLM('', { fallback: null })).toBeNull();
    expect(parseJsonFromLLM(undefined, { fallback: 42 })).toBe(42);
  });

  it('applies a boolean validator and falls back when it fails', () => {
    const isArray = (v) => Array.isArray(v);
    expect(parseJsonFromLLM('{"not":"array"}', { fallback: [], validate: isArray })).toEqual([]);
    expect(parseJsonFromLLM('[1,2]', { fallback: [], validate: isArray })).toEqual([1, 2]);
  });

  it('supports a Zod-style { success, data } validator', () => {
    const validator = (v) => (v && v.ok ? { success: true, data: v } : { success: false });
    expect(parseJsonFromLLM('{"ok":true}', { validate: validator })).toEqual({ ok: true });
    expect(parseJsonFromLLM('{"ok":false}', { fallback: 'X', validate: validator })).toBe('X');
  });
});

// ─── connection-reset classification (llm retry layer) ───────────────────────
describe('isConnectionResetError', () => {
  it('recognizes a bare undici "Premature close" (no HTTP status)', () => {
    expect(isConnectionResetError(new Error('Premature close'))).toBe(true);
  });

  it('recognizes reset codes on the error or its cause', () => {
    const byCode = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    const byCause = Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' }),
    });
    expect(isConnectionResetError(byCode)).toBe(true);
    expect(isConnectionResetError(byCause)).toBe(true);
    expect(isConnectionResetError(new Error('socket hang up'))).toBe(true);
  });

  it('does not misclassify ordinary errors as connection resets', () => {
    expect(isConnectionResetError(new Error('model does not exist'))).toBe(false);
    expect(isConnectionResetError(null)).toBe(false);
  });
});

// ─── error reporter: transient transport noise is non-actionable ─────────────
describe('errorReporter transient-connection triage', () => {
  it('classifies "Premature close" as non-actionable (log-only, no owner page)', () => {
    expect(reporterInternals.isNonActionable({ name: 'Error', message: 'Premature close' }, 500)).toBe(true);
    expect(reporterInternals.isNonActionable({ message: 'socket hang up' })).toBe(true);
    expect(reporterInternals.isNonActionable({ message: 'read ECONNRESET' })).toBe(true);
  });

  it('still pages the owner for genuine server bugs', () => {
    expect(reporterInternals.isNonActionable({ name: 'TypeError', message: "Cannot read properties of undefined (reading 'x')" }, 500)).toBe(false);
    expect(reporterInternals.isNonActionable({ message: 'relation "users" does not exist' }, 500)).toBe(false);
  });

  it('heuristic labels a premature close as low severity, not high', () => {
    const analysis = reporterInternals.heuristicAnalysis({ name: 'Error', message: 'Premature close' }, { statusCode: 500 });
    expect(analysis.severity).toBe('low');
    expect(analysis.cause).toMatch(/reset|closed/i);
  });
});

// ─── normalizeQuery (genomic database inputs) ────────────────────────────────
describe('normalizeQuery', () => {
  it('trims and lower-cases so cache keys are case-insensitive', () => {
    expect(normalizeQuery('  BRCA1 ')).toBe('brca1');
  });

  it('bounds the length to defeat oversized queries', () => {
    const huge = 'a'.repeat(5000);
    expect(normalizeQuery(huge).length).toBe(256);
  });

  it('returns empty string for nullish input', () => {
    expect(normalizeQuery(undefined)).toBe('');
    expect(normalizeQuery(null)).toBe('');
  });
});

// ─── validatePrompt (LLM route bounds) ───────────────────────────────────────
describe('validatePrompt', () => {
  it('accepts a normal prompt', () => {
    expect(() => llmInternals.validatePrompt('Explain BRCA1')).not.toThrow();
  });

  it('rejects a non-string prompt', () => {
    expect(() => llmInternals.validatePrompt(undefined)).toThrow(/string/i);
  });

  it('rejects an over-long prompt', () => {
    const huge = 'x'.repeat(llmInternals.MAX_PROMPT_CHARS + 1);
    expect(() => llmInternals.validatePrompt(huge)).toThrow(/characters or fewer/i);
  });
});

// ─── LLM route input bounds (integration) ────────────────────────────────────
vi.mock('../services/llm.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    generateExplanation: vi.fn(async (p, o) => `EXPL(${p.length}):${o.maxTokens}`),
    generateChatResponse: vi.fn(async (m, o) => `CHAT(${m.length}):${o.maxTokens}`),
    generateImage: vi.fn(async (_p, o) => ({ url: `https://img/${o.size}` })),
  };
});

describe('LLM route input bounds', () => {
  let app;
  let prisma;

  beforeAll(async () => {
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeLlm: true });
  });

  afterAll(async () => app.close());

  beforeEach(() => {
    prisma._reset();
    prisma.learningSession.count = vi.fn(async () => 0);
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);
    prisma.user.findUnique = vi.fn(async ({ where }) =>
      prisma._store.user.find((u) => u.id === where.id) || null,
    );
    prisma._store.user.push({
      id: 'free-user', email: 'free@example.com', role: 'user',
      banned: false, subscriptions: [], createdAt: new Date(), updatedAt: new Date(),
    });
  });

  const cookie = () => authCookie({ userId: 'free-user', email: 'free@example.com', role: 'user' });

  it('rejects an over-long raw prompt with 400 before provider execution', async () => {
    const res = await app.inject({
      method: 'POST', url: '/llm/invoke', headers: { cookie: cookie() },
      payload: { prompt: 'x'.repeat(llmInternals.MAX_PROMPT_CHARS + 1) },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects raw VCF-looking content by default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: cookie() },
      payload: {
        prompt: [
          '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
          '1\t10\trs1\tA\tG\t99\tPASS\t.',
          '1\t11\trs2\tC\tT\t99\tPASS\t.',
          '1\t12\trs3\tG\tA\t99\tPASS\t.',
        ].join('\n'),
      },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/raw prompt/i);
  });

  it('rejects an out-of-contract structured cohort bound', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: cookie() },
      payload: {
        publicationTask: 'aggregate_genomics_research',
        taskInput: {
          version: 1,
          cohort: { sampleCount: 1_000_001, classification: 'deidentified_aggregate', hasControls: true },
          modalities: ['wes'],
          objective: 'identify_variants',
        },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects arbitrary chat regardless of message count or size', async () => {
    const res = await app.inject({
      method: 'POST', url: '/llm/chat', headers: { cookie: cookie() },
      payload: { messages: [{ role: 'user', content: 'x' }] },
    });
    expect(res.statusCode).toBe(400);
  });
});
