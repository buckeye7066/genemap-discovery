import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const FULL_COMMIT_SHA = /^[0-9a-f]{40,64}$/u;
const DEFAULT_MAX_ATTEMPTS = 90;
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export function normalizeReleaseSha(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return FULL_COMMIT_SHA.test(normalized) ? normalized : null;
}

function productionBaseUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must be a valid HTTPS URL.`);
  parsed.search = '';
  parsed.hash = '';
  return parsed;
}

function releaseUrl(baseUrl, pathname, expectedSha, attempt) {
  const url = new URL(pathname, baseUrl);
  url.searchParams.set('expected_release', expectedSha);
  url.searchParams.set('attempt', String(attempt));
  return url;
}

async function probeRelease({
  url,
  expectedSha,
  requireHealthy,
  fetchImpl,
  fetchTimeoutMs,
}) {
  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return { matched: false, reason: `HTTP ${response.status}; response was not JSON` };
    }
    if (!response.ok) return { matched: false, reason: `HTTP ${response.status}` };
    if (requireHealthy && body?.status !== 'ok') {
      return { matched: false, reason: `status=${String(body?.status || '(missing)')}` };
    }
    const actualSha = normalizeReleaseSha(body?.releaseSha);
    if (actualSha !== expectedSha) {
      return {
        matched: false,
        reason: `releaseSha=${actualSha || '(missing or invalid)'}`,
      };
    }
    return { matched: true, releaseSha: actualSha };
  } catch (error) {
    return { matched: false, reason: `request failed: ${error?.message || 'unknown error'}` };
  }
}

export async function waitForLiveRelease(options = {}) {
  const expectedSha = normalizeReleaseSha(options.expectedSha);
  if (!expectedSha) {
    throw new Error('EXPECTED_SHA must be a full 40-64 character hexadecimal commit SHA.');
  }
  const apiUrl = productionBaseUrl(options.apiUrl, 'API_URL');
  const webUrl = productionBaseUrl(options.webUrl, 'WEB_URL');
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  }));
  const logger = options.logger || console;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 180) {
    throw new Error('maxAttempts must be an integer between 1 and 180.');
  }
  if (!Number.isInteger(pollMs) || pollMs < 0 || pollMs > 60_000) {
    throw new Error('pollMs must be an integer between 0 and 60000.');
  }

  let lastApi = 'not checked';
  let lastWeb = 'not checked';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const [api, web] = await Promise.all([
      probeRelease({
        url: releaseUrl(apiUrl, '/healthz', expectedSha, attempt),
        expectedSha,
        requireHealthy: true,
        fetchImpl,
        fetchTimeoutMs,
      }),
      probeRelease({
        url: releaseUrl(webUrl, '/release.json', expectedSha, attempt),
        expectedSha,
        requireHealthy: false,
        fetchImpl,
        fetchTimeoutMs,
      }),
    ]);
    lastApi = api.matched ? expectedSha : api.reason;
    lastWeb = web.matched ? expectedSha : web.reason;
    if (api.matched && web.matched) {
      logger.log(`Live API and web release both identify ${expectedSha}.`);
      return { expectedSha, attempts: attempt };
    }
    logger.log(
      `Attempt ${attempt}/${maxAttempts}: API ${lastApi}; web ${lastWeb}`,
    );
    if (attempt < maxAttempts) await sleep(pollMs);
  }

  throw new Error(
    `Timed out waiting for exact live release ${expectedSha}. `
    + `Last API observation: ${lastApi}. Last web observation: ${lastWeb}.`,
  );
}

function positiveInteger(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  waitForLiveRelease({
    expectedSha: process.env.EXPECTED_SHA || process.env.GITHUB_SHA,
    apiUrl: process.env.API_URL,
    webUrl: process.env.WEB_URL,
    maxAttempts: positiveInteger(process.env.LIVE_RELEASE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS),
    pollMs: positiveInteger(process.env.LIVE_RELEASE_POLL_MS, DEFAULT_POLL_MS),
  }).catch((error) => {
    console.error('::error title=Live release verification failed::API and web did not reach the requested commit.');
    console.error(error.message);
    process.exitCode = 1;
  });
}
