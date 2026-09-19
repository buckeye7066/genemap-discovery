import { it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { generateExplanation, generateQuiz, withProviderRetry } from '../services/llm.js';
import { ownerSubscription } from '../lib/ownerSubscription.js';
import * as native from '../services/openai.js';
const env = { OWNER_AI_USER_ID: 'boundary-owner', OWNER_AI_EMAIL: 'boundary@example.test', OWNER_AI_BRIDGE_ENABLED: 'true', OWNER_AI_BRIDGE_TOKEN: 'b'.repeat(48) };
const receipt = { ok: true, complete: true, provider: 'subscription:codex', billing_mode: 'subscription', model: 'gpt-6-astra', model_source: 'app_server_configuration', raw: 'Fixture answer', usage: { input_tokens: 8, cached_input_tokens: 0, output_tokens: 3 } };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function ownerRequest(operation) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const paid = vi.spyOn(native, 'generateTextResult').mockRejectedValue(new Error('Paid path must not run'));
  let observed;
  ownerSubscription.poll({ providers: { codex: 'ready' } });
  const timer = setInterval(() => {
    const { job } = ownerSubscription.poll({ providers: { codex: 'ready' } });
    if (job) { observed = job; ownerSubscription.result({ id: job.id, lease: job.lease, result: receipt }); }
  }, 5);
  try {
    await ownerSubscription.scope(new EventEmitter(), async () => {
      ownerSubscription.identify({ id: env.OWNER_AI_USER_ID, email: env.OWNER_AI_EMAIL, role: 'admin' });
      await operation();
    });
    assert.equal(paid.mock.calls.length, 0);
    return observed;
  } finally { clearInterval(timer); }
}
it('owner explanations place canonical honesty rules in trusted instructions', async () => {
  const prompt = 'Explain inheritance for a classroom lesson.';
  const job = await ownerRequest(() => generateExplanation(prompt, { includeMetadata: true }));
  assert.match(job.system, /scientific-honesty/);
  assert.match(job.system, /Never fabricate/);
  assert.equal(job.prompt, prompt);
});
it('owner quizzes preserve both the honesty directive and quiz-specific constraints', async () => {
  const prompt = 'Create a short classroom quiz.';
  const job = await ownerRequest(() => generateQuiz(prompt, { includeMetadata: true }));
  assert.match(job.system, /scientific-honesty/);
  assert.match(job.system, /quiz/i);
  assert.equal(job.prompt, prompt);
});
it('subscription unavailability retains its safe code without retry or raw detail', async () => {
  let calls = 0;
  await assert.rejects(withProviderRetry(async () => {
    calls++;
    throw Object.assign(new Error('private upstream fixture detail'), { code: 'OWNER_SUBSCRIPTION_UNAVAILABLE', status: 503 });
  }, { provider: 'openai', baseDelayMs: 0 }), error => {
    assert.equal(error.code, 'OWNER_SUBSCRIPTION_UNAVAILABLE');
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /private upstream fixture detail/);
    return true;
  });
  assert.equal(calls, 1);
});
