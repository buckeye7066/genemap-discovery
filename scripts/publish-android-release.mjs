import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_ATTEMPTS = 5;
const COMMAND_TIMEOUT_MS = 120_000;
const RETRYABLE_STATUS = /\bHTTP (?:408|429|500|502|503|504)\b/iu;
const RETRYABLE_NETWORK = /(?:connection (?:reset|refused)|ECONNRESET|ETIMEDOUT|TLS handshake|unexpected EOF|timeout|temporarily unavailable)/iu;
const NOT_FOUND = /(?:\bHTTP 404\b|\brelease not found\b)/iu;
const ALREADY_EXISTS = /(?:\bHTTP 422\b.*(?:already[_ -]?exists|already been taken)|already exists)/isu;

function commandLabel(args) {
  return `gh ${args.join(' ')}`;
}

function failureText(error) {
  return [error?.stdout, error?.stderr, error?.message]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function commandError(args, error) {
  const wrapped = new Error(`${commandLabel(args)} failed: ${failureText(error) || 'unknown error'}`);
  wrapped.args = args;
  wrapped.stdout = error?.stdout || '';
  wrapped.stderr = error?.stderr || '';
  wrapped.exitCode = error?.code ?? error?.exitCode ?? 1;
  return wrapped;
}

async function defaultRunGh(args, options = {}) {
  try {
    return await execFileAsync('gh', args, {
      encoding: 'utf8',
      timeout: options.timeoutMs || COMMAND_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    throw commandError(args, error);
  }
}

export function isExplicitNotFound(error) {
  return NOT_FOUND.test(failureText(error));
}

export function isTransientGitHubFailure(error) {
  const text = failureText(error);
  return RETRYABLE_STATUS.test(text) || RETRYABLE_NETWORK.test(text);
}

function isAlreadyExists(error) {
  return ALREADY_EXISTS.test(failureText(error));
}

function retryDelay(attempt) {
  return 2_000 * (2 ** (attempt - 1));
}

function retryBudget(value) {
  const requested = value ?? MAX_ATTEMPTS;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new Error('GitHub retry attempts must be a positive integer.');
  }
  return Math.min(requested, MAX_ATTEMPTS);
}

export async function runGhWithRetry(args, options = {}) {
  const runGh = options.runGh || defaultRunGh;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  }));
  const maxAttempts = retryBudget(options.maxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runGh(args, { timeoutMs: options.commandTimeoutMs || COMMAND_TIMEOUT_MS });
    } catch (error) {
      if (options.allowNotFound && isExplicitNotFound(error)) {
        return { notFound: true, stdout: error?.stdout || '', stderr: error?.stderr || '' };
      }
      const retryable = isTransientGitHubFailure(error);
      console.warn(
        `${commandLabel(args)} failed on attempt ${attempt}/${maxAttempts}: ${failureText(error)}`,
      );
      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(retryDelay(attempt));
    }
  }
  throw new Error(`${commandLabel(args)} exhausted its retry budget.`);
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(String(stdout || '').trim());
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

async function inspectRelease(tag, options) {
  const result = await runGhWithRetry([
    'release',
    'view',
    tag,
    '--repo',
    options.repo,
    '--json',
    'tagName,targetCommitish,isDraft,assets',
  ], { ...options, allowNotFound: true });
  if (result.notFound) return null;
  const release = parseJson(result.stdout, `GitHub release ${tag}`);
  if (release.tagName !== tag) {
    throw new Error(`GitHub returned release ${release.tagName || '(missing tag)'}, expected ${tag}.`);
  }
  return release;
}

async function resolveTagCommit(tag, options) {
  const result = await runGhWithRetry([
    'api',
    `repos/${options.repo}/commits/${encodeURIComponent(tag)}`,
    '--jq',
    '.sha',
  ], options);
  const sha = String(result.stdout || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40,64}$/u.test(sha)) {
    throw new Error(`GitHub tag ${tag} resolved to an invalid commit SHA: ${sha || '(empty)'}.`);
  }
  return sha;
}

async function assertExactTagCommit(tag, expectedSha, options) {
  const actual = await resolveTagCommit(tag, options);
  if (actual !== expectedSha) {
    throw new Error(`Existing ${tag} resolves to ${actual}, expected exact commit ${expectedSha}.`);
  }
}

async function createDraftRelease(tag, title, notes, expectedSha, options) {
  const args = [
    'release',
    'create',
    tag,
    '--repo',
    options.repo,
    '--target',
    expectedSha,
    '--title',
    title,
    '--notes',
    notes,
    '--draft',
  ];
  const runGh = options.runGh || defaultRunGh;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolveSleep) => {
    setTimeout(resolveSleep, milliseconds);
  }));
  const maxAttempts = retryBudget(options.maxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runGh(args, { timeoutMs: options.commandTimeoutMs || COMMAND_TIMEOUT_MS });
      return;
    } catch (error) {
      const retryable = isTransientGitHubFailure(error);
      const reconcilable = retryable || isAlreadyExists(error);
      console.warn(
        `${commandLabel(args)} failed on attempt ${attempt}/${maxAttempts}: ${failureText(error)}`,
      );
      if (!reconcilable) throw error;

      try {
        const release = await inspectRelease(tag, { ...options, maxAttempts: 1 });
        if (release) return;
      } catch (inspectionError) {
        if (!isTransientGitHubFailure(inspectionError)) throw inspectionError;
      }

      if (!retryable || attempt === maxAttempts) throw error;
      await sleep(retryDelay(attempt));
    }
  }
}

