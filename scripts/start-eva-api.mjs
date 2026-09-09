#!/usr/bin/env node

import { createHash, randomBytes as secureRandomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'services', 'api');
const DEFAULT_POSTGRES_PORT = 45402;
const DB_USER = 'genemap_eva';
const DB_NAME = 'genemap_eva';
const POSTGRES_TOOLS = ['initdb', 'pg_ctl', 'createdb'];
const OWNER = 'genemap-eva-disposable-v1';
const OWNER_FILE = 'owner.json';
const SAFE_INHERITED_ENV = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
  'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'LANG', 'LC_ALL', 'TZ',
  'PNPM_HOME', 'COREPACK_HOME', 'NPM_CONFIG_CACHE',
  'PORT', 'CORS_ORIGINS', 'ADMIN_EMAILS', 'LOG_LEVEL', 'EVA_POSTGRES_PORT', 'PG_BIN',
]);

function randomSecret(randomBytes) {
  return randomBytes(32).toString('hex');
}

function parsePostgresPort(value) {
  const port = Number(value ?? DEFAULT_POSTGRES_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === 5432) {
    throw new Error('EVA_POSTGRES_PORT must be an unprivileged port other than the normal PostgreSQL port 5432');
  }
  return port;
}

function safeInheritedEnvironment(source) {
  const env = {};
  for (const [name, value] of Object.entries(source || {})) {
    if (SAFE_INHERITED_ENV.has(name.toUpperCase())) env[name] = String(value);
  }
  return env;
}

/** Build an environment that cannot inherit production credentials or data. */
export function createEvaRuntimeConfig({
  source = process.env,
  root = ROOT,
  platform = process.platform,
  osRuntimeRoot = null,
  randomBytes = secureRandomBytes,
} = {}) {
  if (source.NODE_ENV === 'production') {
    throw new Error('The disposable EVA launcher refuses NODE_ENV=production');
  }

  const port = parsePostgresPort(source.EVA_POSTGRES_PORT);
  const { repoRoot, runtimeRoot, dataDir } = runtimePaths(root, { source, platform, osRuntimeRoot });
  const password = randomSecret(randomBytes);
  const env = safeInheritedEnvironment(source);

  // These values always belong to this one disposable process tree. Never
  // inherit a durable database, auth key, encryption key, or paid model key.
  env.NODE_ENV = 'development';
  env.HOST = '127.0.0.1';
  env.DATABASE_URL = `postgresql://${DB_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${DB_NAME}`;
  env.JWT_SECRET = randomSecret(randomBytes);
  env.JWT_REFRESH_SECRET = randomSecret(randomBytes);
  env.COOKIE_SECRET = randomSecret(randomBytes);
  env.CSRF_SECRET = randomSecret(randomBytes);
  env.MEDICAL_DATA_ENCRYPTION_KEY = randomSecret(randomBytes);
  env.DISABLE_MODEL_PUBLICATION = '1';
  env.SKIP_LLM_KEY_CHECK = '1';

  return { port, repoRoot, runtimeRoot, dataDir, password, env };
}

export function runtimePaths(root = ROOT, {
  source = process.env,
  platform = process.platform,
  osRuntimeRoot = null,
} = {}) {
  const repoRoot = realpathSync(resolve(root));
  const identity = platform === 'win32' ? repoRoot.toLowerCase() : repoRoot;
  const repoId = createHash('sha256').update(identity).digest('hex').slice(0, 16);
  let osAnchor;
  let evaRoot;
  let ownedAncestors;
  if (osRuntimeRoot) {
    evaRoot = resolve(osRuntimeRoot);
    osAnchor = dirname(evaRoot);
    ownedAncestors = [evaRoot];
  } else if (platform === 'win32') {
    if (!source.LOCALAPPDATA || !isAbsolute(source.LOCALAPPDATA)) {
      throw new Error('The disposable EVA launcher requires an absolute LOCALAPPDATA on Windows');
    }
    osAnchor = resolve(source.LOCALAPPDATA);
    const geneMapRoot = join(osAnchor, 'GeneMap');
    evaRoot = join(geneMapRoot, 'EVA');
    ownedAncestors = [geneMapRoot, evaRoot];
  } else {
    osAnchor = resolve(tmpdir());
    evaRoot = join(osAnchor, 'genemap-eva');
    ownedAncestors = [evaRoot];
  }
  const runtimeRoot = join(evaRoot, repoId);
  return {
    repoRoot,
    osAnchor,
    ownedAncestors,
    evaRoot,
    runtimeRoot,
    dataDir: join(runtimeRoot, 'postgres'),
    markerFile: join(runtimeRoot, OWNER_FILE),
  };
}

function executableName(name, platform) {
  return platform === 'win32' ? `${name}.exe` : name;
}

