import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isExplicitNotFound,
  prepareSigningBaseline,
  publishAndroidRelease,
  runGhWithRetry,
} from '../publish-android-release.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const REPO = 'owner/repository';
const VERSION = '1.0.77';

function ghFailure(message) {
  const error = new Error(message);
  error.stderr = `gh: ${message}`;
  error.exitCode = 1;
  return error;
}

function releaseState(tag, sha) {
  return {
    tag,
    sha,
    draft: true,
    assets: [],
  };
}

test('fake-gh classifies explicit not-found output without treating generic failures as absence', () => {
  assert.equal(isExplicitNotFound(ghFailure('release not found')), true);
  assert.equal(isExplicitNotFound(ghFailure('Not Found (HTTP 404)')), true);
  assert.equal(isExplicitNotFound(ghFailure('permission denied (HTTP 403)')), false);
});

test('fake-gh retries transient inspection, treats only HTTP 404 as missing, and publishes idempotently', async () => {
  const calls = [];
  const delays = [];
  let viewAttempts = 0;
  let state = null;
  const runGh = async (args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view') {
      viewAttempts += 1;
      if (viewAttempts <= 2) throw ghFailure('service unavailable (HTTP 503)');
      if (!state) throw ghFailure('Not Found (HTTP 404)');
      return {
        stdout: JSON.stringify({
          tagName: state.tag,
          targetCommitish: state.sha,
          isDraft: state.draft,
          assets: state.assets.map((name) => ({ name })),
        }),
      };
    }
    if (args[0] === 'release' && args[1] === 'create') {
      state = releaseState(args[2], SHA);
      return { stdout: '' };
    }
    if (args[0] === 'api' && args[1].includes('/commits/')) {
      assert.equal(state.draft, false, 'a draft release has no tag ref to resolve yet');
      return { stdout: `${state.sha}\n` };
    }
    if (args[0] === 'release' && args[1] === 'upload') {
      assert.ok(args.includes('--clobber'));
      state.assets = [
        `GeneMap-${VERSION}.apk`,
        `GeneMap-${VERSION}.aab`,
        'genemap-android.sha256',
        'genemap-signing-cert.sha256',
      ];
      return { stdout: '' };
    }
    if (args[0] === 'release' && args[1] === 'edit') {
      state.draft = false;
      return { stdout: '' };
    }
    throw new Error(`Unexpected fake-gh call: ${args.join(' ')}`);
  };

  const result = await publishAndroidRelease({
    repo: REPO,
    expectedSha: SHA,
    version: VERSION,
    runGh,
    sleep: async (milliseconds) => delays.push(milliseconds),
    fileReady: () => true,
  });

  assert.equal(result.tag, `android-v${VERSION}`);
  assert.deepEqual(delays.slice(0, 2), [2_000, 4_000]);
  assert.ok(calls.some((args) => args[0] === 'release' && args[1] === 'create' && args.includes('--draft')));
  assert.ok(calls.some((args) => args[0] === 'release' && args[1] === 'edit' && args.includes('--draft=false')));
});

test('fake-gh never converts a persistent GitHub 503 into release-not-found', async () => {
  let attempts = 0;
  await assert.rejects(
    runGhWithRetry(['release', 'view', 'android-v1'], {
      runGh: async () => {
        attempts += 1;
        throw ghFailure('service unavailable (HTTP 503)');
      },
      sleep: async () => {},
      allowNotFound: true,
    }),
    /HTTP 503/u,
  );
  assert.equal(attempts, 5);
});

test('fake-gh refuses to overwrite a release tag that resolves to another commit', async () => {
  const calls = [];
  const runGh = async (args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view') {
      return {
        stdout: JSON.stringify({
          tagName: `android-v${VERSION}`,
          targetCommitish: OTHER_SHA,
          isDraft: false,
          assets: [],
        }),
      };
    }
    if (args[0] === 'api') return { stdout: `${OTHER_SHA}\n` };
    throw new Error(`Unexpected mutation: ${args.join(' ')}`);
  };

  await assert.rejects(
    publishAndroidRelease({
      repo: REPO,
      expectedSha: SHA,
      version: VERSION,
      runGh,
      sleep: async () => {},
      fileReady: () => true,
    }),
    /expected exact commit/u,
  );
  assert.equal(calls.some((args) => args[0] === 'release' && args[1] === 'upload'), false);
});

test('fake-gh refuses an existing draft that targets another exact commit', async () => {
  const calls = [];
  const runGh = async (args) => {
    calls.push(args);
    if (args[0] === 'release' && args[1] === 'view') {
      return {
        stdout: JSON.stringify({
          tagName: `android-v${VERSION}`,
          targetCommitish: OTHER_SHA,
          isDraft: true,
          assets: [],
        }),
      };
    }
    throw new Error(`Unexpected mutation: ${args.join(' ')}`);
  };

  await assert.rejects(
    publishAndroidRelease({
      repo: REPO,
      expectedSha: SHA,
      version: VERSION,
      runGh,
      sleep: async () => {},
      fileReady: () => true,
    }),
    /existing draft .* expected exact commit/iu,
  );
  assert.equal(calls.some((args) => args[0] === 'api'), false);
  assert.equal(calls.some((args) => args[0] === 'release' && args[1] === 'upload'), false);
});

test('fake-gh retries signing release list/download and uses pagination plus clobber', async () => {
  const calls = [];
  let listAttempts = 0;
  let downloadAttempts = 0;
  const runGh = async (args) => {
    calls.push(args);
    if (args[0] === 'api') {
      listAttempts += 1;
      if (listAttempts === 1) throw ghFailure('upstream unavailable (HTTP 502)');
      return {
        stdout: JSON.stringify([[
          { tag_name: 'v2.0.0', draft: false, published_at: '2026-08-17T12:00:00Z' },
          { tag_name: 'android-v1.0.70', draft: false, published_at: '2026-08-16T12:00:00Z' },
        ], [
          { tag_name: 'android-v1.0.60', draft: false, published_at: '2026-08-01T12:00:00Z' },
        ]]),
      };
    }
    if (args[0] === 'release' && args[1] === 'download') {
      downloadAttempts += 1;
      if (downloadAttempts === 1) throw ghFailure('temporary failure (HTTP 503)');
      assert.equal(args[2], 'android-v1.0.70');
      assert.ok(args.includes('--clobber'));
      return { stdout: '' };
    }
    throw new Error(`Unexpected fake-gh call: ${args.join(' ')}`);
  };

  const tag = await prepareSigningBaseline('/tmp/fake-signing-baseline', {
    repo: REPO,
    runGh,
    sleep: async () => {},
    fileReady: () => true,
  });

  assert.equal(tag, 'android-v1.0.70');
  assert.equal(listAttempts, 2);
  assert.equal(downloadAttempts, 2);
  assert.ok(calls[0].includes('--paginate') && calls[0].includes('--slurp'));
});
