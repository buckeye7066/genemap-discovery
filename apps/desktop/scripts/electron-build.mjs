// electron-builder cannot locate the hoisted electron install (pnpm
// node-linker=hoisted puts it in the repo-root node_modules, not this
// workspace's), and a ^range devDependency prevents version inference.
// Resolve the actually-installed electron version here and pass it
// explicitly so the build never drifts from pnpm-lock.yaml.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;
const builderCli = require.resolve('electron-builder/cli.js');
const compatibilityEntry = fileURLToPath(
  new URL('./electron-builder-entry.cjs', import.meta.url),
);

// electron-builder shells out to `pnpm` while collecting the packaged
// dependency tree. Preserve the repository's Corepack-selected pnpm instead
// of accidentally picking up a different global version later in PATH.
const childEnv = { ...process.env };
const pathKey = Object.keys(childEnv).find((key) => key.toLowerCase() === 'path') || 'PATH';
const corepackShims = childEnv.COREPACK_ROOT
  ? path.join(childEnv.COREPACK_ROOT, 'shims')
  : null;
if (corepackShims && existsSync(corepackShims)) {
  childEnv[pathKey] = `${corepackShims}${path.delimiter}${childEnv[pathKey] || ''}`;
}

const result = spawnSync(
  process.execPath,
  [
    compatibilityEntry,
    builderCli,
    `-c.electronVersion=${electronVersion}`,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', env: childEnv },
);
process.exit(result.status ?? 1);
