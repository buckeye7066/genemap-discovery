import { describe, it, expect, vi } from 'vitest';
import { withProviderRetry } from '../services/llm.js';

describe('LLM provider retry', () => {
  it('retries transient provider failures and returns the eventual result', async () => {
    const transient = new Error('rate limited https://api.openai.com/v1/chat/completions?key=secret');
    transient.status = 429;
    const operation = vi.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce('ok');

    await expect(withProviderRetry(operation, {
      provider: 'openai',
      attempts: 2,
      baseDelayMs: 0,
    })).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent provider failures and hides full upstream details', async () => {
    const permanent = new Error('bad request https://api.openai.com/v1/chat/completions?api_key=secret');
    permanent.status = 400;
    const operation = vi.fn().mockRejectedValue(permanent);

    await expect(withProviderRetry(operation, {
      provider: 'openai',
      attempts: 3,
      baseDelayMs: 0,
    })).rejects.toThrow('LLM provider api.openai.com failed HTTP 400 after 1 attempt(s)');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('sanitizes repeated network failures to host-only errors', async () => {
    const operation = vi.fn().mockRejectedValue(
      new Error('fetch failed for https://api.anthropic.com/v1/messages?key=secret')
    );

    await expect(withProviderRetry(operation, {
      provider: 'anthropic',
      attempts: 2,
      baseDelayMs: 0,
    })).rejects.toThrow('LLM provider api.anthropic.com failed after 2 attempt(s)');
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
