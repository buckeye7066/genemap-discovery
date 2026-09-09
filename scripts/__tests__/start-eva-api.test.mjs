import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

let runtime;
try {
  runtime = await import('../start-eva-api.mjs');
} catch (error) {
  assert.fail(`EVA runtime launcher must exist: ${error.message}`);
}

test('builds fresh disposable auth and database configuration without inheriting credentials', () => {
  let byte = 0;
  const root = process.cwd();
  const config = runtime.createEvaRuntimeConfig({
    source: {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://production.invalid/real',
      JWT_SECRET: 'real-jwt-secret-that-must-not-be-reused',
      JWT_REFRESH_SECRET: 'real-refresh-secret-that-must-not-be-reused',
      COOKIE_SECRET: 'real-cookie-secret-that-must-not-be-reused',
      OPENAI_API_KEY: 'paid-openai-key',
      GOOGLE_AI_API_KEY: 'unknown-paid-provider-key',
      MYSTERY_AUTH_TOKEN: 'unknown-auth-token',
      EVA_POSTGRES_PORT: '45402',
      LOCALAPPDATA: process.env.LOCALAPPDATA,
    },
    root,
    randomBytes: (size) => Buffer.alloc(size, byte += 1),
  });

  assert.equal(config.port, 45402);
  assert.match(config.env.DATABASE_URL, /^postgresql:\/\/genemap_eva:/);
  assert.match(config.env.DATABASE_URL, /@127\.0\.0\.1:45402\/genemap_eva$/);
  assert.equal(config.env.JWT_SECRET, Buffer.alloc(32, 2).toString('hex'));
  assert.equal(config.env.JWT_REFRESH_SECRET, Buffer.alloc(32, 3).toString('hex'));
  assert.equal(config.env.COOKIE_SECRET, Buffer.alloc(32, 4).toString('hex'));
  assert.doesNotMatch(config.env.DATABASE_URL, /production\.invalid|real-jwt/u);
  assert.equal(config.env.OPENAI_API_KEY, undefined);
  assert.equal(config.env.GOOGLE_AI_API_KEY, undefined);
  assert.equal(config.env.MYSTERY_AUTH_TOKEN, undefined);
  assert.equal(config.dataDir, runtime.runtimePaths(root).dataDir);
});

test('refuses the disposable launcher in production mode', () => {
  assert.throws(
    () => runtime.createEvaRuntimeConfig({ source: { NODE_ENV: 'production' }, root: '/repo' }),
    /refuses NODE_ENV=production/u,
  );
});

test('keeps the owned PostgreSQL runtime outside the checkout with a stable per-checkout id', () => {
  const root = mkdtempSync(join(tmpdir(), 'genemap-eva-repo-'));
  const osRuntimeRoot = join(root, '..', 'genemap-eva-os-runtime');
  try {
    const first = runtime.runtimePaths(root, { osRuntimeRoot });
    const second = runtime.runtimePaths(root, { osRuntimeRoot });
    assert.equal(first.runtimeRoot, second.runtimeRoot);
    assert.equal(first.runtimeRoot.startsWith(root), false);
    mkdirSync(first.runtimeRoot, { recursive: true });
    writeFileSync(first.markerFile, 'owned', 'utf8');
    mkdirSync(join(root, '.eva-tmp'), { recursive: true });
    rmSync(join(root, '.eva-tmp'), { recursive: true, force: true });
    assert.equal(readFileSync(first.markerFile, 'utf8'), 'owned');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(osRuntimeRoot, { recursive: true, force: true });
  }
});

