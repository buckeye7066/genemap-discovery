import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const workflowPaths = [
  '.github/workflows/web-tests.yml',
  '.github/workflows/production-smoke.yml',
];
const workflows = workflowPaths.map((relative) => ({
  relative,
  content: readFileSync(path.join(root, relative), 'utf8'),
}));

for (const { relative, content } of workflows) {
  if (/\bpull_request_target\s*:/u.test(content)) {
    throw new Error(`${relative} must not use pull_request_target`);
  }
  if (!/^permissions:\s*\n\s+contents:\s*read\s*$/mu.test(content)) {
    throw new Error(`${relative} must declare top-level contents: read permissions`);
  }
  if (!/^concurrency:\s*$/mu.test(content) || !/^\s+cancel-in-progress:\s*true\s*$/mu.test(content)) {
    throw new Error(`${relative} must cancel superseded runs`);
  }

  const uses = [...content.matchAll(/^\s*- uses:\s*([^\s#]+).*$/gmu)].map((match) => match[1]);
  for (const action of uses) {
    const ref = action.split('@')[1] || '';
    if (!/^[a-f0-9]{40}$/u.test(ref)) {
      throw new Error(`${relative} uses an unpinned action reference: ${action}`);
    }
  }
}

const webTests = workflows.find(({ relative }) => relative.endsWith('web-tests.yml')).content;
for (const required of [
  'persist-credentials: false',
  'pnpm install --frozen-lockfile',
  "node-version: '24'",
  'pnpm --filter @genemap/web test',
  'pnpm --filter @genemap/web typecheck',
  'pnpm --filter @genemap/web build',
  'verify-publication-bundle.mjs',
  'verify-publication-artifacts.mjs',
  'publication-boundary.spec.js',
]) {
  if (!webTests.includes(required)) {
    throw new Error(`Web Tests workflow is missing required gate ${JSON.stringify(required)}`);
  }
}

console.log('Publication workflows use least privilege, immutable actions, frozen installs, and exact web gates.');
