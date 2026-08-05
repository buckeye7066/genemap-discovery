import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { gzipSync } from 'node:zlib';
import {
  looksLikeRawGenomicContent,
  assertNoRawGenomicLLM,
} from '../services/genomicGuard.js';

// Mock the LLM service so a guard *failure* can be proven to short-circuit
// BEFORE any cloud provider is reached. If the guard ever regressed, these
// spies would be called and the assertions would fail.
vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async () => 'MOCK_EXPLANATION'),
  generateChatResponse: vi.fn(async () => 'MOCK_CHAT'),
  generateImage: vi.fn(async () => ({ url: 'https://img/mock' })),
  generateQuiz: vi.fn(async () => [{ question: 'q', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e' }]),
}));

const RAW_VCF = [
  '##fileformat=VCFv4.2',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
  'chr1\t12345\trs1\tA\tG\t50\tPASS\t.',
  'chr2\t67890\trs2\tC\tT\t60\tPASS\t.',
  'chr7\t11111\trs3\tG\tA\t70\tPASS\t.',
].join('\n');

const RAW_VARIANT_ROWS = [
  '1 12345 rs1 A G',
  '2 67890 rs2 C T',
  'X 11111 . G A',
].join('\n');

describe('looksLikeRawGenomicContent (detector)', () => {
  it('flags a canonical VCF #CHROM header', () => {
    expect(looksLikeRawGenomicContent(RAW_VCF)).toBe(true);
  });

  it('flags three or more variant-shaped rows without a header', () => {
    expect(looksLikeRawGenomicContent(RAW_VARIANT_ROWS)).toBe(true);
  });

  it('does NOT flag ordinary educational prose', () => {
    expect(looksLikeRawGenomicContent(
      'Explain how the BRCA1 gene on chromosome 17 relates to cancer risk.'
    )).toBe(false);
  });

  it('does NOT flag one or two stray variant mentions (too few to be a file)', () => {
    expect(looksLikeRawGenomicContent('chr1 12345 rs1 A G is a single variant of interest')).toBe(false);
  });

  it('is safe on non-string input', () => {
    expect(looksLikeRawGenomicContent(null)).toBe(false);
    expect(looksLikeRawGenomicContent(undefined)).toBe(false);
    expect(looksLikeRawGenomicContent(42)).toBe(false);
  });

  // ── Fail-closed on small / encoded / structured payloads ──────────────────
  it('flags a SINGLE bare VCF variant record', () => {
    expect(looksLikeRawGenomicContent('chr1\t12345\trs1\tA\tG\t50\tPASS\t.')).toBe(true);
    expect(looksLikeRawGenomicContent('1 12345 rs1 A G')).toBe(true);
  });

  it('flags a pasted compact single-variant identifier', () => {
    expect(looksLikeRawGenomicContent('1-12345-A-G')).toBe(true);
    expect(looksLikeRawGenomicContent('chr1:12345:A>G')).toBe(true);
  });

  it('flags a bare HGVS variant', () => {
    expect(looksLikeRawGenomicContent('c.20A>T')).toBe(true);
  });

  it('flags a JSON variant array', () => {
    expect(looksLikeRawGenomicContent(
      '[{"chromosome":"1","position":12345,"referenceAllele":"A","alternateAllele":"G"}]'
    )).toBe(true);
  });

  it('flags a CSV with variant columns', () => {
    expect(looksLikeRawGenomicContent('chrom,pos,ref,alt\n1,12345,A,G')).toBe(true);
  });

  it('flags a base64-encoded VCF (fail closed on encoding)', () => {
    const b64 = Buffer.from(RAW_VCF, 'utf8').toString('base64');
    expect(looksLikeRawGenomicContent(`here is my file: ${b64}`)).toBe(true);
  });

  it('flags a gzip+base64-encoded VCF', () => {
    const gz = gzipSync(Buffer.from(RAW_VCF, 'utf8')).toString('base64');
    expect(looksLikeRawGenomicContent(gz)).toBe(true);
  });

  it('BLOCKS a gzip decompression bomb quickly, without a huge allocation', () => {
    // ~10 MB of zeros compresses to a tiny base64 blob; the guard must cap the
    // decompression output and BLOCK rather than expand it fully.
    const bomb = gzipSync(Buffer.alloc(10_000_000)).toString('base64');
    const start = Date.now();
    expect(looksLikeRawGenomicContent(bomb)).toBe(true);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('catches a chunked (whitespace-wrapped) data-URI base64 VCF', () => {
    const b64 = Buffer.from(RAW_VCF, 'utf8').toString('base64');
    const chunked = b64.match(/.{1,8}/g).join(' '); // a space every 8 chars
    expect(looksLikeRawGenomicContent(`data:application/octet-stream;base64,${chunked}`)).toBe(true);
  });

  it('catches MIME-wrapped (newline every 76 chars) base64 VCF', () => {
    const b64 = Buffer.from(RAW_VCF, 'utf8').toString('base64');
    const wrapped = b64.match(/.{1,76}/g).join('\r\n');
    expect(looksLikeRawGenomicContent(`Attachment:\n${wrapped}`)).toBe(true);
  });

  it('catches gzip+base64 VCF with whitespace inserted throughout', () => {
    const gz = gzipSync(Buffer.from(RAW_VCF, 'utf8')).toString('base64');
    const spaced = gz.match(/.{1,6}/g).join('\n');
    expect(looksLikeRawGenomicContent(spaced)).toBe(true);
  });

  it('catches a prefaced CSV variant block with leading blank lines', () => {
    expect(looksLikeRawGenomicContent('\n\nhere is my file:\nchrom,pos,ref,alt\n1,12345,A,G')).toBe(true);
  });

  it('does NOT flag a single HGVS/coordinate mention inside a sentence (education still works)', () => {
    expect(looksLikeRawGenomicContent('What does the variant c.20A>T in HBB mean?')).toBe(false);
    expect(looksLikeRawGenomicContent('The SNP chr1:12345:A>G is discussed in this paper.')).toBe(false);
  });
});

describe('assertNoRawGenomicLLM (enforcement)', () => {
  const OLD_ENV = process.env.ALLOW_GENOMIC_LLM_UPLOAD;

  function stubPrisma() {
    return {
      consentRecord: { findFirst: vi.fn(async () => null) },
      auditLog: { create: vi.fn(async (args) => ({ id: 'a1', ...args.data })) },
    };
  }

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.ALLOW_GENOMIC_LLM_UPLOAD;
    else process.env.ALLOW_GENOMIC_LLM_UPLOAD = OLD_ENV;
  });

  it('passes through non-genomic text (returns false) without touching prisma', async () => {
    const prisma = stubPrisma();
    await expect(assertNoRawGenomicLLM(prisma, 'u1', 'What is a codon?')).resolves.toBe(false);
    expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
  });

  it('rejects raw genomic content by default (no opt-in)', async () => {
    delete process.env.ALLOW_GENOMIC_LLM_UPLOAD;
    const prisma = stubPrisma();
    await expect(assertNoRawGenomicLLM(prisma, 'u1', RAW_VCF)).rejects.toThrow(/not allowed/i);
    // Never even consulted consent — hard default deny.
    expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects raw genomic content when opted in but no consent record exists', async () => {
    process.env.ALLOW_GENOMIC_LLM_UPLOAD = 'true';
    const prisma = stubPrisma();
    await expect(assertNoRawGenomicLLM(prisma, 'u1', RAW_VCF)).rejects.toThrow(/consent required/i);
    expect(prisma.consentRecord.findFirst).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('allows (returns true) + audit-logs (minimised) when opted in AND consent is granted', async () => {
    process.env.ALLOW_GENOMIC_LLM_UPLOAD = 'true';
    const prisma = stubPrisma();
    prisma.consentRecord.findFirst = vi.fn(async () => ({ id: 'c1', granted: true }));

    await expect(assertNoRawGenomicLLM(prisma, 'u1', RAW_VCF)).resolves.toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    const logged = prisma.auditLog.create.mock.calls[0][0].data;
    expect(logged.action).toBe('llm.genomic_upload');
    // Minimisation: only content length, never the genomic payload.
    expect(logged.metadata).toEqual({ contentLength: RAW_VCF.length });
    expect(JSON.stringify(logged.metadata)).not.toContain('CHROM');
  });

  it('blocks when the LATEST consent record is a revocation (granted:false after an older grant)', async () => {
    process.env.ALLOW_GENOMIC_LLM_UPLOAD = 'true';
    const prisma = stubPrisma();
    // The query must NOT pre-filter to granted:true; it returns the newest
    // record, which here is the revocation.
    prisma.consentRecord.findFirst = vi.fn(async () => ({ id: 'c2', granted: false, createdAt: new Date() }));

    await expect(assertNoRawGenomicLLM(prisma, 'u1', RAW_VCF)).rejects.toThrow(/consent required/i);
    // Ensure the query did not filter on granted (which would have missed the revocation).
    const where = prisma.consentRecord.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('granted');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('fails closed when userId is missing (no one to check consent for)', async () => {
    process.env.ALLOW_GENOMIC_LLM_UPLOAD = 'true';
    const prisma = stubPrisma();
    await expect(assertNoRawGenomicLLM(prisma, undefined, RAW_VCF)).rejects.toThrow(/consent required/i);
    expect(prisma.consentRecord.findFirst).not.toHaveBeenCalled();
  });
});

describe('no-cloud-genomic default is enforced on every cloud-AI route', () => {
  let app;
  let prisma;
  let llmService;

  beforeAll(async () => {
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeLlm: true, includeEducation: true });
    llmService = await import('../services/llm.js');
  });

  afterAll(async () => app.close());

  const user = { userId: 'guard-user', email: 'guard@example.com', role: 'user' };

  beforeEach(() => {
    prisma._reset();
    vi.clearAllMocks();
    delete process.env.ALLOW_GENOMIC_LLM_UPLOAD;

    // Wire the entitlement middleware against the in-memory store: a free user
    // with zero usage so requests reach the handler (and thus the guard).
    prisma.learningSession.count = vi.fn(async () => 0);
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);
    prisma.user.findUnique = vi.fn(async ({ where }) =>
      prisma._store.user.find((u) => u.id === where.id) || null,
    );
    prisma._store.user.push({
      id: user.userId,
      email: user.email,
      role: 'user',
      banned: false,
      subscriptions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('/llm/invoke rejects a pasted VCF by default and never calls the provider', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/invoke',
      headers: { cookie: authCookie(user, prisma) },
      payload: { prompt: RAW_VCF },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateExplanation).not.toHaveBeenCalled();
  });

  it('/llm/chat rejects a pasted VCF by default and never calls the provider', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/chat',
      headers: { cookie: authCookie(user, prisma) },
      payload: { messages: [{ role: 'user', content: RAW_VCF }] },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateChatResponse).not.toHaveBeenCalled();
  });

  it('/llm/chat rejects ARRAY-form content that hides a VCF (non-string-content bypass)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/chat',
      headers: { cookie: authCookie(user, prisma) },
      payload: { messages: [{ role: 'user', content: [{ type: 'text', text: RAW_VCF }] }] },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateChatResponse).not.toHaveBeenCalled();
  });

  it('/llm/chat rejects clean content that hides a VCF in tool_calls arguments', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/chat',
      headers: { cookie: authCookie(user, prisma) },
      payload: {
        messages: [
          { role: 'user', content: 'Summarize my results please' },
          { role: 'assistant', content: 'sure', tool_calls: [{ id: 't1', type: 'function', function: { name: 'annotate', arguments: RAW_VCF } }] },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateChatResponse).not.toHaveBeenCalled();
  });

  it('/llm/image rejects a VCF prompt and never calls the provider', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/llm/image',
      headers: { cookie: authCookie(user, prisma) },
      payload: { prompt: RAW_VCF },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateImage).not.toHaveBeenCalled();
  });

  it('/education/quiz rejects a VCF smuggled via the topic field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/quiz',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topic: RAW_VCF, level: 'undergraduate' },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateQuiz).not.toHaveBeenCalled();
  });

  it('/education/image rejects a VCF smuggled via the topic field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/image',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topic: RAW_VCF, level: 'undergraduate' },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateImage).not.toHaveBeenCalled();
  });

  it('/education/explain rejects a VCF smuggled via the context field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topic: 'My results', level: 'undergraduate', context: RAW_VCF },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateExplanation).not.toHaveBeenCalled();
  });

  it('/education/chat rejects a VCF pasted into a tutor turn', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/chat',
      headers: { cookie: authCookie(user, prisma) },
      payload: { messages: [{ role: 'user', content: RAW_VCF }], level: 'undergraduate' },
    });
    expect(res.statusCode).toBe(400);
    expect(llmService.generateChatResponse).not.toHaveBeenCalled();
  });

  it('/education/explain still works for an ordinary (non-genomic) topic', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/education/explain',
      headers: { cookie: authCookie(user, prisma) },
      payload: { topic: 'Transcription', level: 'high_school' },
    });
    expect(res.statusCode).toBe(200);
    expect(llmService.generateExplanation).toHaveBeenCalledOnce();
  });
});
