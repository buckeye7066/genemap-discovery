import { it, vi, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { runBridge } from '../../../../tools/owner-ai/bridge.mjs';
vi.mock('../../../../tools/owner-ai/officialCli.mjs', () => ({
  probeProvider: vi.fn(async () => 'ready'),
  executeJob: vi.fn(async () => ({ ok: true, raw: 'Synthetic completed output' })),
}));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('a lost result acknowledgment is retried after lease monitoring has stopped', async () => {
  const controller = new AbortController();
  let offered = false; let resultCalls = 0; let activeCalls = 0;
  const timeout = setTimeout(() => controller.abort(), 2800);
  const bodies = [];
  vi.stubGlobal('fetch', async (input, options) => {
    const path = new URL(input).pathname;
    const body = JSON.parse(options.body);
    if (path.endsWith('/poll')) {
      if (body.active) { activeCalls++; return Response.json({ job: null, active: false }); }
      if (offered) return Response.json({ job: null });
      offered = true;
      return Response.json({ job: { id: 'fixture', lease: 'lease', prompt: 'request', system: 'trusted', maxTokens: 20, timeoutMs: 4000 } });
    }
    assert.ok(path.endsWith('/result'));
    resultCalls++; bodies.push(body);
    if (resultCalls === 1) { await delay(1200); throw new Error('acknowledgment response lost'); }
    setTimeout(() => controller.abort(), 10);
    return Response.json({ received: true });
  });
  try {
    await runBridge({ env: { OWNER_AI_URL: 'https://owner.example.test/', OWNER_AI_BRIDGE_TOKEN: 't'.repeat(48) }, signal: controller.signal });
    assert.equal(resultCalls, 2);
    assert.equal(activeCalls, 0, 'a completed lease must not revoke acknowledgment retries');
    assert.deepEqual(bodies[0], bodies[1]);
  } finally { controller.abort(); clearTimeout(timeout); }
}, 5000);
