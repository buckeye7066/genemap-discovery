import { it } from 'vitest';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createOwnerSubscription } from '../lib/ownerSubscription.js';
const env = { OWNER_AI_USER_ID: 'lease-owner', OWNER_AI_EMAIL: 'lease@example.test', OWNER_AI_BRIDGE_ENABLED: 'true', OWNER_AI_BRIDGE_TOKEN: 'r'.repeat(48) };
const ready = { providers: { codex: 'ready' } };
const receipt = { ok: true, complete: true, provider: 'subscription:codex', billing_mode: 'subscription', model: 'gpt-6-astra', model_source: 'app_server_configuration', raw: 'Recovered response', usage: { input_tokens: 8, cached_input_tokens: 0, output_tokens: 30 } };
it('production owner bridge requires explicit single-replica deployment', () => {
  for (const count of [undefined, '0', '2', 'many']) {
    const runtime = createOwnerSubscription({ env: { ...env, NODE_ENV: 'production', OWNER_AI_API_REPLICAS: count } });
    runtime.poll(ready);
    assert.equal(runtime.status().enabled, false);
    assert.equal(runtime.status().online, false);
  }
  const runtime = createOwnerSubscription({ env: { ...env, NODE_ENV: 'production', OWNER_AI_API_REPLICAS: '1' } });
  runtime.poll(ready);
  assert.equal(runtime.status().online, true);
  assert.equal(runtime.status().single_replica_required, true);
});
it('expired lease recovery preserves the deadline and rejects the previous worker', async () => {
  let clock = 1000;
  const runtime = createOwnerSubscription({ env, now: () => clock });
  runtime.poll(ready);
  await runtime.scope(new EventEmitter(), async () => {
    runtime.identify({ id: env.OWNER_AI_USER_ID, email: env.OWNER_AI_EMAIL, role: 'admin' });
    const pending = runtime.complete({ prompt: 'Synthetic recovery request', maxTokens: 10, timeoutMs: 30000 });
    pending.catch(() => {});
    const original = runtime.poll(ready).job;
    clock += 11000;
    const recovered = runtime.poll(ready).job;
    assert.ok(recovered);
    assert.equal(recovered.id, original.id);
    assert.notEqual(recovered.lease, original.lease);
    assert.equal(recovered.timeoutMs, 19000);
    assert.equal(runtime.result({ id: original.id, lease: original.lease, result: receipt }), false);
    assert.equal(runtime.result({ id: recovered.id, lease: recovered.lease, result: receipt }), true);
    assert.equal((await pending).raw, receipt.raw);
    assert.equal(runtime.result({ id: recovered.id, lease: recovered.lease, result: receipt }), true);
    assert.equal(runtime.status().pending, 0);
  });
});