function hasPostgresTools(directory, platform) {
  return POSTGRES_TOOLS.every((name) => {
    const candidate = join(directory, executableName(name, platform));
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function windowsInstallCandidates(source) {
  const roots = [source.ProgramFiles, source['ProgramFiles(x86)'], 'C:\\Program Files']
    .filter(Boolean)
    .map((root) => join(root, 'PostgreSQL'));
  const candidates = [];
  for (const root of new Set(roots)) {
    try {
      const versions = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
      candidates.push(...versions.map((version) => join(root, version, 'bin')));
    } catch {
      // A missing conventional install root is expected on many machines.
    }
  }
  return candidates;
}

/** Locate one complete PostgreSQL installation; never mix tools across installs. */
export function findPostgresBin({ source = process.env, platform = process.platform } = {}) {
  if (source.PG_BIN) {
    const explicit = resolve(source.PG_BIN);
    if (hasPostgresTools(explicit, platform)) return explicit;
    throw new Error(`PG_BIN=${source.PG_BIN} does not contain initdb, pg_ctl, and createdb from one PostgreSQL installation`);
  }
  const pathCandidates = String(source.PATH || '')
    .split(platform === 'win32' ? ';' : ':')
    .filter(Boolean);
  const conventional = platform === 'win32'
    ? windowsInstallCandidates(source)
    : ['/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin'];
  const candidates = [...pathCandidates, ...conventional];
  const found = candidates.find((directory) => hasPostgresTools(directory, platform));
  if (found) return found;

  throw new Error('Set PG_BIN to a directory containing initdb, pg_ctl, and createdb from one PostgreSQL installation');
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: options.env || process.env,
    stdio: 'inherit',
    windowsHide: true,
    shell: options.shell || false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function assertPortAvailable(port) {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', (error) => {
      reject(new Error(`EVA PostgreSQL port 127.0.0.1:${port} is already in use (${error.code || error.message})`));
    });
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      server.close((error) => (error ? reject(error) : resolvePromise()));
    });
  });
}

function tool(binDir, name) {
  return join(binDir, executableName(name, process.platform));
}

