import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deploymentForCommit,
  monitorRailwayDeployment,
  parseDeploymentList,
  redactDiagnostic,
} from '../monitor-railway-deployment.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('parses Railway JSON and selects only the exact commit hash', () => {
  const deployments = parseDeploymentList(JSON.stringify([
    { id: 'newer-unrelated', status: 'SUCCESS', meta: { commitHash: OTHER_SHA } },
    { id: 'exact', status: 'DEPLOYING', meta: { commitHash: SHA } },
  ]));

  assert.equal(deploymentForCommit(deployments, SHA).id, 'exact');
  assert.equal(deploymentForCommit(deployments, 'c'.repeat(40)), null);
});

test('waits for exact-SHA deployment success and exact live release identity', async () => {
  let polls = 0;
  const runRailway = async (args) => {
    assert.deepEqual(args.slice(0, 2), ['deployment', 'list']);
    polls += 1;
    return {
      stdout: JSON.stringify(polls === 1
        ? [{ id: 'other', status: 'SUCCESS', meta: { commitHash: OTHER_SHA } }]
        : [{ id: 'exact', status: 'SUCCESS', meta: { commitHash: SHA } }]),
    };
  };

  const result = await monitorRailwayDeployment({
    expectedSha: SHA,
    apiUrl: 'https://api.example.invalid',
    runRailway,
    fetchImpl: async () => response({ status: 'ok', releaseSha: SHA }),
    sleep: async () => {},
    pollMs: 0,
    maxAttempts: 2,
  });

  assert.equal(result.deployment.id, 'exact');
  assert.equal(result.releaseSha, SHA);
  assert.equal(result.attempts, 2);
});

test('fails an exact crashed deployment and attaches bounded build/deploy logs', async () => {
  const calls = [];
  const runRailway = async (args) => {
    calls.push(args);
    if (args[0] === 'deployment') {
      return { stdout: JSON.stringify([{ id: 'failed-id', status: 'CRASHED', meta: { commitHash: SHA } }]) };
    }
    return { stdout: args.includes('--build') ? 'compile failed' : 'container crashed' };
  };

  await assert.rejects(
    monitorRailwayDeployment({
      expectedSha: SHA,
      apiUrl: 'https://api.example.invalid',
      runRailway,
      fetchImpl: async () => response({ status: 'ok', releaseSha: SHA }),
      maxAttempts: 1,
    }),
    /CRASHED[\s\S]*compile failed[\s\S]*container crashed/u,
  );
  assert.equal(calls.filter((args) => args[0] === 'logs').length, 2);
  assert.ok(calls.some((args) => args.includes('--lines') && args.includes('100')));
});

test('does not accept Railway success until live health reports the same SHA', async () => {
  await assert.rejects(
    monitorRailwayDeployment({
      expectedSha: SHA,
      apiUrl: 'https://api.example.invalid',
      runRailway: async () => ({
        stdout: JSON.stringify([{ id: 'exact', status: 'SUCCESS', meta: { commitHash: SHA } }]),
      }),
      fetchImpl: async () => response({ status: 'ok', releaseSha: OTHER_SHA }),
      maxAttempts: 1,
    }),
    /live releaseSha b{40} did not match a{40}/u,
  );
});

test('deployment diagnostics remain useful while credentials are redacted', () => {
  const diagnostic = redactDiagnostic(
    'build failed token=railway-secret password:hunter2 postgres://user:database-pass@host/db',
  );
  assert.match(diagnostic, /build failed/iu);
  assert.doesNotMatch(diagnostic, /railway-secret|hunter2|database-pass/iu);
  assert.match(diagnostic, /token=\*\*\*|password=\*\*\*|user:\*\*\*@/u);
});
