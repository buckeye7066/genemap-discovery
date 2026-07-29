import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const branch = 'agent/genemap-rate-limit-fallback';
const repository = 'buckeye7066/genemap-discovery';
const repositoryUrl = `https://github.com/${repository}.git`;
const projectId = 'prj_G9SOCfU1TOokRwm8cDczraPXLEKw';
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

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
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

const oidcToken = process.env.VERCEL_OIDC_TOKEN;
if (!oidcToken) {
  throw new Error('VERCEL_OIDC_TOKEN is unavailable');
}

const connectorListResponse = await fetch(
  `https://api.vercel.com/v1/connect/connectors?projectId=${encodeURIComponent(projectId)}&type=github`,
  {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${oidcToken}`,
    },
  }
);
const connectorList = await readJsonResponse(connectorListResponse);
console.log(`Vercel Connect list status=${connectorListResponse.status}`);
if (!connectorListResponse.ok) {
  const code = connectorList.json?.error?.code || connectorList.json?.code || 'unknown';
  const message = connectorList.json?.error?.message || connectorList.json?.message || 'request failed';
  throw new Error(`Unable to list linked Connect connectors: ${code}: ${message}`);
}

const clients = Array.isArray(connectorList.json?.clients)
  ? connectorList.json.clients
  : Array.isArray(connectorList.json?.connectors)
    ? connectorList.json.connectors
    : [];
const githubConnectors = clients.filter(
  (client) =>
    typeof client?.uid === 'string' &&
    (client.uid.startsWith('github/') || String(client.type).toLowerCase().includes('github'))
);
console.log(
  `Linked GitHub connectors: ${
    githubConnectors.map((client) => `${client.uid} (${client.id})`).join(', ') || '(none)'
  }`
);
if (githubConnectors.length !== 1) {
  throw new Error(`Expected exactly one linked GitHub connector; found ${githubConnectors.length}`);
}

const connector = githubConnectors[0];
const tokenResponse = await fetch(
  `https://api.vercel.com/v1/connect/token/${encodeURIComponent(connector.uid)}`,
  {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${oidcToken}`,
    },
    body: JSON.stringify({
      subject: { type: 'app' },
      authorizationDetails: [
        {
          type: 'github_app_installation',
          repositories: [repository],
          permissions: ['contents:write'],
        },
      ],
    }),
  }
);
const tokenResult = await readJsonResponse(tokenResponse);
console.log(`Vercel Connect token status=${tokenResponse.status}`);
if (!tokenResponse.ok || typeof tokenResult.json?.token !== 'string') {
  const code = tokenResult.json?.error?.code || tokenResult.json?.code || 'unknown';
  const message = tokenResult.json?.error?.message || tokenResult.json?.message || 'request failed';
  throw new Error(`Unable to obtain scoped GitHub token: ${code}: ${message}`);
}
const githubToken = tokenResult.json.token;

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

const askpassPath = '/tmp/genemap-git-askpass.sh';
fs.writeFileSync(
  askpassPath,
  `#!/bin/sh\ncase "$1" in\n  *Username*) printf '%s\\n' 'x-access-token' ;;\n  *Password*) printf '%s\\n' "$GENEMAP_GITHUB_TOKEN" ;;\n  *) exit 1 ;;\nesac\n`,
  { mode: 0o700 }
);
try {
  run('git', ['push', repositoryUrl, `HEAD:${branch}`], {
    env: {
      ...process.env,
      GENEMAP_GITHUB_TOKEN: githubToken,
      GIT_ASKPASS: askpassPath,
      GIT_TERMINAL_PROMPT: '0',
    },
  });
} finally {
  fs.rmSync(askpassPath, { force: true });
}
console.log('LOCKFILE_FINALIZATION_PUSHED');
