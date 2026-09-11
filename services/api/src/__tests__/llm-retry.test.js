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

  it('does not retry a 429 that means the provider account has no quota left', async () => {
    const exhausted = new Error('429 You exceeded your current quota, please check your plan and billing details.');
    exhausted.status = 429;
    exhausted.code = 'insufficient_quota';
    const operation = vi.fn().mockRejectedValue(exhausted);

    await expect(withProviderRetry(operation, {
      provider: 'openai',
      attempts: 3,
      baseDelayMs: 0,
    })).rejects.toThrow('LLM provider api.openai.com failed HTTP 429 after 1 attempt(s)');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('recognises exhausted credits from the message when no code is attached', async () => {
    const exhausted = new Error('429 You have no credits remaining. Add credits to continue using the API.');
    exhausted.status = 429;
    const operation = vi.fn().mockRejectedValue(exhausted);

    await expect(withProviderRetry(operation, {
      provider: 'openai',
      attempts: 3,
      baseDelayMs: 0,
    })).rejects.toThrow('after 1 attempt(s)');
    expect(operation).toHaveBeenCalledTimes(1);
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

  it('does NOT retry a client-side timeout (would only blow the gateway budget)', async () => {
    // The OpenAI/Anthropic SDKs throw an APITimeoutError when a call exceeds the
    // per-request timeout. Retrying it just burns another full window, so after
    // 3 attempts the upstream gateway drops the connection and the browser gets
    // an empty body. Fail fast on the first timeout instead.
    const timeout = new Error('Request timed out.');
    timeout.name = 'APITimeoutError';
    const operation = vi.fn().mockRejectedValue(timeout);

    await expect(withProviderRetry(operation, {
      provider: 'openai',
      attempts: 3,
      baseDelayMs: 0,
    })).rejects.toThrow('LLM provider api.openai.com failed after 1 attempt(s)');
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