test('finds an explicitly configured PostgreSQL bin directory only when all tools exist', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'genemap-pg-bin-'));
  try {
    for (const name of ['initdb', 'pg_ctl', 'createdb']) {
      writeFileSync(join(fixture, name), '', 'utf8');
    }
    assert.equal(
      runtime.findPostgresBin({ source: { PG_BIN: fixture }, platform: 'linux' }),
      fixture,
    );
    rmSync(join(fixture, 'createdb'));
    assert.throws(
      () => runtime.findPostgresBin({ source: { PG_BIN: fixture }, platform: 'linux' }),
      /initdb, pg_ctl, and createdb/u,
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('does not accept the service or an invalid PostgreSQL port', () => {
  for (const value of ['5432', '0', 'not-a-port']) {
    assert.throws(
      () => runtime.createEvaRuntimeConfig({ source: { EVA_POSTGRES_PORT: value }, root: '/repo' }),
      /EVA_POSTGRES_PORT/u,
    );
  }
});

test('starts the API without loading a repository env file', () => {
  assert.deepEqual(runtime.apiCommand({ node: '/node' }), {
    command: '/node',
    args: ['src/index.js'],
  });
});

test('launches the installed Prisma CLI directly without a command shell', () => {
  const root = join(tmpdir(), 'genemap-migration-root');
  assert.deepEqual(runtime.migrationCommand({ root, node: '/node' }), {
    command: '/node',
    args: [join(root, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    cwd: join(root, 'services', 'api'),
  });
});

test('the package start:eva command owns database startup and cleanup', () => {
  const pkg = JSON.parse(readFileSync(new URL('../../services/api/package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['start:eva'], /start-eva-api\.mjs/u);
  assert.doesNotMatch(pkg.scripts['start:eva'], /src\/index\.js/u);
  assert.match(pkg.scripts['stop:eva'], /stop-eva-api\.mjs/u);
});

test('an explicit stop removes only a marker-owned disposable cluster', () => {
  const root = mkdtempSync(join(tmpdir(), 'genemap-eva-stop-'));
  const ownerBase = mkdtempSync(join(tmpdir(), 'genemap-eva-owner-'));
  const osRuntimeRoot = join(ownerBase, 'runtime');
  const { repoRoot, runtimeRoot, dataDir } = runtime.runtimePaths(root, { osRuntimeRoot, platform: 'linux' });
  const binDir = join(root, 'pg-bin');
  try {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(join(root, 'sentinel'), 'keep', 'utf8');
    for (const name of ['initdb', 'createdb']) {
      writeFileSync(join(binDir, name), '', 'utf8');
    }
    writeFileSync(join(binDir, 'pg_ctl'), '', 'utf8');
    runtime.writeOwnershipMarker({ repoRoot, runtimeRoot, dataDir, binDir, port: 45402 });

    assert.equal(runtime.stopOwnedEvaRuntime({
      root,
      osRuntimeRoot,
      platform: 'linux',
      run: () => ({ status: 0 }),
    }), true);
    assert.equal(readFileSync(join(root, 'sentinel'), 'utf8'), 'keep');
    assert.equal(runtime.runtimePaths(root, { osRuntimeRoot, platform: 'linux' }).runtimeRoot, runtimeRoot);
    assert.throws(() => readFileSync(runtimeRoot), /ENOENT/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(ownerBase, { recursive: true, force: true });
  }
});

test('a stopped markerless runtime is removed from the selected OS runtime root', () => {
  const root = mkdtempSync(join(tmpdir(), 'genemap-eva-markerless-'));
  const ownerBase = mkdtempSync(join(tmpdir(), 'genemap-eva-owner-'));
  const osRuntimeRoot = join(ownerBase, 'runtime');
  const { runtimeRoot } = runtime.runtimePaths(root, { osRuntimeRoot, platform: 'linux' });
  try {
    mkdirSync(runtimeRoot, { recursive: true });
    writeFileSync(join(runtimeRoot, 'completed-init'), 'safe to remove', 'utf8');
    assert.equal(
      runtime.stopOwnedEvaRuntime({ root, osRuntimeRoot, platform: 'linux' }),
      false,
    );
    assert.equal(existsSync(runtimeRoot), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(ownerBase, { recursive: true, force: true });
  }
});

test('an ownership marker can never redirect cleanup outside the disposable root', () => {
  const root = mkdtempSync(join(tmpdir(), 'genemap-eva-marker-'));
  const ownerBase = mkdtempSync(join(tmpdir(), 'genemap-eva-owner-'));
  const osRuntimeRoot = join(ownerBase, 'runtime');
  const { repoRoot, runtimeRoot } = runtime.runtimePaths(root, { osRuntimeRoot, platform: 'linux' });
  try {
    mkdirSync(runtimeRoot, { recursive: true });
    writeFileSync(join(runtimeRoot, 'owner.json'), JSON.stringify({
      owner: 'genemap-eva-disposable-v1',
      repoRoot,
      runtimeRoot,
      dataDir: join(root, 'real-database'),
      binDir: join(root, 'pg-bin'),
      port: 45402,
    }), 'utf8');
    assert.throws(
      () => runtime.stopOwnedEvaRuntime({ root, osRuntimeRoot, platform: 'linux' }),
      /ownership marker does not match/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(ownerBase, { recursive: true, force: true });
  }
});

test('preserves owned data when pg_ctl cannot prove the server is stopped', () => {
  const root = mkdtempSync(join(tmpdir(), 'genemap-eva-stop-error-'));
  const ownerBase = mkdtempSync(join(tmpdir(), 'genemap-eva-owner-'));
  const osRuntimeRoot = join(ownerBase, 'runtime');
  const { repoRoot, runtimeRoot, dataDir } = runtime.runtimePaths(root, { osRuntimeRoot, platform: 'linux' });
  const binDir = join(root, 'pg-bin');
  try {
    mkdirSync(dataDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    for (const name of ['initdb', 'pg_ctl', 'createdb']) writeFileSync(join(binDir, name), '', 'utf8');
    runtime.writeOwnershipMarker({ repoRoot, runtimeRoot, dataDir, binDir, port: 45402 });
    const run = (_command, args) => ({ status: args[0] === 'status' ? 4 : 1 });
    assert.throws(
      () => runtime.stopOwnedEvaRuntime({ root, osRuntimeRoot, platform: 'linux', run }),
      /could not prove/u,
    );
    assert.equal(existsSync(runtimeRoot), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(ownerBase, { recursive: true, force: true });
  }
});

test('refuses cleanup through a linked OS runtime ancestor', () => {
  const root = mkdtempSync(join(tmpdir(), 'genemap-eva-link-root-'));
  const ownerBase = mkdtempSync(join(tmpdir(), 'genemap-eva-owner-'));
  const osRuntimeRoot = join(ownerBase, 'runtime');
  const target = mkdtempSync(join(tmpdir(), 'genemap-eva-link-target-'));
  try {
    writeFileSync(join(target, 'sentinel'), 'keep', 'utf8');
    symlinkSync(target, osRuntimeRoot, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(
      () => runtime.stopOwnedEvaRuntime({ root, osRuntimeRoot }),
      /symbolic link|outside/u,
    );
    assert.equal(readFileSync(join(target, 'sentinel'), 'utf8'), 'keep');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(ownerBase, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});
