// electron-builder cannot locate the hoisted electron install (pnpm
// node-linker=hoisted puts it in the repo-root node_modules, not this
// workspace's), and a ^range devDependency prevents version inference.
// Resolve the actually-installed electron version here and pass it
// explicitly so the build never drifts from pnpm-lock.yaml.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;
const builderCli = require.resolve('electron-builder/cli.js');

const result = spawnSync(
  process.execPath,
  [builderCli, `-c.electronVersion=${electronVersion}`, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
