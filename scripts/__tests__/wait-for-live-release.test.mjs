import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeReleaseSha,
  waitForLiveRelease,
} from '../wait-for-live-release.mjs';

const SHA = 'a'.repeat(40);
const STALE_SHA = 'b'.repeat(40);
const silentLogger = { log() {} };

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

test('waits until the API and web both expose the exact commit', async () => {
  let apiPolls = 0;
  let webPolls = 0;
  const requested = [];
  const result = await waitForLiveRelease({
    expectedSha: SHA.toUpperCase(),
    apiUrl: 'https://api.example.invalid',
    webUrl: 'https://web.example.invalid',
    maxAttempts: 3,
    pollMs: 0,
    sleep: async () => {},
    logger: silentLogger,
    fetchImpl: async (url) => {
      requested.push(String(url));
      if (url.hostname === 'api.example.invalid') {
        apiPolls += 1;
        return response({ status: 'ok', releaseSha: apiPolls === 1 ? STALE_SHA : SHA });
      }
      webPolls += 1;
      return response({ releaseSha: webPolls < 3 ? STALE_SHA : SHA });
    },
  });

  assert.deepEqual(result, { expectedSha: SHA, attempts: 3 });
  assert.equal(apiPolls, 3);
  assert.equal(webPolls, 3);
  assert.ok(requested.every((url) => url.includes(`expected_release=${SHA}`)));
  assert.ok(requested.some((url) => url.includes('/release.json')));
});

test('fails closed when either surface remains stale or malformed', async () => {
  await assert.rejects(
    waitForLiveRelease({
      expectedSha: SHA,
      apiUrl: 'https://api.example.invalid',
      webUrl: 'https://web.example.invalid',
      maxAttempts: 2,
      pollMs: 0,
      sleep: async () => {},
      logger: silentLogger,
      fetchImpl: async (url) => url.hostname === 'api.example.invalid'
        ? response({ status: 'ok', releaseSha: SHA })
        : response('<html>stale app shell</html>'),
    }),
    /Timed out[\s\S]*web[\s\S]*not JSON/iu,
  );
});

test('rejects abbreviated SHAs and non-HTTPS deployment URLs', async () => {
  assert.equal(normalizeReleaseSha('deadbeef'), null);
  await assert.rejects(
    waitForLiveRelease({
      expectedSha: 'deadbeef',
      apiUrl: 'https://api.example.invalid',
      webUrl: 'https://web.example.invalid',
    }),
    /full 40-64 character/iu,
  );
  await assert.rejects(
    waitForLiveRelease({
      expectedSha: SHA,
      apiUrl: 'http://api.example.invalid',
      webUrl: 'https://web.example.invalid',
    }),
    /API_URL must be a valid HTTPS URL/iu,
  );
});
