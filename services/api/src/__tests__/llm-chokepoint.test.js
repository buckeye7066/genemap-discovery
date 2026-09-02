import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock the low-level providers so the chokepoint (in services/llm.js) is what we
// exercise, and so a guard regression on a VCF payload would call these spies.
vi.mock('../services/openai.js', () => ({
  generateText: vi.fn(async () => 'OK_TEXT'),
  generateChatResponse: vi.fn(async () => 'OK_CHAT'),
}));
vi.mock('../services/anthropic.js', () => ({
  generateText: vi.fn(async () => 'OK_TEXT_A'),
  generateChatResponse: vi.fn(async () => 'OK_CHAT_A'),
}));

import {
  generateExplanation,
  generateChatResponse,
  generateQuiz,
  extractProviderText,
  assertProviderPayloadAllowed,
} from '../services/llm.js';
import * as openai from '../services/openai.js';

// Belt-and-suspenders: the global test setup transitively pre-imports the REAL
// provider modules and a real OPENAI_API_KEY is present in this environment.
// Unset the keys for this file so that even if a guard regression let a payload
// through, it could never make a real paid API call — it would throw a config
// error instead.
let savedKeys;
beforeAll(() => {
  savedKeys = { o: process.env.OPENAI_API_KEY, a: process.env.ANTHROPIC_API_KEY };
  process.env.OPENAI_API_KEY = '';
  process.env.ANTHROPIC_API_KEY = '';
});
afterAll(() => {
  process.env.OPENAI_API_KEY = savedKeys.o;
  process.env.ANTHROPIC_API_KEY = savedKeys.a;
});
beforeEach(() => vi.clearAllMocks());

const VCF = [
  '##fileformat=VCFv4.2',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
  'chr1\t12345\trs1\tA\tG\t50\tPASS\t.',
  'chr2\t67890\trs2\tC\tT\t60\tPASS\t.',
  'chr7\t11111\trs3\tG\tA\t70\tPASS\t.',
].join('\n');

describe('extractProviderText', () => {
  it('returns a plain string unchanged', () => {
    expect(extractProviderText('hello')).toBe('hello');
  });
  it('joins string-content messages', () => {
    expect(extractProviderText([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]))
      .toBe('a\nb');
  });
  it('extracts array-form content parts (the bypass vector)', () => {
    const text = extractProviderText([{ role: 'user', content: [{ type: 'text', text: VCF }] }]);
    expect(text).toContain('#CHROM');
  });
  it('extracts text hidden in tool_calls[].function.arguments', () => {
    const text = extractProviderText([
      { role: 'assistant', content: 'looks fine', tool_calls: [{ id: 't1', type: 'function', function: { name: 'x', arguments: VCF } }] },
    ]);
    expect(text).toContain('#CHROM');
  });
  it('extracts text hidden in function_call.arguments', () => {
    const text = extractProviderText([
      { role: 'assistant', content: 'ok', function_call: { name: 'x', arguments: VCF } },
    ]);
    expect(text).toContain('#CHROM');
  });
});

describe('assertProviderPayloadAllowed (pure chokepoint logic)', () => {
  it('throws on a raw VCF string', () => {
    expect(() => assertProviderPayloadAllowed(VCF, false)).toThrow(/not allowed/i);
  });
  it('throws on array-form message content hiding a VCF', () => {
    expect(() => assertProviderPayloadAllowed([{ role: 'user', content: [{ type: 'text', text: VCF }] }], false))
      .toThrow(/not allowed/i);
  });
  it('allows ordinary text', () => {
    expect(() => assertProviderPayloadAllowed('Explain transcription', false)).not.toThrow();
  });
  it('honours the consent-backed allowGenomic marker', () => {
    expect(() => assertProviderPayloadAllowed(VCF, true)).not.toThrow();
  });
});

describe('every exported provider function enforces the chokepoint end-to-end', () => {
  it('generateExplanation refuses a VCF and never reaches the provider', async () => {
    await expect(generateExplanation(VCF)).rejects.toThrow(/not allowed/i);
    expect(openai.generateText).not.toHaveBeenCalled();
  });
  it('generateChatResponse refuses a VCF in string content', async () => {
    await expect(generateChatResponse([{ role: 'user', content: VCF }])).rejects.toThrow(/not allowed/i);
    expect(openai.generateChatResponse).not.toHaveBeenCalled();
  });
  it('generateChatResponse refuses a VCF hidden in ARRAY-form content parts', async () => {
    await expect(
      generateChatResponse([{ role: 'user', content: [{ type: 'text', text: VCF }] }]),
    ).rejects.toThrow(/not allowed/i);
    expect(openai.generateChatResponse).not.toHaveBeenCalled();
  });

  it('generateChatResponse refuses a VCF hidden in tool_calls[].function.arguments (clean content)', async () => {
    await expect(
      generateChatResponse([
        { role: 'assistant', content: 'here is your answer', tool_calls: [{ id: 't1', type: 'function', function: { name: 'annotate', arguments: VCF } }] },
      ]),
    ).rejects.toThrow(/not allowed/i);
    expect(openai.generateChatResponse).not.toHaveBeenCalled();
  });
  it('generateQuiz refuses a VCF prompt', async () => {
    await expect(generateQuiz(VCF)).rejects.toThrow(/not allowed/i);
    expect(openai.generateText).not.toHaveBeenCalled();
  });
});
