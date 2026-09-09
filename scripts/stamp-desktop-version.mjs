import fs from 'node:fs';
const version = process.env.RELEASE_VERSION;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) throw new Error('RELEASE_VERSION must be numeric semver');
const file = new URL('../apps/desktop/package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
pkg.version = version;
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
