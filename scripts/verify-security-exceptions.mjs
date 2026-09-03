import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const EXCEPTIONS = [
  {
    id: 'GHSA-qwww-vcr4-c8h2',
    packageName: 'react-router',
    reviewBy: '2026-10-01',
    reason:
      'RSC-mode CSRF. GeneMap Discovery is a Vite client-side SPA and does not ship React Server Components, server actions, or a React Router framework-mode server runtime.',
    realFix:
      'Migrate React 18 to React >=19.2.7 and React Router to >=8.3.0 after the application and desktop/mobile shells are verified together.',
  },
];

const FORBIDDEN_RSC_PACKAGES = [
  '@react-router/node',
  '@react-router/serve',
  '@vitejs/plugin-rsc',
  'react-server-dom-parcel',
  'react-server-dom-turbopack',
  'react-server-dom-vite',
  'react-server-dom-webpack',
];

function readJson(relativePath) {
  const absolutePath = resolve(ROOT, relativePath);
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${relativePath}: ${error.message}`);
  }
}

const rootPackage = readJson('package.json');
const webPackage = readJson('apps/web/package.json');
const ignored = rootPackage.pnpm?.auditConfig?.ignoreGhsas ?? [];
const expected = EXCEPTIONS.map(({ id }) => id);

assert.deepEqual(
  [...ignored].sort(),
  [...expected].sort(),
  'pnpm.auditConfig.ignoreGhsas must contain exactly the reviewed, expiring exceptions in this script',
);

const today = new Date().toISOString().slice(0, 10);
for (const exception of EXCEPTIONS) {
  assert.ok(
    exception.reviewBy >= today,
    `${exception.id} audit exception expired on ${exception.reviewBy}. Re-assess or complete the real upgrade before releasing.`,
  );
  assert.ok(exception.reason.length >= 40, `${exception.id} is missing a substantive reason`);
  assert.ok(exception.realFix.length >= 40, `${exception.id} is missing a substantive remediation path`);
}

assert.equal(
  webPackage.scripts?.build,
  'vite build',
  'The React Router exception is valid only while the web app remains a Vite client-side build',
);

const webDependencies = {
  ...(webPackage.dependencies ?? {}),
  ...(webPackage.devDependencies ?? {}),
  ...(webPackage.optionalDependencies ?? {}),
};
for (const packageName of FORBIDDEN_RSC_PACKAGES) {
  assert.ok(
    !(packageName in webDependencies),
    `${packageName} enables an RSC/server runtime and invalidates ${expected.join(', ')}`,
  );
}

const routerVersion = webPackage.dependencies?.['react-router-dom'];
assert.ok(routerVersion, 'react-router-dom is missing from apps/web/package.json');
assert.ok(
  String(routerVersion).includes('7.'),
  'The documented exception posture must be re-assessed when React Router leaves major version 7',
);

for (const exception of EXCEPTIONS) {
  console.log(
    `[security-exception] ALLOWED ${exception.id} (${exception.packageName}) until ${exception.reviewBy}: ${exception.reason} Real fix: ${exception.realFix}`,
  );
}
console.log('[security-exception] OK: exception list, expiry, and Vite SPA posture verified.');
