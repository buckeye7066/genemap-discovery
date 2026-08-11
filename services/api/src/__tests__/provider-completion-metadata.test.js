import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/genomicGuard.js', () => ({
  looksLikeRawGenomicContent: () => false,
}));
import { __test as openai } from '../services/openai.js';
import { __test as anthropic } from '../services/anthropic.js';
import { withProviderRetry } from '../services/llm.js';

describe('provider completion metadata', () => {
  it.each([
    ['stop', 'complete'],
    ['length', 'truncated'],
    ['content_filter', 'filtered'],
    [null, 'failed'],
    ['tool_calls', 'failed'],
  ])('maps OpenAI finish_reason %s to %s', (finishReason, completion) => {
    expect(openai.normalizeCompletion({
      choices: [{ finish_reason: finishReason, message: { content: 'bounded text' } }],
    })).toEqual({ text: 'bounded text', completion });
  });

  it.each([
    ['string', 'REFUSAL_STRING_MUST_NOT_ESCAPE', null],
    [
      'structured',
      { type: 'refusal', reason: 'REFUSAL_OBJECT_MUST_NOT_ESCAPE' },
      'CONTENT_ALONGSIDE_REFUSAL_MUST_NOT_ESCAPE',
    ],
  ])('classifies an OpenAI %s message refusal before a stop completion', (
    _shape,
    refusal,
    content,
  ) => {
    const normalized = openai.normalizeCompletion({
      choices: [{
        finish_reason: 'stop',
        message: { content, refusal },
      }],
    });

    expect(normalized).toEqual({ text: '', completion: 'filtered' });
    expect(JSON.stringify(normalized)).not.toContain('MUST_NOT_ESCAPE');
  });

  it('does not treat the standard null OpenAI refusal field as filtering', () => {
    expect(openai.normalizeCompletion({
      choices: [{
        finish_reason: 'stop',
        message: { content: 'bounded text', refusal: null },
      }],
    })).toEqual({ text: 'bounded text', completion: 'complete' });
  });

  it.each([
    ['end_turn', 'complete'],
    ['stop_sequence', 'complete'],
    ['max_tokens', 'truncated'],
    ['refusal', 'filtered'],
    [null, 'failed'],
  ])('maps Anthropic stop_reason %s to %s', (stopReason, completion) => {
    expect(anthropic.normalizeCompletion({
      stop_reason: stopReason,
      content: [{ type: 'text', text: 'bounded text' }],
    })).toEqual({ text: 'bounded text', completion });
  });
});

describe('provider failure classification', () => {
  it('fails a timeout fast with a stable non-sensitive reason', async () => {
    const operation = async () => {
      const error = new Error('provider timed out after secret upstream details');
      error.name = 'TimeoutError';
      throw error;
    };

    await expect(withProviderRetry(operation, {
      provider: 'openai',
      attempts: 3,
      baseDelayMs: 0,
    })).rejects.toMatchObject({
      code: 'LLM_PROVIDER_TIMEOUT',
      message: 'LLM provider api.openai.com failed after 1 attempt(s)',
    });
  });
});
