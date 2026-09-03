import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);
const FAILED_STATUSES = new Set(['FAILED', 'CRASHED', 'REMOVED']);
const DEFAULT_MAX_ATTEMPTS = 60;
const DEFAULT_POLL_MS = 15_000;
const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const LOG_LIMIT = 100;
const LOG_OUTPUT_LIMIT = 12_000;

function normalizeSha(value) {
  return String(value || '').trim().toLowerCase();
}

function errorOutput(error) {
  return [error?.stdout, error?.stderr, error?.message]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function bounded(value, maximum = LOG_OUTPUT_LIMIT) {
  const text = String(value || '');
  return text.length > maximum
    ? `${text.slice(0, maximum)}\n[output truncated at ${maximum} characters]`
    : text;
}

export function redactDiagnostic(value) {
  return String(value || '')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~-]+/giu, '$1 ***')
    .replace(/\b(password|secret|token|authorization|api[_-]?key)\s*[=:]\s*[^\s,;]+/giu, '$1=***')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+@/giu, '$1***@');
}

async function defaultRunRailway(args, options = {}) {
  return execFileAsync('railway', args, {
    encoding: 'utf8',
    timeout: options.timeoutMs || DEFAULT_COMMAND_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  });
}

export function parseDeploymentList(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(String(stdout || '').trim());
  } catch (error) {
    throw new Error(`Railway deployment list did not return JSON: ${error.message}`);
  }
  const deployments = Array.isArray(parsed) ? parsed : parsed?.deployments;
  if (!Array.isArray(deployments)) {
    throw new Error('Railway deployment list JSON must be an array.');
  }
  return deployments;
}

export function deploymentForCommit(deployments, expectedSha) {
  const wanted = normalizeSha(expectedSha);
  return deployments.find((deployment) => (
    normalizeSha(deployment?.meta?.commitHash) === wanted
  )) || null;
}

export async function readDeploymentLogs(options) {
  const {
    deploymentId,
    service,
    runRailway = defaultRunRailway,
    commandTimeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  } = options;
  const sections = [];
  for (const [label, flag] of [['build', '--build'], ['deploy', '--deployment']]) {
    const args = [
      'logs',
      flag,
      '--lines',
      String(LOG_LIMIT),
      '--service',
      service,
      deploymentId,
    ];
    try {
      const result = await runRailway(args, { timeoutMs: commandTimeoutMs });
      sections.push(`${label} logs:\n${bounded(result?.stdout || result?.stderr || '(no output)')}`);
    } catch (error) {
      sections.push(`${label} logs unavailable:\n${bounded(errorOutput(error))}`);
    }
  }
  return bounded(sections.join('\n\n'));
}

export async function verifyLiveRelease(options) {
  const {
    apiUrl,
    expectedSha,
    fetchImpl = globalThis.fetch,
    fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  } = options;
  const healthUrl = `${String(apiUrl).replace(/\/+$/, '')}/healthz`;
  try {
    const response = await fetchImpl(healthUrl, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(fetchTimeoutMs),
    });
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return { verified: false, reason: `live /healthz returned non-JSON (${response.status})` };
    }
    if (!response.ok || body?.status !== 'ok') {
      return { verified: false, reason: `live /healthz was not healthy (${response.status})` };
    }
    const liveSha = normalizeSha(body.releaseSha);
    if (liveSha !== normalizeSha(expectedSha)) {
      return {
        verified: false,
        reason: `live releaseSha ${liveSha || '(missing)'} did not match ${normalizeSha(expectedSha)}`,
      };
    }
    return { verified: true, releaseSha: liveSha };
  } catch (error) {
    return { verified: false, reason: `live /healthz request failed: ${error.message}` };
  }
}

export async function monitorRailwayDeployment(options = {}) {
  const expectedSha = normalizeSha(options.expectedSha || process.env.GITHUB_SHA);
  const service = options.service || process.env.RAILWAY_SERVICE || 'genemap-api';
  const apiUrl = options.apiUrl || process.env.API_URL || process.env.PRODUCTION_API_URL;
  const runRailway = options.runRailway || defaultRunRailway;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  }));
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;

  if (!/^[0-9a-f]{40,64}$/u.test(expectedSha)) {
    throw new Error(`GITHUB_SHA must be a full hexadecimal commit SHA. Received: ${expectedSha}`);
  }
  if (!apiUrl || !/^https:\/\//iu.test(apiUrl)) {
    throw new Error('API_URL must be the HTTPS URL of the production API.');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > DEFAULT_MAX_ATTEMPTS) {
    throw new Error(`maxAttempts must be between 1 and ${DEFAULT_MAX_ATTEMPTS}.`);
  }

  let lastObservation = 'no matching deployment observed';
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let deployments;
    try {
      const result = await runRailway([
        'deployment',
        'list',
        '--service',
        service,
        '--limit',
        '100',
        '--json',
      ], { timeoutMs: commandTimeoutMs });
      deployments = parseDeploymentList(result?.stdout);
    } catch (error) {
      lastObservation = `Railway CLI error: ${bounded(errorOutput(error), 1000)}`;
      console.warn(`Attempt ${attempt}/${maxAttempts}: ${lastObservation}`);
      if (attempt < maxAttempts) await sleep(pollMs);
      continue;
    }

    const deployment = deploymentForCommit(deployments, expectedSha);
    if (!deployment) {
      const newestSha = normalizeSha(deployments[0]?.meta?.commitHash);
      lastObservation = newestSha
        ? `newest deployment belongs to ${newestSha}, not ${expectedSha}`
        : `no deployment reported meta.commitHash=${expectedSha}`;
    } else {
      const status = String(deployment.status || 'UNKNOWN').toUpperCase();
      lastObservation = `deployment ${deployment.id || '(missing id)'} is ${status}`;
      if (FAILED_STATUSES.has(status)) {
        const logs = deployment.id
          ? await readDeploymentLogs({ deploymentId: deployment.id, service, runRailway, commandTimeoutMs })
          : 'Deployment ID was absent, so logs could not be requested.';
        throw new Error(
          `Railway deployment for ${expectedSha} failed with status ${status}.\n${logs}`,
        );
      }
      if (status === 'SUCCESS') {
        const live = await verifyLiveRelease({ apiUrl, expectedSha, fetchImpl, fetchTimeoutMs });
        if (live.verified) {
          console.log(
            `Railway deployment ${deployment.id} and live /healthz both identify ${expectedSha}.`,
          );
          console.log(`Exact deployed SHA: ${live.releaseSha}`);
          return { deployment, releaseSha: live.releaseSha, attempts: attempt };
        }
        lastObservation = `${lastObservation}; ${live.reason}`;
      }
    }

    console.log(`Attempt ${attempt}/${maxAttempts}: ${lastObservation}`);
    if (attempt < maxAttempts) await sleep(pollMs);
  }

  throw new Error(
    `No successful live Railway deployment for exact commit ${expectedSha} was verified after `
    + `${maxAttempts} attempts. Last observation: ${lastObservation}`,
  );
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  monitorRailwayDeployment().catch((error) => {
    console.error('::error title=Railway deployment verification failed::The exact deployment did not become healthy.');
    console.error(redactDiagnostic(bounded(error?.message || error)));
    process.exitCode = 1;
  });
}
