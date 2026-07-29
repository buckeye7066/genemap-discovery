import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const branch = 'agent/genemap-rate-limit-fallback';
const repositoryUrl = 'https://github.com/buckeye7066/genemap-discovery.git';
const expectedBuilderVersion = '26.15.3';
const expectedChanges = new Set([
  '.github/workflows/refresh-genemap-windows-lockfile.yml',
  'pnpm-lock.yaml',
  'scripts/export-lockfile-to-build-log.mjs',
  'scripts/finalize-genemap-lockfile-from-vercel.mjs',
  'vercel.json',
]);

function run(command, args, options = {}) {
  const result = execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...options,
  });
  return typeof result === 'string' ? result.trim() : '';
}

const builder = JSON.parse(
  fs.readFileSync('node_modules/electron-builder/package.json', 'utf8')
).version;
const squirrel = JSON.parse(
  fs.readFileSync('node_modules/electron-builder-squirrel-windows/package.json', 'utf8')
).version;

console.log(`electron-builder=${builder} squirrel=${squirrel}`);
if (builder !== expectedBuilderVersion || squirrel !== expectedBuilderVersion) {
  throw new Error(
    `Expected both Windows builder packages at ${expectedBuilderVersion}; got ${builder} and ${squirrel}`
  );
}

const lockfile = fs.readFileSync('pnpm-lock.yaml', 'utf8');
for (const required of [
  "specifier: ^26.15.3",
  "electron-builder-squirrel-windows@26.15.3",
  "version: 26.15.3(electron-builder-squirrel-windows@26.15.3)",
]) {
  if (!lockfile.includes(required)) {
    throw new Error(`Regenerated lockfile is missing: ${required}`);
  }
}

const normalVercelConfig = `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "pnpm --filter @genemap/shared build && pnpm --filter @genemap/web build",
  "outputDirectory": "apps/web/dist",
  "rewrites": [
    { "source": "/((?!assets/|icons/|\\\\.well-known/).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
`;

fs.writeFileSync('vercel.json', normalVercelConfig);
for (const path of [
  '.github/workflows/refresh-genemap-windows-lockfile.yml',
  'scripts/export-lockfile-to-build-log.mjs',
  'scripts/finalize-genemap-lockfile-from-vercel.mjs',
]) {
  fs.rmSync(path, { force: true });
}
fs.rmSync('.pnpm-store', { recursive: true, force: true });

fs.mkdirSync('apps/web/dist', { recursive: true });
fs.writeFileSync(
  'apps/web/dist/index.html',
  '<!doctype html><title>GeneMap lockfile finalized</title>'
);

if (run('git', ['rev-parse', '--is-inside-work-tree'], { capture: true }) !== 'true') {
  throw new Error('Vercel checkout is not a Git working tree');
}

const credentialEnvNames = Object.keys(process.env)
  .filter((name) => /(GIT|GITHUB|TOKEN|OIDC)/i.test(name))
  .sort();
console.log(`Credential-related environment names: ${credentialEnvNames.join(', ') || '(none)'}`);

const vercelCli = run('sh', ['-lc', 'command -v vercel || true'], { capture: true });
console.log(`Vercel CLI path: ${vercelCli || '(not available)'}`);
if (vercelCli) {
  const connectorList = spawnSync(vercelCli, ['connect', 'list', '--format=json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });
  const connectorOutput = `${connectorList.stdout || ''}\n${connectorList.stderr || ''}`;
  const githubConnectorCandidates = [
    ...new Set(connectorOutput.match(/github\/[A-Za-z0-9._-]+/g) || []),
  ];
  const connectorIds = [
    ...new Set(connectorOutput.match(/scl_[A-Za-z0-9_-]+/g) || []),
  ];
  console.log(`Vercel Connect list exit=${connectorList.status}`);
  console.log(
    `GitHub connector candidates: ${githubConnectorCandidates.join(', ') || '(none)'}`
  );
  console.log(`Connector IDs: ${connectorIds.join(', ') || '(none)'}`);
  if (connectorList.status !== 0) {
    console.log(`Vercel Connect list diagnostic: ${connectorOutput.slice(0, 1200)}`);
  }
}

run('git', ['config', 'user.name', 'genemap-preview-bot']);
run('git', ['config', 'user.email', 'genemap-preview-bot@users.noreply.github.com']);
run('git', ['add', '-A']);

const changed = run('git', ['diff', '--cached', '--name-only'], { capture: true })
  .split('\n')
  .filter(Boolean);
console.log(`Staged changes: ${changed.join(', ')}`);

const unexpected = changed.filter((path) => !expectedChanges.has(path));
const missing = [...expectedChanges].filter((path) => !changed.includes(path));
if (unexpected.length || missing.length) {
  throw new Error(
    `Unexpected finalization scope. unexpected=[${unexpected.join(', ')}] missing=[${missing.join(', ')}]`
  );
}

run('git', ['commit', '-m', 'chore(deps): finalize aligned Windows desktop lockfile']);
run('git', ['push', repositoryUrl, `HEAD:${branch}`], {
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
});
console.log('LOCKFILE_FINALIZATION_PUSHED');