function requireReleaseInput({ repo, expectedSha, version }) {
  if (!/^[^/\s]+\/[^/\s]+$/u.test(repo || '')) {
    throw new Error('GITHUB_REPOSITORY must use owner/repository format.');
  }
  if (!/^[0-9a-f]{40,64}$/u.test(expectedSha || '')) {
    throw new Error('GITHUB_SHA must be a full hexadecimal commit SHA.');
  }
  if (!/^[0-9A-Za-z._-]+$/u.test(version || '')) {
    throw new Error('ANDROID_VERSION_NAME contains unsupported characters.');
  }
}

function requireAssets(assets, options) {
  const fileReady = options.fileReady || ((path) => (
    existsSync(path) && statSync(path).isFile() && statSync(path).size > 0
  ));
  for (const asset of assets) {
    if (!fileReady(asset)) throw new Error(`Android release asset is missing or empty: ${asset}`);
  }
}

export async function publishAndroidRelease(options = {}) {
  const repo = options.repo || process.env.GITHUB_REPOSITORY;
  const expectedSha = String(options.expectedSha || process.env.GITHUB_SHA || '').trim().toLowerCase();
  const version = options.version || process.env.ANDROID_VERSION_NAME;
  requireReleaseInput({ repo, expectedSha, version });

  const tag = `android-v${version}`;
  const title = `GeneMap Android ${version}`;
  const notes = `Automated signed Android release from main at ${expectedSha}. Package com.genemap.discovery. Intended for repo-direct phone updates; Android requires the same signing certificate as the installed copy.`;
  const assets = [
    `GeneMap-${version}.apk`,
    `GeneMap-${version}.aab`,
    'genemap-android.sha256',
    'genemap-signing-cert.sha256',
  ];
  requireAssets(assets, options);

  const shared = { ...options, repo };
  let release = await inspectRelease(tag, shared);
  if (!release) {
    await createDraftRelease(tag, title, notes, expectedSha, shared);
    release = await inspectRelease(tag, shared);
    if (!release) throw new Error(`GitHub did not return ${tag} after release creation.`);
  }

  await assertExactTagCommit(tag, expectedSha, shared);
  await runGhWithRetry([
    'release',
    'upload',
    tag,
    ...assets,
    '--repo',
    repo,
    '--clobber',
  ], shared);
  await runGhWithRetry([
    'release',
    'edit',
    tag,
    '--repo',
    repo,
    '--title',
    title,
    '--notes',
    notes,
    '--draft=false',
  ], shared);

  const verified = await inspectRelease(tag, shared);
  await assertExactTagCommit(tag, expectedSha, shared);
  if (!verified || verified.isDraft) {
    throw new Error(`${tag} was not published after upload.`);
  }
  const uploadedNames = new Set((verified.assets || []).map((asset) => asset?.name));
  const missing = assets.filter((asset) => !uploadedNames.has(asset));
  if (missing.length) {
    throw new Error(`${tag} is missing uploaded assets: ${missing.join(', ')}`);
  }

  console.log(`Published ${tag} for exact commit ${expectedSha} with ${assets.length} verified assets.`);
  return { tag, expectedSha, assets };
}

export async function prepareSigningBaseline(outputDir, options = {}) {
  const repo = options.repo || process.env.GITHUB_REPOSITORY;
  if (!/^[^/\s]+\/[^/\s]+$/u.test(repo || '')) {
    throw new Error('GITHUB_REPOSITORY must use owner/repository format.');
  }
  if (!outputDir) throw new Error('A signing-baseline output directory is required.');
  const shared = { ...options, repo };
  const result = await runGhWithRetry([
    'api',
    '--paginate',
    '--slurp',
    `repos/${repo}/releases?per_page=100`,
  ], shared);
  const pages = parseJson(result.stdout, 'GitHub release list');
  const releases = (Array.isArray(pages) ? pages : [])
    .flatMap((page) => (Array.isArray(page) ? page : [page]))
    .filter((release) => !release?.draft && String(release?.tag_name || '').startsWith('android-v'))
    .sort((left, right) => (
      Date.parse(right.published_at || right.created_at || 0)
      - Date.parse(left.published_at || left.created_at || 0)
    ));
  const tag = releases[0]?.tag_name || null;
  if (!tag) {
    console.log('No prior signed Android release; this build will establish the fingerprint.');
    return null;
  }

  mkdirSync(outputDir, { recursive: true });
  await runGhWithRetry([
    'release',
    'download',
    tag,
    '--repo',
    repo,
    '--pattern',
    'genemap-signing-cert.sha256',
    '--dir',
    outputDir,
    '--clobber',
  ], shared);
  const fingerprint = resolve(outputDir, 'genemap-signing-cert.sha256');
  const fileReady = options.fileReady || ((path) => (
    existsSync(path) && statSync(path).isFile() && statSync(path).size > 0
  ));
  if (!fileReady(fingerprint)) {
    throw new Error(`Existing Android release ${tag} lacks a signing fingerprint asset.`);
  }
  console.log(`Downloaded signing fingerprint from ${tag}.`);
  return tag;
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const [mode = 'publish', outputDir] = process.argv.slice(2);
  const operation = mode === 'publish'
    ? publishAndroidRelease()
    : mode === 'signing-baseline'
      ? prepareSigningBaseline(outputDir)
      : Promise.reject(new Error(`Unknown Android release operation: ${mode}`));
  operation.catch((error) => {
    console.error(`::error title=Android release operation failed::${error.message}`);
    process.exitCode = 1;
  });
}