function assertNotLink(path, label) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link`);
  }
}

function assertSafeDisposablePaths(root, options = {}) {
  const paths = runtimePaths(root, options);
  const realAnchor = realpathSync(paths.osAnchor);
  for (const [path, label] of [
    ...paths.ownedAncestors.map((path) => [path, 'EVA owned runtime ancestor']),
    [paths.runtimeRoot, 'EVA runtime root'],
    [paths.dataDir, 'EVA PostgreSQL data directory'],
  ]) {
    if (!existsSync(path)) continue;
    assertNotLink(path, label);
    const real = realpathSync(path);
    if (real !== realAnchor && !real.startsWith(`${realAnchor}${sep}`)) {
      throw new Error(`${label} resolves outside the OS runtime anchor`);
    }
  }
  return paths;
}

function removeRuntimeRoot(root, options = {}) {
  const paths = assertSafeDisposablePaths(root, options);
  rmSync(paths.runtimeRoot, { recursive: true, force: true });
}

export function writeOwnershipMarker({ repoRoot, runtimeRoot, dataDir, binDir, port }) {
  const markerFile = join(runtimeRoot, OWNER_FILE);
  const temporary = `${markerFile}.tmp`;
  const marker = {
    owner: OWNER,
    repoRoot: resolve(repoRoot),
    runtimeRoot: resolve(runtimeRoot),
    dataDir: resolve(dataDir),
    binDir: resolve(binDir),
    port,
  };
  writeFileSync(temporary, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  renameSync(temporary, markerFile);
}

function runPgCtl(binDir, dataDir, args, platform, run = spawnSync) {
  const result = run(join(binDir, executableName('pg_ctl', platform)), [...args, '-D', dataDir], {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  return result;
}

/** Stop and remove only the cluster whose marker matches the fixed EVA path. */
export function stopOwnedEvaRuntime({
  root = ROOT,
  source = process.env,
  platform = process.platform,
  osRuntimeRoot = null,
  run = spawnSync,
} = {}) {
  const pathOptions = { source, platform, osRuntimeRoot };
  const paths = assertSafeDisposablePaths(root, pathOptions);
  if (!existsSync(paths.runtimeRoot)) return false;

  if (!existsSync(paths.markerFile)) {
    if (existsSync(join(paths.dataDir, 'postmaster.pid'))) {
      throw new Error('EVA PostgreSQL data has a postmaster.pid but no ownership marker; refusing cleanup');
    }
    removeRuntimeRoot(root, pathOptions);
    return false;
  }

  let marker;
  try {
    marker = JSON.parse(readFileSync(paths.markerFile, 'utf8'));
  } catch (error) {
    throw new Error(`EVA PostgreSQL ownership marker is unreadable: ${error.message}`);
  }
  if (
    marker.owner !== OWNER
    || resolve(marker.repoRoot || '') !== paths.repoRoot
    || resolve(marker.runtimeRoot || '') !== paths.runtimeRoot
    || resolve(marker.dataDir || '') !== paths.dataDir
    || !Number.isInteger(marker.port)
  ) {
    throw new Error('EVA PostgreSQL ownership marker does not match the disposable runtime path');
  }
  if (!hasPostgresTools(marker.binDir, platform)) {
    throw new Error('EVA PostgreSQL ownership marker names an incomplete PostgreSQL installation');
  }

  const stopped = runPgCtl(marker.binDir, paths.dataDir, ['stop', '-m', 'fast', '-w', '-t', '30'], platform, run);
  if (stopped?.error || stopped?.status === null || stopped?.status === undefined) {
    throw new Error('pg_ctl stop failed; could not prove the owned EVA PostgreSQL cluster stopped');
  }
  if (stopped.status !== 0) {
    const status = runPgCtl(marker.binDir, paths.dataDir, ['status'], platform, run);
    if (status?.error || status?.status !== 3) {
      throw new Error('pg_ctl could not prove the owned EVA PostgreSQL cluster is not running; preserving its data directory');
    }
  }
  removeRuntimeRoot(root, pathOptions);
  return true;
}

export function migrationCommand({ root = ROOT, node = process.execPath } = {}) {
  return {
    command: node,
    args: [join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    cwd: join(root, 'services', 'api'),
  };
}

export function apiCommand({ node = process.execPath } = {}) {
  return { command: node, args: ['src/index.js'] };
}

export async function startEvaApi() {
  const config = createEvaRuntimeConfig();
  const binDir = findPostgresBin();
  stopOwnedEvaRuntime();
  await assertPortAvailable(config.port);

  removeRuntimeRoot(ROOT);
  mkdirSync(config.runtimeRoot, { recursive: true, mode: 0o700 });
  assertSafeDisposablePaths(ROOT);
  const passwordFile = join(config.runtimeRoot, 'postgres-password');
  const postgresLog = join(config.runtimeRoot, 'postgres.log');
  let api = null;

  try {
    writeFileSync(passwordFile, `${config.password}\n`, { encoding: 'utf8', mode: 0o600 });
    try {
      runChecked(tool(binDir, 'initdb'), [
        '-D', config.dataDir,
        '--username', DB_USER,
        '--pwfile', passwordFile,
        '--auth-local=trust',
        '--auth-host=scram-sha-256',
        '--encoding=UTF8',
      ]);
    } finally {
      rmSync(passwordFile, { force: true });
    }

    writeOwnershipMarker({
      repoRoot: config.repoRoot,
      runtimeRoot: config.runtimeRoot,
      dataDir: config.dataDir,
      binDir,
      port: config.port,
    });

    runChecked(tool(binDir, 'pg_ctl'), [
      'start', '-D', config.dataDir,
      '-l', postgresLog,
      '-w', '-t', '60',
      '-o', `-h 127.0.0.1 -p ${config.port}`,
    ]);
    runChecked(tool(binDir, 'createdb'), [
      '--host', '127.0.0.1',
      '--port', String(config.port),
      '--username', DB_USER,
      '--owner', DB_USER,
      DB_NAME,
    ], { env: { ...config.env, PGPASSWORD: config.password } });

    const migrate = migrationCommand();
    runChecked(
      migrate.command,
      migrate.args,
      { env: config.env, cwd: migrate.cwd },
    );

    const apiLaunch = apiCommand();
    api = spawn(apiLaunch.command, apiLaunch.args, {
      cwd: API_DIR,
      env: config.env,
      stdio: 'inherit',
      windowsHide: true,
    });

    const forwardSignal = (signal) => {
      if (api && !api.killed) api.kill(signal);
    };
    process.once('SIGINT', forwardSignal);
    process.once('SIGTERM', forwardSignal);
    const [code, signal] = await new Promise((resolvePromise, reject) => {
      api.once('error', reject);
      api.once('exit', (exitCode, exitSignal) => resolvePromise([exitCode, exitSignal]));
    });
    process.removeListener('SIGINT', forwardSignal);
    process.removeListener('SIGTERM', forwardSignal);
    if (signal) process.exitCode = 1;
    else process.exitCode = code ?? 1;
  } finally {
    if (api && api.exitCode === null && !api.killed) api.kill('SIGTERM');
    if (existsSync(join(config.runtimeRoot, OWNER_FILE))) stopOwnedEvaRuntime();
    else removeRuntimeRoot(ROOT);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  startEvaApi().catch((error) => {
    console.error(`[eva] ${error.message}`);
    process.exitCode = 1;
  });
}
