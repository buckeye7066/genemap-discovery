import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// The client-error ingest (/report-client-error) is UNAUTHENTICATED and feeds
// the reporter's analyzeError, which sends the client-supplied message/stack to
// a cloud LLM for triage. A malicious/unlucky client could POST a VCF-shaped
// error; there is no user and no consent path here, so analyzeError must NOT
// forward it — it must fall back to the deterministic heuristic.
vi.mock('../services/llm.js', () => ({
  generateExplanation: vi.fn(async () => '{"cause":"x","fix":"y","severity":"low"}'),
  parseJsonFromLLM: vi.fn(() => ({ cause: 'x', fix: 'y', severity: 'low' })),
}));

import { __test } from '../services/errorReporter.js';
import * as llm from '../services/llm.js';

const { analyzeError } = __test;

// Guarantee no real paid API call can happen from this file regardless of which
// module instance analyzeError resolves (the global setup pre-imports the real
// llm.js and a real OPENAI_API_KEY is present).
let savedKey;
beforeAll(() => {
  savedKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = '';
});
afterAll(() => { process.env.OPENAI_API_KEY = savedKey; });
beforeEach(() => vi.clearAllMocks());

const VCF_MESSAGE = [
  '#CHROM POS ID REF ALT',
  'chr1 12345 rs1 A G',
  'chr2 67890 rs2 C T',
  'chr7 11111 rs3 G A',
].join('\n');

describe('errorReporter analyzeError — unauthenticated genomic safety', () => {
  it('does NOT forward VCF-shaped error content to the cloud LLM; uses the heuristic', async () => {
    const result = await analyzeError(
      { name: 'Error', message: VCF_MESSAGE, stack: 'at handler' },
      { source: 'frontend', statusCode: 500 },
    );
    // The security property: the provider wrapper is never invoked for genomic content.
    expect(llm.generateExplanation).not.toHaveBeenCalled();
    // A usable analysis is still returned (deterministic heuristic).
    expect(result).toMatchObject({
      cause: expect.any(String),
      fix: expect.any(String),
      severity: expect.any(String),
    });
  });

  it('returns a valid analysis for an ordinary (non-genomic) error without throwing', async () => {
    const result = await analyzeError(
      { name: 'TypeError', message: "Cannot read properties of undefined (reading 'x')", stack: 'at foo' },
      { source: 'backend', statusCode: 500 },
    );
    // Non-genomic content is not over-blocked: analyzeError proceeds normally and
    // yields an analysis (from the mocked LLM or the heuristic fallback).
    expect(result).toMatchObject({
      cause: expect.any(String),
      fix: expect.any(String),
      severity: expect.any(String),
    });
  });
});
